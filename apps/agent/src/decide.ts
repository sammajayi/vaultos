import type { PaymentDecision } from "@vaultos/types";
import { failedChecks, explainRevert, usd } from "@vaultos/sdk";
import { type PolicyContext } from "./context";

export type Decision = PaymentDecision & {
  /** Contract revert codes that would fire for an autonomous attempt. Used by the UI and audit trail. */
  blockers: string[];
  /** Deterministic explanation. May be replaced by an LLM-written paraphrase; the decision never is. */
  facts: string[];
};

/**
 * Stage 4 — Decide. Pure and deterministic: given on-chain state, produce one of
 * AUTONOMOUS_APPROVAL | HUMAN_APPROVAL | REJECT.
 *
 * The LLM never sees this function's inputs as instructions and never overrides its output. Even
 * if this logic were wrong, the Treasury contract re-checks everything (PRD §11, §22).
 */
export function decide(c: PolicyContext): Decision {
  const k = c.checks;
  const failed = failedChecks(k);

  // Hard failures: escalating to a human cannot fix these, the contract would refuse them too.
  const HARD = [
    "TREASURY_PAUSED",
    "POLICY_INACTIVE_OR_EXPIRED",
    "AGENT_NOT_AUTHORIZED",
    "AGENT_EXPIRED",
    "RECIPIENT_NOT_APPROVED",
    "ZERO_AMOUNT",
    "EXCEEDS_TX_LIMIT",
    "INVOICE_ALREADY_USED",
    "INSUFFICIENT_BALANCE",
  ];
  const hard = failed.filter((f) => HARD.includes(f));

  const checks: PaymentDecision["checks"] = {
    recipientApproved: k.recipientApproved,
    amountWithinLimit: k.withinTxLimit && c.amount <= c.policy.approvalThreshold,
    dailyLimitAvailable: k.withinDailyLimit,
    monthlyLimitAvailable: k.withinMonthlyLimit,
    treasuryFunded: k.treasuryFunded,
  };

  if (hard.length > 0) {
    return {
      decision: "REJECT",
      reason: hard.map(explainRevert).join(" "),
      checks,
      blockers: failed,
      facts: hard.map(explainRevert),
    };
  }

  const overThreshold = c.amount > c.policy.approvalThreshold;
  const overVelocity = !k.withinDailyLimit || !k.withinMonthlyLimit;

  if (overThreshold || overVelocity) {
    const why = [
      overThreshold && `${usd(c.amount)} exceeds the ${usd(c.policy.approvalThreshold)} autonomous limit.`,
      !k.withinDailyLimit && "It would exceed the daily spending limit.",
      !k.withinMonthlyLimit && "It would exceed the monthly spending limit.",
    ].filter(Boolean) as string[];
    return {
      decision: "HUMAN_APPROVAL",
      reason: `Payment appears valid (approved recipient, treasury funded). Owner approval required: ${why.join(" ")}`,
      checks,
      blockers: failed.filter((f) => !HARD.includes(f)),
      facts: why,
    };
  }

  return {
    decision: "AUTONOMOUS_APPROVAL",
    reason: "Invoice matches an approved supplier and is within every autonomous spending limit.",
    checks,
    blockers: [],
    facts: ["Recipient approved", "Within per-transaction limit", "Daily and monthly limits available", "Treasury funded"],
  };
}
