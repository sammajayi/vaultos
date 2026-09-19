"use client";

import { useState } from "react";
import { useActive } from "@/components/Shell";
import { Addr, Button, Empty, ExplorerLink, Notice, PageHead, ago, money } from "@/components/ui";
import { useApprovals } from "@/lib/hooks";
import { useTreasuryWrites } from "@/lib/tx";

export default function Approvals() {
  const { address, summary } = useActive();
  const { data, isLoading } = useApprovals(address);
  const w = useTreasuryWrites(address);
  const [busy, setBusy] = useState<string | null>(null);

  return (
    <>
      <PageHead title="Approvals" sub="Payments the agent may not make on its own. Nothing moves until you approve." />
      {summary?.paused && <div className="mb-4"><Notice tone="brass">The treasury is paused. Approvals are blocked until you resume it.</Notice></div>}
      {isLoading ? <p className="text-steel">Loading…</p> : !data?.length ? (
        <Empty title="Nothing needs your approval" body="When an invoice is larger than the agent's limit, it will wait here for your decision." />
      ) : (
        <ul className="space-y-5">
          {data.map((a) => {
            const d = a.invoice.agentDecision;
            const id = BigInt(a.onchainRequestId);
            return (
              <li key={a.id} className="rounded-lg border border-brass/50 bg-panel">
                <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule px-5 py-4">
                  <div>
                    <p className="text-[18px] font-semibold">{a.invoice.supplierName}</p>
                    <p className="text-[13.5px] text-steel">{a.invoice.invoiceNumber} · due {a.invoice.dueDate} · requested {ago(a.createdAt)} · <Addr value={a.recipient} /></p>
                  </div>
                  <p className="num text-[30px] font-semibold tracking-tight">{money(a.amount)}</p>
                </div>
                <div className="grid gap-6 px-5 py-4 sm:grid-cols-2">
                  <div>
                    <p className="text-[13px] font-medium">What the agent checked</p>
                    <ul className="mt-2 space-y-1 text-[14px]">
                      <Line ok={d?.checks.recipientApproved} text="Supplier is approved" />
                      <Line ok={d?.checks.treasuryFunded} text="Treasury holds the funds" />
                      <Line ok text="Invoice hasn't been paid before" />
                      <Line ok={d?.checks.amountWithinLimit} text="Within the agent's own limit" warn />
                    </ul>
                  </div>
                  <div>
                    <p className="text-[13px] font-medium">Agent's note</p>
                    <p className="mt-2 text-[14px] text-steel">{d?.reason}</p>
                    {a.invoice.description && <p className="mt-2 text-[13.5px]"><span className="text-steel">Invoice says: </span>{a.invoice.description}</p>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule px-5 py-3">
                  <span className="text-[13px] text-steel">Request #{a.onchainRequestId} on-chain {a.invoice.paymentRequest?.requestTxHash && <>· <ExplorerLink hash={a.invoice.paymentRequest.requestTxHash} /></>}</span>
                  <span className="flex gap-2">
                    <Button tone="danger" busy={busy === `r${a.id}`} onClick={async () => { setBusy(`r${a.id}`); try { await w.rejectPayment(id); } catch {} finally { setBusy(null); } }}>Reject</Button>
                    <Button tone="good" busy={busy === `a${a.id}`} disabled={summary?.paused} onClick={async () => { setBusy(`a${a.id}`); try { await w.approvePayment(id); } catch {} finally { setBusy(null); } }}>Approve and pay {money(a.amount)}</Button>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function Line({ ok, text, warn }: { ok?: boolean; text: string; warn?: boolean }) {
  return (
    <li className="flex items-center gap-2">
      <span aria-hidden className={`font-bold ${ok ? "text-verdigris" : warn ? "text-brass" : "text-oxblood"}`}>{ok ? "✓" : warn ? "!" : "✕"}</span>
      <span className={ok ? "" : warn ? "font-medium text-brass" : "font-medium text-oxblood"}>{text}{!ok && warn ? ": above the limit" : ""}</span>
    </li>
  );
}
