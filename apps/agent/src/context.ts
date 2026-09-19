import type { Address, Hex, PublicClient } from "viem";
import { TreasuryAbi, formatUsdc } from "@vaultos/sdk";
import type { OnchainChecks } from "@vaultos/types";

/** Everything the decision engine is allowed to know, read straight from the chain. */
export type PolicyContext = {
  treasury: Address;
  agent: Address;
  recipient: Address;
  amount: bigint;
  invoiceId: Hex;
  paused: boolean;
  balance: bigint;
  spentToday: bigint;
  spentThisMonth: bigint;
  policy: {
    maxTransactionAmount: bigint;
    dailyLimit: bigint;
    monthlyLimit: bigint;
    approvalThreshold: bigint;
    expiresAt: bigint;
    active: boolean;
  };
  checks: OnchainChecks;
};

/** Stage 3 — Policy context. Authoritative on-chain state; the DB is never trusted for limits. */
export async function readPolicyContext(
  client: PublicClient,
  a: { treasury: Address; agent: Address; recipient: Address; amount: bigint; invoiceId: Hex },
): Promise<PolicyContext> {
  const base = { address: a.treasury, abi: TreasuryAbi } as const;
  const [policy, paused, balance, spentToday, spentThisMonth, checks] = await Promise.all([
    client.readContract({ ...base, functionName: "policy" }),
    client.readContract({ ...base, functionName: "paused" }),
    client.readContract({ ...base, functionName: "balance" }),
    client.readContract({ ...base, functionName: "spentToday" }),
    client.readContract({ ...base, functionName: "spentThisMonth" }),
    client.readContract({ ...base, functionName: "preflight", args: [a.agent, a.recipient, a.amount, a.invoiceId] }),
  ]);
  const [maxTransactionAmount, dailyLimit, monthlyLimit, approvalThreshold, expiresAt, active] = policy;
  return {
    ...a,
    paused,
    balance,
    spentToday,
    spentThisMonth,
    policy: { maxTransactionAmount, dailyLimit, monthlyLimit, approvalThreshold, expiresAt, active },
    checks: { ...checks },
  };
}

export const describeContext = (c: PolicyContext) => ({
  amount: formatUsdc(c.amount),
  autonomousLimit: formatUsdc(c.policy.approvalThreshold),
  perTransactionCap: formatUsdc(c.policy.maxTransactionAmount),
  dailyRemaining: formatUsdc(c.policy.dailyLimit > c.spentToday ? c.policy.dailyLimit - c.spentToday : 0n),
  monthlyRemaining: formatUsdc(c.policy.monthlyLimit > c.spentThisMonth ? c.policy.monthlyLimit - c.spentThisMonth : 0n),
  treasuryBalance: formatUsdc(c.balance),
});
