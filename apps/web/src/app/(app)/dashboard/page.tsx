"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckmarkCircle02Icon,
  Clock01Icon,
  Cancel01Icon,
  PlusSignIcon,
  MinusSignIcon,
  PauseIcon,
  PlayIcon,
  Settings01Icon,
  Building06Icon,
  RoboticIcon,
  InboxIcon,
  ViewIcon,
  ViewOffIcon,
} from "hugeicons-react";
import { useState } from "react";
import { useActive } from "@/components/Shell";
import { Addr, Button, Empty, ExplorerLink, PageHead, PageLoading, Section, ago, money } from "@/components/ui";
import { useApprovals, useTxs } from "@/lib/hooks";
import type { Tx } from "@/lib/api";

const GLYPH: Record<string, { icon: typeof CheckmarkCircle02Icon; c: string; bg: string; l: string }> = {
  PAYMENT: { icon: CheckmarkCircle02Icon, c: "text-verdigris", bg: "bg-verdigris-tint", l: "Paid" },
  REQUEST: { icon: Clock01Icon, c: "text-brass", bg: "bg-brass-tint", l: "Awaiting approval" },
  BLOCKED: { icon: Cancel01Icon, c: "text-oxblood", bg: "bg-oxblood-tint", l: "Blocked by contract" },
  REJECTION: { icon: Cancel01Icon, c: "text-oxblood", bg: "bg-oxblood-tint", l: "Rejected" },
  DEPOSIT: { icon: PlusSignIcon, c: "text-seal", bg: "bg-seal-tint", l: "Deposit" },
  WITHDRAWAL: { icon: MinusSignIcon, c: "text-seal", bg: "bg-seal-tint", l: "Withdrawal" },
  PAUSE: { icon: PauseIcon, c: "text-oxblood", bg: "bg-oxblood-tint", l: "Paused" },
  UNPAUSE: { icon: PlayIcon, c: "text-verdigris", bg: "bg-verdigris-tint", l: "Resumed" },
  POLICY: { icon: Settings01Icon, c: "text-steel", bg: "bg-sunk", l: "Policy" },
  RECIPIENT: { icon: Building06Icon, c: "text-steel", bg: "bg-sunk", l: "Supplier" },
  AGENT: { icon: RoboticIcon, c: "text-steel", bg: "bg-sunk", l: "Agent" },
};

function activityLine(t: Tx) {
  const who = t.recipientName ?? (t.recipient ? t.recipient.slice(0, 8) + "…" : "");
  if (["PAYMENT", "REQUEST", "BLOCKED", "REJECTION"].includes(t.type)) return `${who}${t.invoiceRef ? ` · ${t.invoiceRef}` : ""}`;
  if (t.type === "DEPOSIT") return "USDC added to treasury";
  if (t.type === "WITHDRAWAL") return "USDC withdrawn by owner";
  return t.policyNote ?? "";
}

