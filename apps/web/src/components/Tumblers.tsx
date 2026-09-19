"use client";

import { useEffect, useState } from "react";
import type { Decision } from "@/lib/api";

/**
 * The contract's rules as a vault lock. Each pin is one rule the Treasury contract checks on-chain.
 * A pin that lines up sits on the shear line; a failing pin hangs low and blocks the bolt.
 * All pins aligned: the bolt retracts and the contract will pay.
 */
export type Pin = { key: string; label: string; ok: boolean };

const PIN_DEFS: { key: string; label: string; codes: string[] }[] = [
  { key: "agent", label: "Agent is authorized", codes: ["AGENT_NOT_AUTHORIZED", "AGENT_EXPIRED"] },
  { key: "running", label: "Treasury is running", codes: ["TREASURY_PAUSED"] },
  { key: "policy", label: "Policy is active", codes: ["POLICY_INACTIVE_OR_EXPIRED"] },
  { key: "supplier", label: "Supplier is approved", codes: ["RECIPIENT_NOT_APPROVED"] },
  { key: "cap", label: "Under the per-payment cap", codes: ["EXCEEDS_TX_LIMIT", "ZERO_AMOUNT"] },
  { key: "fresh", label: "Invoice not paid before", codes: ["INVOICE_ALREADY_USED"] },
  { key: "funded", label: "Treasury holds the funds", codes: ["INSUFFICIENT_BALANCE"] },
  { key: "daily", label: "Within the daily limit", codes: ["EXCEEDS_DAILY_LIMIT"] },
  { key: "monthly", label: "Within the monthly limit", codes: ["EXCEEDS_MONTHLY_LIMIT"] },
  { key: "auto", label: "Within the autonomous limit", codes: ["REQUIRES_HUMAN_APPROVAL"] },
];

export function pinsFromDecision(d: Decision): Pin[] {
  const blockers = new Set(d.blockers);
  if (d.decision === "HUMAN_APPROVAL" && !d.checks.amountWithinLimit) blockers.add("REQUIRES_HUMAN_APPROVAL");
  return PIN_DEFS.map((p) => ({ key: p.key, label: p.label, ok: !p.codes.some((c) => blockers.has(c)) }));
}

export function pinsFromCodes(codes: string[]): Pin[] {
  const b = new Set(codes);
  return PIN_DEFS.map((p) => ({ key: p.key, label: p.label, ok: !p.codes.some((c) => b.has(c)) }));
}

type Verdict = "open" | "held" | "locked";
const verdictOf = (pins: Pin[]): Verdict => {
  const bad = pins.filter((p) => !p.ok);
  if (bad.length === 0) return "open";
  return bad.every((p) => ["auto", "daily", "monthly"].includes(p.key)) ? "held" : "locked";
};

const TONE = {
  open: { fill: "var(--color-verdigris)", text: "text-verdigris", bg: "bg-verdigris-tint", msg: "Bolt open. The contract will pay." },
  held: { fill: "var(--color-brass)", text: "text-brass", bg: "bg-brass-tint", msg: "Bolt held. The owner's approval is required." },
  locked: { fill: "var(--color-oxblood)", text: "text-oxblood", bg: "bg-oxblood-tint", msg: "Bolt locked. The contract will refuse." },
} as const;

export function Tumblers({ pins, live = false }: { pins: Pin[]; live?: boolean }) {
  // Pins start unset and settle once mounted, so a fresh decision is visibly "worked out".
  const [set, setSet] = useState(!live);
  useEffect(() => {
    if (!live) return;
    const t = requestAnimationFrame(() => setSet(true));
    return () => cancelAnimationFrame(t);
  }, [live]);

  const verdict = verdictOf(pins);
  const tone = TONE[verdict];
  const W = 26;
  const width = pins.length * W + 20;

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${width} 92`} role="img" aria-label={`${tone.msg} ${pins.filter((p) => !p.ok).length} of ${pins.length} rules failing.`} className="w-full max-w-[420px]">
        {/* housing */}
        <rect x="1" y="6" width={width - 2} height="62" rx="5" fill="var(--color-sunk)" stroke="var(--color-rule)" />
        {/* shear line */}
        <line x1="6" x2={width - 6} y1="37" y2="37" stroke="var(--color-steel)" strokeWidth="1" strokeDasharray="2 3" opacity="0.7" />
        {pins.map((p, i) => {
          const x = 10 + i * W;
          const drop = p.ok ? 0 : 14;
          return (
            <g key={p.key} className="pin" data-set={set} style={{ ["--i" as string]: i }}>
              <g style={{ transform: `translateY(${drop}px)`, transition: "transform 0s" }}>
                <rect x={x} y="12" width="16" height="30" rx="3" fill={p.ok ? "var(--color-panel)" : "var(--color-oxblood)"} stroke={p.ok ? "var(--color-steel)" : "var(--color-oxblood)"} />
                <line x1={x + 4} x2={x + 12} y1="20" y2="20" stroke={p.ok ? "var(--color-rule)" : "#fff"} strokeWidth="1.5" strokeLinecap="round" />
              </g>
            </g>
          );
        })}
        {/* bolt */}
        <g className="bolt" style={{ transform: `translateX(${verdict === "open" ? width - 60 : 0}px)` }}>
          <rect x="8" y="74" width="56" height="10" rx="3" fill={tone.fill} />
        </g>
        <rect x="8" y="74" width={width - 16} height="10" rx="3" fill="none" stroke="var(--color-rule)" />
      </svg>
      <figcaption className={`mt-2 inline-block rounded px-2 py-0.5 text-[13px] font-medium ${tone.bg} ${tone.text}`}>{tone.msg}</figcaption>
      <ul className="checklist mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-[13px]" style={{ listStyle: "none", padding: 0 }}>
        {pins.map((p) => (
          <li key={p.key} className="flex items-center gap-2">
            <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${p.ok ? "bg-verdigris" : "bg-oxblood"}`} />
            <span className={p.ok ? "text-steel" : "font-medium text-oxblood"}>
              {p.label}
              <span className="sr-only">{p.ok ? ": passed" : ": failed"}</span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
