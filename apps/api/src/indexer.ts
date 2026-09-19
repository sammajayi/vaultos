import { decodeEventLog, type Address, type Log } from "viem";
import { TreasuryAbi } from "@vaultos/sdk";
import { db } from "./db";
import { publicClient } from "./chain";

const CHUNK = 5_000n;

/**
 * Rebuilds off-chain state from the treasury's own events (PRD §14: events are the foundation of
 * the activity feed). Idempotent: safe to call after any transaction, or repeatedly.
 */
export async function syncTreasury(treasuryAddress: string) {
  const treasury = await db.treasury.findUniqueOrThrow({ where: { address: treasuryAddress.toLowerCase() } });
  const latest = await publicClient.getBlockNumber({ cacheTime: 0 }); // viem caches block numbers; a stale head would skip fresh events
  let from = treasury.lastSyncedBlock > treasury.deployBlock ? treasury.lastSyncedBlock + 1n : treasury.deployBlock;

  const recipients = await db.recipient.findMany({ where: { treasuryId: treasury.id } });
  const nameOf = (a?: string | null) => recipients.find((r) => r.walletAddress === a?.toLowerCase())?.name ?? null;
  const blockTime = new Map<bigint, Date>();
  const tsOf = async (bn: bigint) => {
    if (!blockTime.has(bn)) {
      const b = await publicClient.getBlock({ blockNumber: bn });
      blockTime.set(bn, new Date(Number(b.timestamp) * 1000));
    }
    return blockTime.get(bn)!;
  };

  while (from <= latest) {
    const to = from + CHUNK - 1n > latest ? latest : from + CHUNK - 1n;
    const logs = await publicClient.getLogs({ address: treasury.address as Address, fromBlock: from, toBlock: to });
    for (const log of logs) await ingest(treasury.id, log, tsOf, nameOf);
    from = to + 1n;
  }

  await db.treasury.update({ where: { id: treasury.id }, data: { lastSyncedBlock: latest } });
  return { syncedTo: latest };
}

async function ingest(
  treasuryId: string,
  log: Log,
  tsOf: (b: bigint) => Promise<Date>,
  nameOf: (a?: string | null) => string | null,
) {
  let ev;
  try {
    ev = decodeEventLog({ abi: TreasuryAbi, data: log.data, topics: log.topics });
  } catch {
    return; // e.g. OwnershipTransferred from OZ base contracts is in the ABI; anything else is ignored
  }
  const txHash = log.transactionHash!;
  const logIndex = log.logIndex!;
  const blockNumber = log.blockNumber!;
  const timestamp = await tsOf(blockNumber);
  const base = { treasuryId, txHash, logIndex, blockNumber, timestamp, status: "CONFIRMED" };
  const record = (data: Record<string, unknown>) =>
    db.transaction.upsert({
      where: { txHash_logIndex: { txHash, logIndex } },
      create: { ...base, ...data } as never,
      update: {},
    });

  switch (ev.eventName) {
    case "Deposited":
      await record({ type: "DEPOSIT", amount: ev.args.amount, recipient: ev.args.from.toLowerCase() });
      break;
    case "Withdrawn":
      await record({ type: "WITHDRAWAL", amount: ev.args.amount, recipient: ev.args.to.toLowerCase() });
      break;
    case "PaymentRequested": {
      const invoice = await invoiceByChainId(treasuryId, ev.args.invoiceId);
      await db.paymentRequest.updateMany({
        where: { treasuryId, invoiceId: invoice?.id ?? "" },
        data: { onchainRequestId: ev.args.requestId, requestTxHash: txHash },
      });
      break;
    }
    case "PaymentExecuted": {
      const invoice = await invoiceByChainId(treasuryId, ev.args.invoiceId);
      const to = ev.args.recipient.toLowerCase();
      await record({
        type: "PAYMENT",
        amount: ev.args.amount,
        recipient: to,
        recipientName: invoice?.supplierName ?? nameOf(to),
        invoiceRef: invoice?.invoiceNumber,
        requestId: ev.args.requestId,
        policyNote: ev.args.humanApproved ? "Owner approved" : "Autonomous — within policy",
      });
      if (invoice) {
        await db.invoice.update({ where: { id: invoice.id }, data: { status: "PAID", failureReason: null } });
        await db.paymentRequest.updateMany({
          where: { invoiceId: invoice.id },
          data: { status: "EXECUTED", executionTxHash: txHash, onchainRequestId: ev.args.requestId },
        });
        await db.auditLog.create({
          data: { treasuryId, invoiceId: invoice.id, stage: "SETTLED", detail: { txHash, humanApproved: ev.args.humanApproved } },
        });
      }
      break;
    }
    case "PaymentRejected": {
      const pr = await db.paymentRequest.findFirst({ where: { treasuryId, onchainRequestId: ev.args.requestId }, include: { invoice: true } });
      await record({
        type: "REJECTION",
        requestId: ev.args.requestId,
        amount: pr?.amount,
        recipient: pr?.recipient,
        recipientName: pr?.invoice.supplierName,
        invoiceRef: pr?.invoice.invoiceNumber,
        policyNote: "Owner rejected",
      });
      if (pr) {
        await db.paymentRequest.update({ where: { id: pr.id }, data: { status: "REJECTED" } });
        await db.invoice.update({ where: { id: pr.invoiceId }, data: { status: "REJECTED", failureReason: "Rejected by treasury owner." } });
      }
      break;
    }
    case "TreasuryPaused":
      await record({ type: "PAUSE", policyNote: "Emergency pause — all agent payments blocked" });
      break;
    case "TreasuryUnpaused":
      await record({ type: "UNPAUSE", policyNote: "Treasury resumed" });
      break;
    case "PolicyUpdated":
      await record({ type: "POLICY", policyNote: "Spending policy updated" });
      break;
    case "RecipientAdded":
      await record({ type: "RECIPIENT", recipient: ev.args.recipient.toLowerCase(), recipientName: nameOf(ev.args.recipient), policyNote: "Recipient approved" });
      break;
    case "RecipientRemoved":
      await record({ type: "RECIPIENT", recipient: ev.args.recipient.toLowerCase(), recipientName: nameOf(ev.args.recipient), policyNote: "Recipient removed" });
      break;
    case "AgentAuthorized":
      await record({ type: "AGENT", agent: ev.args.agent.toLowerCase(), policyNote: "Agent authorized" });
      break;
    case "AgentRevoked":
      await record({ type: "AGENT", agent: ev.args.agent.toLowerCase(), policyNote: "Agent revoked" });
      break;
  }
}

const invoiceByChainId = (treasuryId: string, chainInvoiceId: string) =>
  db.invoice.findUnique({ where: { treasuryId_chainInvoiceId: { treasuryId, chainInvoiceId } } });