export default function Dashboard() {
  const { address, summary } = useActive();
  const router = useRouter();
  const [showBalance, setShowBalance] = useState(true);
  const txs = useTxs(address);
  const approvals = useApprovals(address);
  if (!summary) return <PageLoading />;

  const daily = BigInt(summary.policy.dailyLimit);
  const spent = BigInt(summary.spentToday);
  const pct = daily === 0n ? 0 : Math.min(100, Number((spent * 10000n) / daily) / 100);
  const monthly = BigInt(summary.policy.monthlyLimit);
  const mpct = monthly === 0n ? 0 : Math.min(100, Number((BigInt(summary.spentThisMonth) * 10000n) / monthly) / 100);
  const feed = (txs.data ?? []).filter((t) => ["PAYMENT", "REQUEST", "BLOCKED", "REJECTION", "DEPOSIT", "WITHDRAWAL", "PAUSE", "UNPAUSE"].includes(t.type)).slice(0, 9);

  return (
    <>
      <PageHead title="Dashboard" sub="Balance and limits are read from the treasury contract, not from a database." />

      <div className="grid gap-5 md:grid-cols-[1.1fr_1fr]">
        <div className="vault rise relative overflow-hidden rounded-[20px] p-6 sm:p-7">
          <svg aria-hidden viewBox="0 0 24 24" fill="none" className="pointer-events-none absolute -bottom-16 -right-12 h-64 w-64 text-white/[0.07]">
            <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.6" />
            <path d="M12 8.6a2.1 2.1 0 1 1 0 4.2 2.1 2.1 0 0 1 0-4.2Z" fill="currentColor" />
            <path d="M12 12.8 12 16.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <div className="relative flex items-center gap-1.5">
            <p className="text-[14px] font-medium text-white/75">Available USDC</p>
            <button
              type="button"
              onClick={() => setShowBalance((v) => !v)}
              aria-label={showBalance ? "Hide balance" : "Show balance"}
              aria-pressed={!showBalance}
              className="rounded p-0.5 text-white/60 transition-colors hover:text-white"
            >
              {showBalance ? <ViewIcon size={15} /> : <ViewOffIcon size={15} />}
            </button>
          </div>
          <p className="display num relative mt-3 text-[48px] font-bold leading-none tracking-[-0.04em] sm:text-[60px]">{showBalance ? money(summary.balance) : "••••••"}</p>
          <p className="relative mt-4 text-[13.5px] text-white/70">Held by the treasury contract on {summary.network}.</p>
          <div className="relative mt-7 flex flex-wrap gap-2">
            <Link href="/treasury" className="rounded-lg bg-white px-3.5 py-2 text-[13.5px] font-semibold text-night transition-colors hover:bg-white/90">Add funds</Link>
            <Link href="/invoices" className="rounded-lg bg-white/12 px-3.5 py-2 text-[13.5px] font-semibold text-white transition-colors hover:bg-white/20">Submit invoice</Link>
          </div>
        </div>
        <div className="card flex flex-col justify-center gap-5 p-6">
          <Meter label="Spent today" used={money(summary.spentToday)} of={money(summary.policy.dailyLimit)} pct={pct} tick={null} />
          <Meter label="Spent this month" used={money(summary.spentThisMonth)} of={money(summary.policy.monthlyLimit)} pct={mpct} tick={null} />
          <p className="rounded-lg bg-sunk px-3.5 py-2.5 text-[13.5px] text-steel">
            The agent can pay <span className="num font-semibold text-ink">{money(summary.policy.approvalThreshold)}</span> alone. Anything larger waits for you.
          </p>
        </div>
      </div>

      {!!approvals.data?.length && (
        <Section title="Waiting for you" aside={<Link className="text-seal underline underline-offset-2 transition-colors hover:text-seal-dark" href="/approvals">Review all</Link>}>
          <ul className="divide-y divide-brass/20 overflow-hidden rounded-xl border border-brass/40 bg-brass-tint/50">
            {approvals.data.slice(0, 3).map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-brass-tint">
                <span>{a.invoice.supplierName} <span className="text-steel">· {a.invoice.invoiceNumber}</span></span>
                <span className="num font-semibold">{money(a.amount)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Recent activity" aside={<Link className="text-seal underline underline-offset-2 transition-colors hover:text-seal-dark" href="/transactions">All transactions</Link>}>
        {feed.length === 0 ? (
          <Empty icon={<InboxIcon size={20} />} title="Nothing has happened yet" body="Deposit USDC, approve a supplier, then submit an invoice for the agent to review." action={<Button tone="primary" onClick={() => router.push("/treasury")}>Fund the treasury</Button>} />
        ) : (
          <ul className="divide-y divide-rule">
            {feed.map((t, i) => {
              const g = GLYPH[t.type] ?? GLYPH.POLICY;
              const Icon = g.icon;
              return (
                <li key={t.id} className="rise -mx-2 grid grid-cols-[2.25rem_1fr_auto] items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-sunk/60" style={{ ["--i" as string]: i }}>
                  <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${g.bg} ${g.c}`}><Icon size={17} aria-hidden /></span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{activityLine(t)}</span>
                    <span className="block text-[12.5px] text-steel">{g.l} · {ago(t.timestamp)} {t.txHash && <>· <ExplorerLink hash={t.txHash} /></>}</span>
                  </span>
                  <span className={`num font-semibold ${t.type === "BLOCKED" || t.type === "REJECTION" ? "text-steel line-through" : ""}`}>{t.amount ? money(t.amount) : ""}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="At a glance">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Pending approvals", summary.pendingApprovals],
            ["Active agents", summary.activeAgents],
            ["Approved suppliers", summary.recipients],
            ["Invoices paid", summary.invoiceCounts.PAID ?? 0],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded-xl bg-sunk px-4 py-3.5">
              <dt className="text-[13px] text-steel">{k}</dt>
              <dd className="display num mt-1 text-[30px] font-bold leading-none">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-[13px] text-steel">Treasury contract <Addr value={address} chars={6} /> · Agent <Addr value={summary.agent.address} chars={6} /> ({summary.agent.active ? "authorized" : "not authorized"})</p>
      </Section>
    </>
  );
}

function Meter({ label, used, of, pct }: { label: string; used: string; of: string; pct: number; tick: number | null }) {
  const hot = pct >= 80;
  return (
    <div>
      <div className="flex items-baseline justify-between text-[14px]">
        <span className="font-medium text-steel">{label}</span>
        <span className="num"><span className="font-semibold">{used}</span> <span className="text-steel">of {of}</span></span>
      </div>
      <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-sunk" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
        <div className={`h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none ${hot ? "bg-brass" : "bg-seal"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
