import type { FastifyInstance } from "fastify";
import type { Address, Hex } from "viem";
import { z } from "zod";
import { analyzeInvoice, InvoiceInput, PaymentRefused } from "@vaultos/agent";
import { explainRevert, failedChecks, invoiceIdFor, parseUsdc } from "@vaultos/sdk";
import { db } from "../db";
import { AGENT_ADDRESS, agentWallet, publicClient } from "../chain";
import { env } from "../env";
import { requireAuth } from "../auth";
import { syncTreasury } from "../indexer";
import { ownedTreasury } from "./core";

async function audit(treasuryId: string, invoiceId: string, stage: string, detail: unknown) {
  await db.auditLog.create({ data: { treasuryId, invoiceId, stage, detail: detail as never } });
}

export async function invoiceRoutes(app: FastifyInstance) {
  app.register(async (r) => {
    r.addHook("preHandler", requireAuth);

    r.get("/treasuries/:address/invoices", async (req, reply) => {
      const t = await ownedTreasury(req.wallet, (req.params as { address: string }).address);
      if (!t) return reply.code(404).send({ error: "Treasury not found." });
      return db.invoice.findMany({ where: { treasuryId: t.id }, orderBy: { createdAt: "desc" }, include: { paymentRequest: true } });
    });

    // Approvals screen: only payments that are queued on-chain and waiting for the owner.
    r.get("/treasuries/:address/approvals", async (req, reply) => {
      const t = await ownedTreasury(req.wallet, (req.params as { address: string }).address);
      if (!t) return reply.code(404).send({ error: "Treasury not found." });
      return db.paymentRequest.findMany({
        where: { treasuryId: t.id, status: "PENDING", onchainRequestId: { not: null } },
        orderBy: { createdAt: "desc" },
        include: { invoice: { include: { recipient: true } } },
      });
    });

    r.post("/treasuries/:address/invoices", async (req, reply) => {
      const t = await ownedTreasury(req.wallet, (req.params as { address: string }).address);
      if (!t) return reply.code(404).send({ error: "Treasury not found." });
      const parsed = InvoiceInput.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
      const inv = parsed.data;
      if (parseUsdc(inv.amount) === 0n) return reply.code(400).send({ error: "Amount must be greater than zero." });

      const chainInvoiceId = invoiceIdFor(t.address, inv.supplierAddress, inv.invoiceNumber);
      const dup = await db.invoice.findUnique({ where: { treasuryId_chainInvoiceId: { treasuryId: t.id, chainInvoiceId } } });
      if (dup) return reply.code(409).send({ error: `Invoice ${inv.invoiceNumber} from this supplier was already submitted.` });

      const recipient = await db.recipient.findUnique({
        where: { treasuryId_walletAddress: { treasuryId: t.id, walletAddress: inv.supplierAddress.toLowerCase() } },
      });
      const row = await db.invoice.create({
        data: {
          treasuryId: t.id,
          recipientId: recipient?.id,
          supplierName: inv.supplierName,
          supplierAddress: inv.supplierAddress.toLowerCase(),
          invoiceNumber: inv.invoiceNumber,
          chainInvoiceId,
          amount: parseUsdc(inv.amount),
          description: inv.description,
          dueDate: inv.dueDate,
        },
      });
      await audit(t.id, row.id, "SUBMITTED", { invoiceNumber: inv.invoiceNumber, amount: inv.amount, supplier: inv.supplierName });
      return reply.code(201).send(row);
    });

    // Stages 1-4: parse, identify supplier, read policy context from chain, decide.
    r.post("/invoices/:id/analyze", async (req, reply) => {
      const inv = await loadInvoice(req.wallet, (req.params as { id: string }).id);
      if (!inv) return reply.code(404).send({ error: "Invoice not found." });
      if (!["PENDING", "APPROVED", "AWAITING_HUMAN_APPROVAL", "REJECTED", "FAILED"].includes(inv.status) || inv.paymentRequest)
        return reply.code(409).send({ error: `Invoice is already ${inv.status}.` });

      await db.invoice.update({ where: { id: inv.id }, data: { status: "ANALYZING" } });
      try {
        const a = await analyzeInvoice(publicClient, {
          treasury: inv.treasury.address as Address,
          agent: AGENT_ADDRESS,
          invoice: {
            supplierName: inv.supplierName,
            supplierAddress: inv.supplierAddress,
            invoiceNumber: inv.invoiceNumber,
            amount: (Number(inv.amount) / 1e6).toFixed(6).replace(/\.?0+$/, "") || "0",
            dueDate: inv.dueDate,
            description: inv.description,
          },
        });
        const status = a.decision.decision === "AUTONOMOUS_APPROVAL" ? "APPROVED" : a.decision.decision === "HUMAN_APPROVAL" ? "AWAITING_HUMAN_APPROVAL" : "REJECTED";
        const updated = await db.invoice.update({
          where: { id: inv.id },
          data: {
            status,
            agentDecision: { ...a.decision, explanationSource: a.explanationSource } as never,
            failureReason: status === "REJECTED" ? a.decision.reason : null,
          },
        });
        await audit(inv.treasuryId, inv.id, "AGENT_DECISION", { ...a.decision, explanationSource: a.explanationSource });
        await audit(inv.treasuryId, inv.id, "POLICY_RESULT", { checks: a.context.checks, blockers: a.decision.blockers });
        return updated;
      } catch (e) {
        await db.invoice.update({ where: { id: inv.id }, data: { status: "FAILED", failureReason: (e as Error).message } });
        return reply.code(502).send({ error: `Analysis failed: ${(e as Error).message}` });
      }
    });

    // Stage 5: the agent asks the contract. The contract, not this code, decides.
    r.post("/invoices/:id/execute", async (req, reply) => {
      const inv = await loadInvoice(req.wallet, (req.params as { id: string }).id);
      if (!inv) return reply.code(404).send({ error: "Invoice not found." });
      const body = z.object({ attack: z.boolean().optional() }).parse(req.body ?? {});
      const decision = inv.agentDecision as { decision?: string } | null;
      if (!decision?.decision) return reply.code(409).send({ error: "Analyze the invoice first." });
      if (inv.paymentRequest) return reply.code(409).send({ error: "This invoice already has a payment in flight." });

      const treasury = inv.treasury.address as Address;
      const recipient = inv.supplierAddress as Address;
      const chainId = inv.chainInvoiceId as Hex;

      // Red-team mode (PRD demo scene 5): the agent tries anyway, even though it decided REJECT.
      // Dry-run through the real contract — proves the chain, not the AI, is the authority.
      if (body.attack) {
        if (env.ENABLE_ATTACK_SIMULATION !== "true") return reply.code(403).send({ error: "Attack simulation is disabled." });
        const sim = await agentWallet.simulate("executePayment", treasury, recipient, inv.amount, chainId);
        const { readPolicyContext } = await import("@vaultos/agent");
        const ctx = await readPolicyContext(publicClient, { treasury, agent: AGENT_ADDRESS, recipient, amount: inv.amount, invoiceId: chainId });
        const reasons = failedChecks(ctx.checks).map(explainRevert);
        if (sim.ok) return reply.code(409).send({ error: "The contract would accept this payment; it is not an attack." });
        await db.invoice.update({ where: { id: inv.id }, data: { status: "REJECTED", failureReason: `Blocked by treasury contract: ${sim.message}` } });
        await db.transaction.create({
          data: {
            treasuryId: inv.treasuryId, type: "BLOCKED", amount: inv.amount, recipient, recipientName: inv.supplierName,
            invoiceRef: inv.invoiceNumber, agent: AGENT_ADDRESS.toLowerCase(), status: "BLOCKED",
            policyNote: reasons.join(" · ") || sim.message,
          },
        });
        await audit(inv.treasuryId, inv.id, "CONTRACT_REFUSED", { code: sim.code, reasons });
        return { blocked: true, code: sim.code, reasons };
      }

      if (decision.decision === "REJECT") return reply.code(409).send({ error: "The agent rejected this invoice; nothing to execute." });

      const kind = decision.decision === "AUTONOMOUS_APPROVAL" ? "executePayment" : "requestPayment";
      await db.invoice.update({ where: { id: inv.id }, data: { status: kind === "executePayment" ? "EXECUTING" : "AWAITING_HUMAN_APPROVAL" } });
      await audit(inv.treasuryId, inv.id, "CONTRACT_REQUEST", { kind });
      try {
        const res = await agentWallet.submit(kind, treasury, recipient, inv.amount, chainId);
        await db.paymentRequest.create({
          data: {
            treasuryId: inv.treasuryId, invoiceId: inv.id, onchainRequestId: res.requestId, amount: inv.amount, recipient,
            agentDecision: decision.decision, approvalRequired: kind === "requestPayment",
            status: res.executed ? "EXECUTED" : "PENDING", requestTxHash: res.txHash, executionTxHash: res.executed ? res.txHash : null,
          },
        });
        await syncTreasury(treasury); // indexer flips the invoice to PAID and records the feed
        if (kind === "requestPayment")
          await db.transaction.upsert({
            where: { txHash_logIndex: { txHash: res.txHash, logIndex: -1 } },
            create: {
              treasuryId: inv.treasuryId, type: "REQUEST", amount: inv.amount, recipient, recipientName: inv.supplierName,
              invoiceRef: inv.invoiceNumber, requestId: res.requestId, agent: AGENT_ADDRESS.toLowerCase(), txHash: res.txHash,
              logIndex: -1, status: "PENDING", policyNote: "Awaiting owner approval",
            },
            update: {},
          });
        return db.invoice.findUnique({ where: { id: inv.id }, include: { paymentRequest: true } });
      } catch (e) {
        const reason = e instanceof PaymentRefused ? e.message : (e as Error).message;
        await db.invoice.update({ where: { id: inv.id }, data: { status: "FAILED", failureReason: reason } });
        await audit(inv.treasuryId, inv.id, "CONTRACT_REFUSED", { reason });
        return reply.code(422).send({ error: reason });
      }
    });

    r.get("/invoices/:id/trail", async (req, reply) => {
      const inv = await loadInvoice(req.wallet, (req.params as { id: string }).id);
      if (!inv) return reply.code(404).send({ error: "Invoice not found." });
      return db.auditLog.findMany({ where: { invoiceId: inv.id }, orderBy: { createdAt: "asc" } });
    });
  });
}

async function loadInvoice(wallet: string, id: string) {
  const inv = await db.invoice.findUnique({ where: { id }, include: { treasury: { include: { owner: true } }, paymentRequest: true } });
  if (!inv || inv.treasury.owner.walletAddress !== wallet) return null;
  return inv;
}
