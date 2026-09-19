export const INVOICE_STATUSES = [
  "PENDING",
  "ANALYZING",
  "APPROVED",
  "AWAITING_HUMAN_APPROVAL",
  "EXECUTING",
  "PAID",
  "REJECTED",
  "FAILED",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export type Decision = "AUTONOMOUS_APPROVAL" | "HUMAN_APPROVAL" | "REJECT";

/** PRD §19 — the agent must return this exact structure, never free-form text. */
export type PaymentDecision = {
  decision: Decision;
  reason: string;
  checks: {
    recipientApproved: boolean;
    amountWithinLimit: boolean;
    dailyLimitAvailable: boolean;
    monthlyLimitAvailable: boolean;
    treasuryFunded: boolean;
  };
};

/** Human-readable policy context handed to the agent (USDC as decimal strings). */
export type PolicyView = {
  maxTransactionAmount: string;
  dailyLimit: string;
  monthlyLimit: string;
  approvalThreshold: string;
  expiresAt: number;
  active: boolean;
};

export type OnchainChecks = {
  notPaused: boolean;
  policyLive: boolean;
  agentAuthorized: boolean;
  agentNotExpired: boolean;
  recipientApproved: boolean;
  amountPositive: boolean;
  withinTxLimit: boolean;
  invoiceFresh: boolean;
  withinDailyLimit: boolean;
  withinMonthlyLimit: boolean;
  treasuryFunded: boolean;
};
