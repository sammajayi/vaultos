"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Address, Hex } from "viem";
import { useActive } from "@/components/Shell";
import { PolicyForm } from "@/components/PolicyForm";
import { Addr, Button, Empty, Field, Input, Notice, PageHead, Section, Status } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { useRecipients } from "@/lib/hooks";
import { useTreasuryWrites } from "@/lib/tx";

export default function Policies() {
  const { address, summary } = useActive();
  const w = useTreasuryWrites(address);
  const recipients = useRecipients(address);
  const qc = useQueryClient();
  const [f, setF] = useState({ name: "", walletAddress: "", category: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const valid = f.name.trim() && f.category.trim() && /^0x[a-fA-F0-9]{40}$/.test(f.walletAddress);

  if (!summary) return <p className="py-10 text-steel">Reading the treasury contract…</p>;
  const expired = summary.policy.expiresAt !== "0" && Number(summary.policy.expiresAt) * 1000 < Date.now();

  return (
    <>
      <PageHead title="Policies" sub="These rules live in the treasury contract. Changing them is a transaction you sign." />
      {expired && <div className="mb-4"><Notice tone="oxblood">This policy has expired, so the contract refuses every agent payment. Save it again with a new duration to renew.</Notice></div>}

      <Section title="Spending limits">
        <PolicyForm key={JSON.stringify(summary.policy)} initial={summary.policy} submitLabel="Save policy on-chain" onSubmit={(p) => w.updatePolicy(p).catch(() => {})} />
      </Section>

      <Section title="Approved suppliers" aside={<span className="text-[13px] text-steel">The agent can only pay addresses on this list.</span>}>
        {!recipients.data?.length ? <Empty title="No suppliers yet" body="Add the first supplier below. It takes one signature to approve it on-chain." /> : (
          <ul className="divide-y divide-rule">
            {recipients.data.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span><span className="font-medium">{r.name}</span> <span className="text-steel">· {r.category}</span><br /><Addr value={r.walletAddress} chars={6} /></span>
                <span className="flex items-center gap-3">
                  <Status value={r.status} />
                  {r.status === "APPROVED" && <Button busy={busy === r.id} onClick={async () => { setBusy(r.id); try { await w.removeRecipient(r.walletAddress as Address); } catch {} finally { setBusy(null); } }}>Remove</Button>}
                  {r.status !== "APPROVED" && <Button tone="primary" busy={busy === r.id} onClick={async () => {
                    setBusy(r.id);
                    try {
                      const rec = await api<{ metadataHash: Hex }>(`/treasuries/${address}/recipients`, { body: { name: r.name, walletAddress: r.walletAddress, category: r.category } });
                      await w.addRecipient(r.walletAddress as Address, rec.metadataHash);
                    } catch {} finally { setBusy(null); }
                  }}>Approve on-chain</Button>}
                </span>
              </li>
            ))}
          </ul>
        )}

        <form className="mt-6 grid max-w-2xl gap-4 sm:grid-cols-2" onSubmit={async (e) => {
          e.preventDefault(); setBusy("add"); setErr(null);
          try {
            const rec = await api<{ metadataHash: Hex }>(`/treasuries/${address}/recipients`, { body: f });
            await qc.invalidateQueries({ queryKey: ["recipients"] });
            await w.addRecipient(f.walletAddress as Address, rec.metadataHash);
            setF({ name: "", walletAddress: "", category: "" });
          } catch (e2) { if (e2 instanceof ApiError) setErr(e2.message); } finally { setBusy(null); }
        }}>
          <Field label="Supplier name"><Input value={f.name} onChange={set("name")} placeholder="AWS" /></Field>
          <Field label="Category"><Input value={f.category} onChange={set("category")} placeholder="Cloud infrastructure" /></Field>
          <div className="sm:col-span-2"><Field label="Wallet address"><Input className="font-mono text-[13.5px]" value={f.walletAddress} onChange={set("walletAddress")} placeholder="0x…" /></Field></div>
          {err && <div className="sm:col-span-2"><Notice tone="oxblood">{err}</Notice></div>}
          <div><Button type="submit" tone="primary" busy={busy === "add"} disabled={!valid}>Add supplier</Button></div>
        </form>
      </Section>
    </>
  );
}
