import type { Address } from "viem";
import { TreasuryAbi, TreasuryFactoryAbi } from "@vaultos/sdk";
import { AGENT_ADDRESS, FACTORY, publicClient } from "./chain";
import { db } from "./db";

/** Live, authoritative state straight from the contract. */
export async function readState(address: Address) {
  const base = { address, abi: TreasuryAbi } as const;
  const [owner, policy, paused, balance, spentToday, spentThisMonth, agent] = await Promise.all([
    publicClient.readContract({ ...base, functionName: "owner" }),
    publicClient.readContract({ ...base, functionName: "policy" }),
    publicClient.readContract({ ...base, functionName: "paused" }),
    publicClient.readContract({ ...base, functionName: "balance" }),
    publicClient.readContract({ ...base, functionName: "spentToday" }),
    publicClient.readContract({ ...base, functionName: "spentThisMonth" }),
    publicClient.readContract({ ...base, functionName: "agents", args: [AGENT_ADDRESS] }),
  ]);
  const [maxTransactionAmount, dailyLimit, monthlyLimit, approvalThreshold, expiresAt, active] = policy;
  return {
    owner: owner.toLowerCase(),
    paused,
    balance,
    spentToday,
    spentThisMonth,
    policy: { maxTransactionAmount, dailyLimit, monthlyLimit, approvalThreshold, expiresAt, active },
    agent: { address: AGENT_ADDRESS, active: agent[0], expiresAt: agent[1] },
  };
}

export async function isFactoryTreasury(address: Address) {
  return publicClient.readContract({ address: FACTORY, abi: TreasuryFactoryAbi, functionName: "isTreasury", args: [address] });
}

/** Recipient status is whatever the chain says; the DB only stores the human-readable name. */
export async function recipientsWithLiveStatus(treasuryId: string, treasury: Address) {
  const rows = await db.recipient.findMany({ where: { treasuryId }, orderBy: { createdAt: "asc" } });
  const live = await Promise.all(
    rows.map((r) =>
      publicClient.readContract({ address: treasury, abi: TreasuryAbi, functionName: "isRecipient", args: [r.walletAddress as Address] }),
    ),
  );
  return rows.map((r, i) => ({ ...r, status: live[i] ? "APPROVED" : r.status === "APPROVED" ? "REMOVED" : "PENDING" }));
}

export async function cachePolicy(treasuryId: string, p: Awaited<ReturnType<typeof readState>>["policy"]) {
  await db.policy.upsert({ where: { treasuryId }, create: { treasuryId, ...p }, update: p });
}
