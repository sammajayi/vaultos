import type { FastifyInstance } from "fastify";
import type { Address, Hex } from "viem";
import { z } from "zod";
import { db } from "../db";
import { AGENT_ADDRESS, FACTORY, USDC, chain, networkName, publicClient } from "../chain";
import { env } from "../env";
import { issueToken, requireAuth, verifyLogin } from "../auth";
import { cachePolicy, isFactoryTreasury, readState } from "../treasuryState";
import { syncTreasury } from "../indexer";
import { recipientMetadataHash } from "@vaultos/sdk";

export const addrSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/).transform((s) => s.toLowerCase());

/** Loads a treasury and enforces that the signed-in wallet owns it. */
export async function ownedTreasury(wallet: string, address: string) {
  const t = await db.treasury.findUnique({ where: { address: address.toLowerCase() }, include: { owner: true } });
  if (!t || t.owner.walletAddress !== wallet) return null;
  return t;
}

export async function coreRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({ ok: true }));

  // Public, non-secret deployment info the web app needs (never includes any key).
  app.get("/config", async () => ({
    network: networkName,
    chainId: chain.id,
    rpcUrl: env.ARC_RPC_URL,
    explorerUrl: chain.blockExplorers?.default.url ?? null,
    factory: FACTORY,
    usdc: USDC,
    agentAddress: AGENT_ADDRESS,
    attackSimulation: env.ENABLE_ATTACK_SIMULATION === "true",
    researchAgent: env.RESEARCH_AGENT_ADDRESS ?? null,
    researchPrice: "0.25",
  }));

  app.post("/auth/login", async (req, reply) => {
    const body = z.object({ address: addrSchema, issuedAt: z.string(), signature: z.string().regex(/^0x[0-9a-fA-F]+$/) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: "Invalid login request." });
    const ok = await verifyLogin(body.data.address, body.data.issuedAt, body.data.signature as Hex).catch(() => false);
    if (!ok) return reply.code(401).send({ error: "Signature check failed." });
    await db.user.upsert({ where: { walletAddress: body.data.address }, create: { walletAddress: body.data.address }, update: {} });
    return { token: issueToken(body.data.address), address: body.data.address };
  });

  app.register(async (r) => {
    r.addHook("preHandler", requireAuth);

    // Register a treasury the wallet created via the factory. Ownership is verified on-chain.
    r.post("/treasuries", async (req, reply) => {
      const body = z.object({ address: addrSchema, creationTxHash: z.string().optional() }).safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "Invalid treasury address." });
      const address = body.data.address as Address;

      if (!(await isFactoryTreasury(address))) return reply.code(400).send({ error: "Not a VaultOS treasury." });
      const state = await readState(address);
      if (state.owner !== req.wallet) return reply.code(403).send({ error: "You are not the owner of this treasury." });

      const head = await publicClient.getBlockNumber({ cacheTime: 0 });
      let deployBlock = head > 5000n ? head - 5000n : 0n;
      if (body.data.creationTxHash) {
        const rc = await publicClient.getTransactionReceipt({ hash: body.data.creationTxHash as Hex }).catch(() => null);
        if (rc) deployBlock = rc.blockNumber;
      }
      const user = await db.user.upsert({ where: { walletAddress: req.wallet }, create: { walletAddress: req.wallet }, update: {} });
      const t = await db.treasury.upsert({
        where: { address },
        create: { address, ownerId: user.id, network: networkName, deployBlock },
        update: {},
      });
      await cachePolicy(t.id, state.policy);
      await db.agent.upsert({
        where: { treasuryId_address: { treasuryId: t.id, address: AGENT_ADDRESS.toLowerCase() } },
        create: { treasuryId: t.id, address: AGENT_ADDRESS.toLowerCase(), name: "Payment Agent", status: state.agent.active ? "ACTIVE" : "REVOKED" },
        update: { status: state.agent.active ? "ACTIVE" : "REVOKED" },
      });
      await syncTreasury(address);
      return { address: t.address };
    });

    r.get("/treasuries", async (req) => {
      const rows = await db.treasury.findMany({ where: { owner: { walletAddress: req.wallet } }, orderBy: { createdAt: "desc" } });
      return rows.map((t) => ({ address: t.address, network: t.network, createdAt: t.createdAt }));
    });

    r.get("/treasuries/:address", async (req, reply) => {
      const { address } = req.params as { address: string };
      const t = await ownedTreasury(req.wallet, address);
      if (!t) return reply.code(404).send({ error: "Treasury not found." });
      const state = await readState(t.address as Address);
      await cachePolicy(t.id, state.policy);
      const [pending, invoices, recipients] = await Promise.all([
        db.paymentRequest.count({ where: { treasuryId: t.id, status: "PENDING" } }),
        db.invoice.groupBy({ by: ["status"], where: { treasuryId: t.id }, _count: true }),
        db.recipient.count({ where: { treasuryId: t.id } }),
      ]);
      return {
        address: t.address,
        network: t.network,
        ...state,
        pendingApprovals: pending,
        activeAgents: state.agent.active ? 1 : 0,
        recipients,
        invoiceCounts: Object.fromEntries(invoices.map((g) => [g.status, g._count])),
      };
    });

    r.post("/treasuries/:address/sync", async (req, reply) => {
      const { address } = req.params as { address: string };
      const t = await ownedTreasury(req.wallet, address);
      if (!t) return reply.code(404).send({ error: "Treasury not found." });
      const res = await syncTreasury(t.address);
      const state = await readState(t.address as Address);
      await cachePolicy(t.id, state.policy);
      return { ok: true, syncedTo: res.syncedTo };
    });

    r.get("/treasuries/:address/agents", async (req, reply) => {
      const { address } = req.params as { address: string };
      const t = await ownedTreasury(req.wallet, address);
      if (!t) return reply.code(404).send({ error: "Treasury not found." });
      const state = await readState(t.address as Address);
      return [
        {
          name: "Payment Agent",
          address: AGENT_ADDRESS,
          status: !state.agent.active ? "REVOKED" : state.paused ? "PAUSED" : state.agent.expiresAt !== 0n && state.agent.expiresAt * 1000n < BigInt(Date.now()) ? "EXPIRED" : "ACTIVE",
          expiresAt: state.agent.expiresAt,
          authority: { perTransaction: state.policy.approvalThreshold, daily: state.policy.dailyLimit, monthly: state.policy.monthlyLimit },
          spentToday: state.spentToday,
        },
      ];
    });

    r.get("/treasuries/:address/recipients", async (req, reply) => {
      const { address } = req.params as { address: string };
      const t = await ownedTreasury(req.wallet, address);
      if (!t) return reply.code(404).send({ error: "Treasury not found." });
      const { recipientsWithLiveStatus } = await import("../treasuryState");
      return recipientsWithLiveStatus(t.id, t.address as Address);
    });

    // Step 1 of adding a supplier: store the readable record and return the hash to put on-chain.
    r.post("/treasuries/:address/recipients", async (req, reply) => {
      const { address } = req.params as { address: string };
      const t = await ownedTreasury(req.wallet, address);
      if (!t) return reply.code(404).send({ error: "Treasury not found." });
      const body = z
        .object({ name: z.string().trim().min(1).max(120), walletAddress: addrSchema, category: z.string().trim().min(1).max(80) })
        .safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "Invalid supplier details." });
      const row = await db.recipient.upsert({
        where: { treasuryId_walletAddress: { treasuryId: t.id, walletAddress: body.data.walletAddress } },
        create: { treasuryId: t.id, ...body.data },
        update: { name: body.data.name, category: body.data.category },
      });
      return { ...row, metadataHash: recipientMetadataHash(row.name, row.category) };
    });

    r.get("/treasuries/:address/transactions", async (req, reply) => {
      const { address } = req.params as { address: string };
      const t = await ownedTreasury(req.wallet, address);
      if (!t) return reply.code(404).send({ error: "Treasury not found." });
      const q = z.object({ limit: z.coerce.number().min(1).max(200).default(100) }).parse(req.query);
      return db.transaction.findMany({ where: { treasuryId: t.id }, orderBy: [{ timestamp: "desc" }, { logIndex: "desc" }], take: q.limit });
    });
  });
}
