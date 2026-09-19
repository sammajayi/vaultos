import type { OnchainChecks } from "@vaultos/types";

/** Contract revert strings -> plain-English explanations for the UI. */
export const REVERT_EXPLANATIONS: Record<string, string> = {
  TREASURY_PAUSED: "The treasury is paused. All agent payments are blocked.",
  POLICY_INACTIVE_OR_EXPIRED: "The spending policy is inactive or has expired.",
  AGENT_NOT_AUTHORIZED: "This agent is not authorized on the treasury.",
  AGENT_EXPIRED: "The agent's authorization has expired.",
  RECIPIENT_NOT_APPROVED: "Recipient is not on the treasury's approved list.",
  ZERO_AMOUNT: "Amount must be greater than zero.",
  EXCEEDS_TX_LIMIT: "Amount exceeds the per-transaction limit.",
  INVOICE_ALREADY_USED: "This invoice has already been submitted for payment.",
  EXCEEDS_DAILY_LIMIT: "Amount would exceed the daily spending limit.",
  EXCEEDS_MONTHLY_LIMIT: "Amount would exceed the monthly spending limit.",
  INSUFFICIENT_BALANCE: "The treasury does not hold enough USDC.",
  REQUIRES_HUMAN_APPROVAL: "Amount exceeds the autonomous limit and needs owner approval.",
  NOT_PENDING: "This payment request is no longer pending.",
};

export const explainRevert = (message: string): string => {
  for (const [code, text] of Object.entries(REVERT_EXPLANATIONS)) if (message.includes(code)) return text;
  return message;
};

/** Every failed on-chain check, in the contract's evaluation order. */
export const failedChecks = (c: OnchainChecks): string[] => {
  const out: string[] = [];
  if (!c.notPaused) out.push("TREASURY_PAUSED");
  if (!c.policyLive) out.push("POLICY_INACTIVE_OR_EXPIRED");
  if (!c.agentAuthorized) out.push("AGENT_NOT_AUTHORIZED");
  if (!c.agentNotExpired) out.push("AGENT_EXPIRED");
  if (!c.recipientApproved) out.push("RECIPIENT_NOT_APPROVED");
  if (!c.amountPositive) out.push("ZERO_AMOUNT");
  if (!c.withinTxLimit) out.push("EXCEEDS_TX_LIMIT");
  if (!c.invoiceFresh) out.push("INVOICE_ALREADY_USED");
  if (!c.withinDailyLimit) out.push("EXCEEDS_DAILY_LIMIT");
  if (!c.withinMonthlyLimit) out.push("EXCEEDS_MONTHLY_LIMIT");
  if (!c.treasuryFunded) out.push("INSUFFICIENT_BALANCE");
  return out;
};
