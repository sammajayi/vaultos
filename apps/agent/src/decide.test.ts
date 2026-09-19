import { test } from "node:test";
import assert from "node:assert/strict";
import { decide } from "./decide";
import type { PolicyContext } from "./context";

const U = 1_000_000n;
const ok = {
  notPaused: true, policyLive: true, agentAuthorized: true, agentNotExpired: true, recipientApproved: true,
  amountPositive: true, withinTxLimit: true, invoiceFresh: true, withinDailyLimit: true, withinMonthlyLimit: true, treasuryFunded: true,
};
const ctx = (over: Partial<PolicyContext["checks"]> = {}, amount = 750n * U): PolicyContext => ({
  treasury: "0x0000000000000000000000000000000000000001",
  agent: "0x0000000000000000000000000000000000000002",
  recipient: "0x0000000000000000000000000000000000000003",
  amount,
  invoiceId: "0x00",
  paused: false,
  balance: 25_000n * U,
  spentToday: 0n,
  spentThisMonth: 0n,
  policy: { maxTransactionAmount: 10_000n * U, dailyLimit: 5_000n * U, monthlyLimit: 25_000n * U, approvalThreshold: 1_000n * U, expiresAt: 0n, active: true },
  checks: { ...ok, ...over },
});

test("$750 to an approved supplier is autonomous", () => {
  assert.equal(decide(ctx()).decision, "AUTONOMOUS_APPROVAL");
});

test("$4,500 requires human approval", () => {
  const d = decide(ctx({}, 4_500n * U));
  assert.equal(d.decision, "HUMAN_APPROVAL");
  assert.match(d.reason, /autonomous limit/);
});

test("unknown recipient + over cap is rejected with both reasons", () => {
  const d = decide(ctx({ recipientApproved: false, withinTxLimit: false, withinDailyLimit: false }, 20_000n * U));
  assert.equal(d.decision, "REJECT");
  assert.ok(d.blockers.includes("RECIPIENT_NOT_APPROVED"));
  assert.ok(d.blockers.includes("EXCEEDS_TX_LIMIT"));
});

test("daily limit exhausted escalates to a human instead of rejecting", () => {
  assert.equal(decide(ctx({ withinDailyLimit: false })).decision, "HUMAN_APPROVAL");
});

test("paused treasury and duplicate invoices are rejected", () => {
  assert.equal(decide(ctx({ notPaused: false })).decision, "REJECT");
  assert.equal(decide(ctx({ invoiceFresh: false })).decision, "REJECT");
});

test("insufficient balance is rejected", () => {
  assert.equal(decide(ctx({ treasuryFunded: false })).decision, "REJECT");
});
