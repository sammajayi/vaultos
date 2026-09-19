"use client";

import { useState } from "react";
import type { Address } from "viem";
import { useActive } from "@/components/Shell";
import { Addr, Button, ConfirmButton, Empty, PageHead, Status, money } from "@/components/ui";
import { useAgents } from "@/lib/hooks";
import { useTreasuryWrites } from "@/lib/tx";

export default function Agents() {
  const { address } = useActive();
  const { data, isLoading } = useAgents(address);
  const w = useTreasuryWrites(address);
  const [busy, setBusy] = useState(false);

  return (
    <>
      <PageHead title="Agents" sub="An agent is a separate wallet. It can ask the treasury to pay, and nothing else. It is never the owner." />
      {isLoading ? <p className="text-steel">Loading…</p> : !data?.length ? <Empty title="No agents" body="Authorize an agent to let it handle invoices." /> : data.map((a) => (
        <article key={a.address} className="border-t border-rule py-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-[20px] font-semibold">{a.name}</h2>
              <p className="mt-1 text-[13.5px] text-steel">Wallet <Addr value={a.address} chars={6} />{a.expiresAt !== "0" && <> · authorization ends {new Date(Number(a.expiresAt) * 1000).toLocaleDateString()}</>}</p>
            </div>
            <Status value={a.status} />
          </div>
          <dl className="mt-5 grid gap-x-10 gap-y-3 sm:grid-cols-4">
            <div><dt className="text-[13px] text-steel">Can pay alone up to</dt><dd className="num text-[20px] font-semibold">{money(a.authority.perTransaction)}</dd></div>
            <div><dt className="text-[13px] text-steel">Per day</dt><dd className="num text-[20px] font-semibold">{money(a.authority.daily)}</dd></div>
            <div><dt className="text-[13px] text-steel">Per month</dt><dd className="num text-[20px] font-semibold">{money(a.authority.monthly)}</dd></div>
            <div><dt className="text-[13px] text-steel">Spent today</dt><dd className="num text-[20px] font-semibold">{money(a.spentToday)}</dd></div>
          </dl>
          <p className="mt-5 max-w-[68ch] text-[14px] text-steel">
            Allowed: request a payment to an approved supplier within policy. Not allowed: send USDC anywhere else, change limits, approve its own requests, or pause or unpause the treasury.
          </p>
          <div className="mt-4">
            {a.status === "REVOKED" || a.status === "EXPIRED" ? (
              <Button tone="primary" busy={busy} onClick={async () => { setBusy(true); try { await w.authorizeAgent(a.address as Address, 0n); } catch {} finally { setBusy(false); } }}>Authorize again</Button>
            ) : (
              <ConfirmButton label="Revoke agent" confirmLabel="Revoke this agent" onConfirm={() => w.revokeAgent(a.address as Address).catch(() => {})} />
            )}
          </div>
        </article>
      ))}
    </>
  );
}
