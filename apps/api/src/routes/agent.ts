import type { FastifyInstance } from "fastify";
import type { Address, Hex } from "viem";
import { z } from "zod";
import { RESEARCH_PRICE, analyzeInvoice, PaymentRefused, researchAnswer, verifyResearchPayment } from "@vaultos/agent";
import { formatUsdc, invoiceIdFor } from "@vaultos/sdk";
import { db } from "../db";
import { AGENT_ADDRESS, agentWallet, publicClient } from "../chain";
import { env } from "../env";
import { requireAuth } from "../auth";
import { syncTreasury } from "../indexer";
import { addrSchema, ownedTreasury } from "./core";

export async function agentRoutes(app: FastifyInstance) {
  app.register(async (r) => {
    r.addHook("preHandler", requireAuth);

    // The MVP's plain contract with the agent: { recipient, amount, description } in,
    // { decision, reason } out. Read-only: nothing is stored and nothing is sent on-chain.
    r.post("/treasuries/:address/agent/decide", async (req, reply) => {
      const t = await ownedTreasury(req.wallet, (req.params as { address: string }).address);
      if (!t) return reply.code(404).send({ error: "Treasury not found." });
      const body = z
        .object({ recipient: addrSchema, amount: z.string().regex(/^\d+(\.\d{1,6})?$/), description: z.string().max(500).default("") })
        .safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "Send { recipient, amount, description }." });

      const known = await db.recipient.findUnique({ where: { treasuryId_walletAddress: { treasuryId: t.id, walletAddress: body.data.recipient } } });
      try {
        const a = await analyzeInvoice(publicClient, {
          treasury: t.address as Address,
          agent: AGENT_ADDRESS,
          invoice: {
            supplierName: known?.name ?? "Unknown recipient",
            supplierAddress: body.data.recipient,
            invoiceNumber: `REQ-${Date.now()}`,
            amount: body.data.amount,
            dueDate: "n/a",
            description: body.data.description,
          },
        });
        return { decision: a.decision.decision, reason: a.decision.reason, checks: a.decision.checks, blockers: a.decision.blockers };
      } catch (e) {
        return reply.code(502).send({ error: `Analysis failed: ${(e as Error).message}` });
      }
    });

    // Agent-to-agent: the Payment Agent buys one answer from the Research Agent for $0.25.
    // The payment goes through the same treasury, so every policy rule (allowlist, limits, pause) applies.
    r.post("/treasuries/:address/research", async (req, reply) => {
      const t = await ownedTreasury(req.wallet, (req.params as { address: string }).address);
      if (!t) return reply.code(404).send({ error: "Treasury not found." });
      const research = env.RESEARCH_AGENT_ADDRESS as Address | undefined;
      if (!research) return reply.code(501).send({ error: "No Research Agent is configured on this server." });
      const body = z.object({ question: z.string().trim().min(3).max(500) }).safeParse(req.body);
      if (!body.success) return reply.code(400).send({ error: "Ask a question of at least 3 characters." });

      const treasury = t.address as Address;
      const invoiceNumber = `RQ-${Date.now()}`;
      const invoiceId = invoiceIdFor(treasury, research, invoiceNumber);

      const a = await analyzeInvoice(publicClient, {
        treasury,
        agent: AGENT_ADDRESS,
        invoice: {
          supplierName: "Research Agent",
          supplierAddress: research,
          invoiceNumber,
          amount: formatUsdc(RESEARCH_PRICE),
          dueDate: "on delivery",
          description: "One research answer",
        },
      });
      if (a.decision.decision !== "AUTONOMOUS_APPROVAL") {
        const hint = a.decision.blockers.includes("RECIPIENT_NOT_APPROVED") ? " Approve the Research Agent as a supplier first." : "";
        return reply.code(409).send({ error: `Payment not allowed: ${a.decision.reason}${hint}`, decision: a.decision.decision, blockers: a.decision.blockers });
      }

      try {
        const paid = await agentWallet.submit("executePayment", treasury, research, RESEARCH_PRICE, invoiceId);
        // Ensure a readable name in the activity feed, then let the indexer record the payment.
        await db.recipient.upsert({
          where: { treasuryId_walletAddress: { treasuryId: t.id, walletAddress: research.toLowerCase() } },
          create: { treasuryId: t.id, walletAddress: research.toLowerCase(), name: "Research Agent", category: "Agent services", status: "APPROVED" },
          update: {},
        });
        await syncTreasury(treasury);

        // The Research Agent side: verify on-chain before delivering.
        const verified = await verifyResearchPayment(publicClient, { treasury, txHash: paid.txHash as Hex, researchAgent: research, invoiceId });
        if (!verified) return reply.code(502).send({ error: "Payment could not be verified on-chain, so no answer was delivered." });
        const out = await researchAnswer(body.data.question);
        return { paid: true, amount: formatUsdc(RESEARCH_PRICE), txHash: paid.txHash, answer: out.answer, source: out.source, from: AGENT_ADDRESS, to: research };
      } catch (e) {
        if (e instanceof PaymentRefused) return reply.code(422).send({ error: e.message });
        throw e;
      }
    });
  });
}
