"use client";

import { useState } from "react";
import { parseUsdc, formatUsdc } from "@vaultos/sdk";
import type { Policy } from "@/lib/api";
import { Button, Field, Input } from "./ui";

export type PolicyInput = { maxTransactionAmount: bigint; dailyLimit: bigint; monthlyLimit: bigint; approvalThreshold: bigint; expiresAt: bigint; active: boolean };

const DEFAULTS = { approvalThreshold: "1000", maxTransactionAmount: "10000", dailyLimit: "5000", monthlyLimit: "25000", days: "365" };

/** The same form creates the first policy and edits it later. Rules are checked here and again by the contract. */
export function PolicyForm({ initial, submitLabel, onSubmit }: { initial?: Policy; submitLabel: string; onSubmit: (p: PolicyInput) => Promise<unknown> }) {
  const [v, setV] = useState(() =>
    initial
      ? {
          approvalThreshold: formatUsdc(BigInt(initial.approvalThreshold)),
          maxTransactionAmount: formatUsdc(BigInt(initial.maxTransactionAmount)),
          dailyLimit: formatUsdc(BigInt(initial.dailyLimit)),
          monthlyLimit: formatUsdc(BigInt(initial.monthlyLimit)),
          days: initial.expiresAt === "0" ? "0" : String(Math.max(1, Math.round((Number(initial.expiresAt) * 1000 - Date.now()) / 86_400_000))),
        }
      : DEFAULTS,
  );
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });

  const num = (s: string) => /^\d+(\.\d{1,6})?$/.test(s.trim()) && Number(s) >= 0;
  const problems: Partial<Record<keyof typeof v, string>> = {};
  for (const k of ["approvalThreshold", "maxTransactionAmount", "dailyLimit", "monthlyLimit"] as const) if (!num(v[k])) problems[k] = "Enter a USDC amount, like 1000 or 1000.50.";
  if (!/^\d+$/.test(v.days)) problems.days = "Enter a whole number of days. Use 0 for no expiry.";
  if (!problems.approvalThreshold && !problems.maxTransactionAmount && Number(v.approvalThreshold) > Number(v.maxTransactionAmount))
    problems.approvalThreshold = "The agent's own limit can't be higher than the per-payment cap.";
  const invalid = Object.keys(problems).length > 0;

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (invalid) return;
        setBusy(true);
        try {
          await onSubmit({
            approvalThreshold: parseUsdc(v.approvalThreshold),
            maxTransactionAmount: parseUsdc(v.maxTransactionAmount),
            dailyLimit: parseUsdc(v.dailyLimit),
            monthlyLimit: parseUsdc(v.monthlyLimit),
            expiresAt: v.days === "0" ? 0n : BigInt(Math.floor(Date.now() / 1000) + Number(v.days) * 86400),
            active: true,
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Agent can pay alone up to (USDC)" hint="Above this, the owner must approve." error={problems.approvalThreshold}>
        <Input inputMode="decimal" value={v.approvalThreshold} onChange={set("approvalThreshold")} />
      </Field>
      <Field label="No payment may exceed (USDC)" hint="Hard cap, even with owner approval." error={problems.maxTransactionAmount}>
        <Input inputMode="decimal" value={v.maxTransactionAmount} onChange={set("maxTransactionAmount")} />
      </Field>
      <Field label="Daily limit (USDC)" hint="Applies to autonomous payments." error={problems.dailyLimit}>
        <Input inputMode="decimal" value={v.dailyLimit} onChange={set("dailyLimit")} />
      </Field>
      <Field label="Monthly limit (USDC)" hint="30-day window." error={problems.monthlyLimit}>
        <Input inputMode="decimal" value={v.monthlyLimit} onChange={set("monthlyLimit")} />
      </Field>
      <Field label="Policy valid for (days)" hint="After this the agent is blocked until you renew. 0 means never." error={problems.days}>
        <Input inputMode="numeric" value={v.days} onChange={set("days")} />
      </Field>
      <div className="flex items-end">
        <Button type="submit" tone="primary" busy={busy} disabled={invalid}>{submitLabel}</Button>
      </div>
    </form>
  );
}
