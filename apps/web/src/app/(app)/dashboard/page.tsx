"use client";

import Link from "next/link";
import { useActive } from "@/components/Shell";
import { Addr, Empty, ExplorerLink, PageHead, Section, ago, money } from "@/components/ui";
import { useApprovals, useTxs } from "@/lib/hooks";
import type { Tx } from "@/lib/api";

const GLYPH: Record<string, { g: string; c: string; l: string }> = {
  PAYMENT: { g: "✓", c: "text-verdigris", l: "Paid" },
  REQUEST: { g: "!", c: "text-brass", l: "Awaiting approval" },
  BLOCKED: { g: "✕", c: "text-oxblood", l: "Blocked by contract" },
  REJECTION: { g: "✕", c: "text-oxblood", l: "Rejected" },
  DEPOSIT: { g: "+", c: "text-seal", l: "Deposit" },
  WITHDRAWAL: { g: "−", c: "text-seal", l: "Withdrawal" },
  PAUSE: { g: "■", c: "text-oxblood", l: "Paused" },
  UNPAUSE: { g: "▶", c: "text-verdigris", l: "Resumed" },
  POLICY: { g: "≡", c: "text-steel", l: "Policy" },
  RECIPIENT: { g: "◆", c: "text-steel", l: "Supplier" },
  AGENT: { g: "◇", c: "text-steel", l: "Agent" },
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
  const txs = useTxs(address);
  const approvals = useApprovals(address);
  if (!summary) return <p className="py-10 text-steel">Reading the treasury contract…</p>;

  const daily = BigInt(summary.policy.dailyLimit);
  const spent = BigInt(summary.spentToday);
  const pct = daily === 0n ? 0 : Math.min(100, Number((spent * 10000n) / daily) / 100);
  const monthly = BigInt(summary.policy.monthlyLimit);
  const mpct = monthly === 0n ? 0 : Math.min(100, Number((BigInt(summary.spentThisMonth) * 10000n) / monthly) / 100);
  const feed = (txs.data ?? []).filter((t) => ["PAYMENT", "REQUEST", "BLOCKED", "REJECTION", "DEPOSIT", "WITHDRAWAL", "PAUSE", "UNPAUSE"].includes(t.type)).slice(0, 9);

  return (
    <>
      <PageHead title="Dashboard" sub="Balance and limits are read from the treasury contract, not from a database." />

      <div className="grid gap-8 pb-8 md:grid-cols-[1fr_1.2fr]">
        <div>
          <p className="text-[13.5px] text-steel">Available USDC</p>
          <p className="num mt-1 text-[52px] font-semibold leading-none tracking-[-0.035em]">{money(summary.balance)}</p>
          <p className="mt-2 text-[13.5px] text-steel">Held by the treasury contract, on {summary.network}.</p>
        </div>
        <div className="space-y-5">
          <Meter label="Spent today" used={money(summary.spentToday)} of={money(summary.policy.dailyLimit)} pct={pct} tick={null} />
          <Meter label="Spent this month" used={money(summary.spentThisMonth)} of={money(summary.policy.monthlyLimit)} pct={mpct} tick={null} />
          <p className="text-[13.5px] text-steel">
            The agent can pay <span className="num font-medium text-ink">{money(summary.policy.approvalThreshold)}</span> alone. Anything larger waits for you.
          </p>
        </div>
      </div>

      {!!approvals.data?.length && (
        <Section title="Waiting for you" aside={<Link className="text-seal underline underline-offset-2" href="/approvals">Review all</Link>}>
          <ul className="divide-y divide-rule rounded-md border border-brass/40 bg-brass-tint/50">
            {approvals.data.slice(0, 3).map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <span>{a.invoice.supplierName} <span className="text-steel">· {a.invoice.invoiceNumber}</span></span>
                <span className="num font-semibold">{money(a.amount)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Recent activity" aside={<Link className="text-seal underline underline-offset-2" href="/transactions">All transactions</Link>}>
        {feed.length === 0 ? (
          <Empty title="Nothing has happened yet" body="Deposit USDC, approve a supplier, then submit an invoice for the agent to review." action={<Link href="/treasury" className="text-seal underline">Fund the treasury</Link>} />
        ) : (
          <ul className="divide-y divide-rule">
            {feed.map((t) => {
              const g = GLYPH[t.type] ?? GLYPH.POLICY;
              return (
                <li key={t.id} className="grid grid-cols-[1.75rem_1fr_auto] items-center gap-3 py-2.5">
                  <span aria-hidden className={`text-center text-[17px] font-bold ${g.c}`}>{g.g}</span>
                  <span className="min-w-0">
                    <span className="block truncate">{activityLine(t)}</span>
                    <span className="block text-[12.5px] text-steel">{g.l} · {ago(t.timestamp)} {t.txHash && <>· <ExplorerLink hash={t.txHash} /></>}</span>
                  </span>
                  <span className={`num font-medium ${t.type === "BLOCKED" || t.type === "REJECTION" ? "text-steel line-through" : ""}`}>{t.amount ? money(t.amount) : ""}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="At a glance">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          {[
            ["Pending approvals", summary.pendingApprovals],
            ["Active agents", summary.activeAgents],
            ["Approved suppliers", summary.recipients],
            ["Invoices paid", summary.invoiceCounts.PAID ?? 0],
          ].map(([k, v]) => (
            <div key={k as string}>
              <dt className="text-[13px] text-steel">{k}</dt>
              <dd className="num text-[24px] font-semibold">{v}</dd>
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
        <span className="text-steel">{label}</span>
        <span className="num"><span className="font-semibold">{used}</span> <span className="text-steel">of {of}</span></span>
      </div>
      <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-sm bg-sunk" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
        <div className={`h-full ${hot ? "bg-brass" : "bg-seal"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
