"use client";

import { useState } from "react";
import type { Address } from "viem";
import { useActive } from "@/components/Shell";
import { useQueryClient } from "@tanstack/react-query";
import { recipientMetadataHash } from "@vaultos/sdk";
import { Addr, Button, ConfirmButton, Empty, ExplorerLink, Field, Input, Notice, PageHead, Status, money } from "@/components/ui";
import { api } from "@/lib/api";
import { useAgents, useRecipients } from "@/lib/hooks";
import { useTreasuryWrites } from "@/lib/tx";
import { useWallet } from "@/lib/wallet";

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
      <ResearchAgentPanel treasury={address} />
    </>
  );
}

function ResearchAgentPanel({ treasury }: { treasury: string }) {
  const qc = useQueryClient();
  const { config } = useWallet();
  const w = useTreasuryWrites(treasury as Address);
  const recipients = useRecipients(treasury);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [res, setRes] = useState<{ answer: string; txHash: string; amount: string; source: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const ra = config?.researchAgent;
  if (!ra) return null;
  const approved = recipients.data?.some((r) => r.walletAddress.toLowerCase() === ra.toLowerCase() && r.status === "APPROVED");

  return (
    <section className="border-t border-rule py-6">
      <h2 className="text-[20px] font-semibold">Research Agent</h2>
      <p className="mt-1 max-w-[68ch] text-[14px] text-steel">
        A second agent that sells answers for {config?.researchPrice} USDC each. The Payment Agent pays it from your treasury, so the same limits, supplier list and pause apply to machine-to-machine payments. Wallet <Addr value={ra} chars={6} />
      </p>
      {!approved ? (
        <div className="mt-4">
          <Notice tone="brass">The Research Agent isn't an approved supplier yet, so the contract would refuse to pay it.</Notice>
          <div className="mt-3">
            <Button tone="primary" busy={busy === "ap"} onClick={async () => {
              setBusy("ap");
              try { await w.addRecipient(ra as Address, recipientMetadataHash("Research Agent", "Agent services")); } catch {} finally { setBusy(null); }
            }}>Approve Research Agent</Button>
          </div>
        </div>
      ) : (
        <form className="mt-4 max-w-xl space-y-3" onSubmit={async (e) => {
          e.preventDefault(); setBusy("buy"); setErr(null); setRes(null);
          try { setRes(await api(`/treasuries/${treasury}/research`, { body: { question: q } })); await qc.invalidateQueries(); }
          catch (e2) { setErr((e2 as Error).message); } finally { setBusy(null); }
        }}>
          <Field label="Question" hint={`Costs ${config?.researchPrice} USDC, paid on-chain by the Payment Agent.`}>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="What is Arc?" />
          </Field>
          <Button type="submit" tone="primary" busy={busy === "buy"} disabled={q.trim().length < 3}>Buy answer for {config?.researchPrice} USDC</Button>
        </form>
      )}
      {err && <div className="mt-3 max-w-xl"><Notice tone="oxblood">{err}</Notice></div>}
      {res && (
        <div className="mt-4 max-w-xl rounded-md border border-rule bg-panel p-4">
          <p className="text-[14px]">{res.answer}</p>
          <p className="mt-2 text-[12.5px] text-steel">Paid {res.amount} USDC by the Payment Agent · <ExplorerLink hash={res.txHash} /></p>
        </div>
      )}
    </section>
  );
}
