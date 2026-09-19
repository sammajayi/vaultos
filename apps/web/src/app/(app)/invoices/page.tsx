"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useActive } from "@/components/Shell";
import { Tumblers, pinsFromDecision } from "@/components/Tumblers";
import { Button, Drawer, Empty, ExplorerLink, Field, Input, Notice, PageHead, Section, Status, money } from "@/components/ui";
import { ApiError, api, type Invoice } from "@/lib/api";
import { useInvoices, useRecipients } from "@/lib/hooks";
import { useToasts } from "@/lib/tx";
import { useWallet } from "@/lib/wallet";

const DECISION_LABEL: Record<string, string> = { AUTONOMOUS_APPROVAL: "Pay autonomously", HUMAN_APPROVAL: "Ask owner", REJECT: "Reject" };

export default function InvoicesPage() {
  const { address } = useActive();
  const { data, isLoading } = useInvoices(address);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = data?.find((i) => i.id === openId) ?? null;

  return (
    <>
      <PageHead title="Invoices" sub="Submit an invoice and the Payment Agent reviews it against your on-chain policy." action={<Button tone="primary" onClick={() => setCreating(true)}>New invoice</Button>} />

      {isLoading ? <p className="text-steel">Loading…</p> : !data?.length ? (
        <Empty title="No invoices yet" body="Add a supplier under Policies, then submit an invoice here for the agent to review." action={<Button tone="primary" onClick={() => setCreating(true)}>New invoice</Button>} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-[14.5px]">
            <thead>
              <tr className="border-b border-rule text-left text-[13px] font-medium text-steel">
                <th className="py-2 pr-4 font-medium">Invoice</th><th className="pr-4 font-medium">Supplier</th><th className="pr-4 text-right font-medium">Amount</th><th className="pr-4 font-medium">Due</th><th className="pr-4 font-medium">Agent decision</th><th className="font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((i) => (
                <tr key={i.id} className="cursor-pointer border-b border-rule hover:bg-sunk/60" onClick={() => setOpenId(i.id)}>
                  <td className="py-3 pr-4"><button className="font-medium text-seal underline decoration-seal/30 underline-offset-2" onClick={(e) => { e.stopPropagation(); setOpenId(i.id); }}>{i.invoiceNumber}</button></td>
                  <td className="pr-4">{i.supplierName}</td>
                  <td className="num pr-4 text-right font-medium">{money(i.amount)}</td>
                  <td className="pr-4 text-steel">{i.dueDate}</td>
                  <td className="pr-4 text-steel">{i.agentDecision ? DECISION_LABEL[i.agentDecision.decision] : "Not reviewed"}</td>
                  <td><Status value={i.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Drawer open={creating} onClose={() => setCreating(false)} title="New invoice">
        <NewInvoice treasury={address} onDone={(id) => { setCreating(false); setOpenId(id); }} />
      </Drawer>
      <Drawer open={!!open} onClose={() => setOpenId(null)} title={open ? `Invoice ${open.invoiceNumber}` : ""}>
        {open && <InvoiceDetail invoice={open} treasury={address} />}
      </Drawer>
    </>
  );
}

function NewInvoice({ treasury, onDone }: { treasury: string; onDone: (id: string) => void }) {
  const recipients = useRecipients(treasury);
  const qc = useQueryClient();
  const approved = (recipients.data ?? []).filter((r) => r.status === "APPROVED");
  const [pick, setPick] = useState("");
  const [f, setF] = useState({ supplierName: "", supplierAddress: "", invoiceNumber: "", amount: "", dueDate: "", description: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const chosen = approved.find((r) => r.id === pick);
  const supplierName = chosen?.name ?? f.supplierName;
  const supplierAddress = chosen?.walletAddress ?? f.supplierAddress;
  const valid = supplierName.trim() && /^0x[a-fA-F0-9]{40}$/.test(supplierAddress) && f.invoiceNumber.trim() && /^\d+(\.\d{1,6})?$/.test(f.amount) && Number(f.amount) > 0 && f.dueDate.trim();

  return (
    <form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true); setErr(null);
      try {
        const inv = await api<Invoice>(`/treasuries/${treasury}/invoices`, { body: { ...f, supplierName, supplierAddress } });
        await qc.invalidateQueries({ queryKey: ["invoices"] });
        onDone(inv.id);
      } catch (e2) { setErr((e2 as Error).message); } finally { setBusy(false); }
    }}>
      <Field label="Supplier">
        <select value={pick} onChange={(e) => setPick(e.target.value)} className="h-10 w-full rounded-md border border-rule bg-white px-3">
          <option value="">Someone not on my approved list</option>
          {approved.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.category})</option>)}
        </select>
      </Field>
      {!chosen && (
        <>
          <Field label="Supplier name"><Input value={f.supplierName} onChange={set("supplierName")} /></Field>
          <Field label="Supplier wallet" hint="Not approved yet, so the contract will refuse to pay this address."><Input className="font-mono text-[13.5px]" placeholder="0x…" value={f.supplierAddress} onChange={set("supplierAddress")} /></Field>
        </>
      )}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Invoice number"><Input value={f.invoiceNumber} onChange={set("invoiceNumber")} placeholder="AWS-4921" /></Field>
        <Field label="Amount (USDC)"><Input inputMode="decimal" value={f.amount} onChange={set("amount")} placeholder="750" /></Field>
      </div>
      <Field label="Due date"><Input value={f.dueDate} onChange={set("dueDate")} placeholder="Sept 30" /></Field>
      <Field label="Description"><Input value={f.description} onChange={set("description")} placeholder="Cloud services" /></Field>
      {err && <Notice tone="oxblood">{err}</Notice>}
      <Button type="submit" tone="primary" busy={busy} disabled={!valid}>Submit invoice</Button>
    </form>
  );
}

function InvoiceDetail({ invoice: i, treasury }: { invoice: Invoice; treasury: string }) {
  const qc = useQueryClient();
  const { push } = useToasts();
  const { config } = useWallet();
  const [busy, setBusy] = useState<string | null>(null);
  const [attack, setAttack] = useState<{ reasons: string[] } | null>(null);
  const trail = useQuery({ queryKey: ["trail", i.id, i.status], queryFn: () => api<{ id: string; stage: string; detail: Record<string, unknown>; createdAt: string }[]>(`/invoices/${i.id}/trail`) });
  const [fresh, setFresh] = useState(false);

  const call = async (key: string, path: string, body: unknown, after?: (r: any) => void) => {
    setBusy(key);
    try {
      const r = await api<any>(path, { method: "POST", body });
      after?.(r);
      await qc.invalidateQueries();
    } catch (e) {
      push({ tone: "bad", text: e instanceof ApiError ? e.message : "Something went wrong." }, 9000);
    } finally { setBusy(null); }
  };

  const d = i.agentDecision;
  const done = ["PAID", "EXECUTING"].includes(i.status);
  const queued = !!i.paymentRequest;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[18px] font-semibold">{i.supplierName}</p>
          <p className="text-[13.5px] text-steel">{i.description || "No description"} · due {i.dueDate}</p>
        </div>
        <div className="text-right"><p className="num text-[26px] font-semibold tracking-tight">{money(i.amount)}</p><Status value={i.status} /></div>
      </div>

      {!d && i.status !== "ANALYZING" && (
        <Notice tone="seal">The agent hasn't looked at this invoice yet. It will read your policy from the contract, then decide.</Notice>
      )}

      {d && (
        <Section title="Agent decision" className="!py-4">
          <p className="text-[15px]"><span className="font-semibold">{DECISION_LABEL[d.decision]}.</span> <span className="text-steel">{d.reason}</span></p>
          <p className="mt-1 text-[12.5px] text-steel">{d.explanationSource === "llm" ? "Explanation written by Claude. The decision itself is rule-based." : "Rule-based decision from on-chain state."}</p>
          <div className="mt-4"><Tumblers pins={pinsFromDecision(d)} live={fresh} /></div>
        </Section>
      )}

      {attack && (
        <Notice tone="oxblood">
          <p className="font-semibold">The agent tried anyway. The contract refused.</p>
          <ul className="mt-1 list-disc pl-5">{attack.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          <p className="mt-2 text-[13px]">This ran against the real contract as a dry run: no USDC moved and no gas was spent.</p>
        </Notice>
      )}
      {i.failureReason && !attack && ["FAILED", "REJECTED"].includes(i.status) && <Notice tone="oxblood">{i.failureReason}</Notice>}

      {i.paymentRequest?.executionTxHash && <p className="text-[14px]">Settled on {config?.network}: <ExplorerLink hash={i.paymentRequest.executionTxHash} /></p>}
      {i.status === "AWAITING_HUMAN_APPROVAL" && queued && <Notice tone="brass">Waiting for the owner. Approve it on the Approvals screen.</Notice>}

      <div className="flex flex-wrap gap-2">
        {!d && <Button tone="primary" busy={busy === "an"} onClick={() => call("an", `/invoices/${i.id}/analyze`, {}, () => setFresh(true))}>Analyze invoice</Button>}
        {d?.decision === "AUTONOMOUS_APPROVAL" && !queued && !done && <Button tone="good" busy={busy === "ex"} onClick={() => call("ex", `/invoices/${i.id}/execute`, {})}>Pay {money(i.amount)} now</Button>}
        {d?.decision === "HUMAN_APPROVAL" && !queued && <Button tone="primary" busy={busy === "ex"} onClick={() => call("ex", `/invoices/${i.id}/execute`, {})}>Send to owner for approval</Button>}
        {d && !queued && !done && <Button busy={busy === "an"} onClick={() => call("an", `/invoices/${i.id}/analyze`, {}, () => setFresh(true))}>Re-analyze</Button>}
        {d?.decision === "REJECT" && config?.attackSimulation && i.status !== "PAID" && (
          <Button tone="danger" busy={busy === "atk"} onClick={() => call("atk", `/invoices/${i.id}/execute`, { attack: true }, (r) => setAttack({ reasons: r.reasons }))}>
            Simulate a compromised agent
          </Button>
        )}
      </div>
      {d?.decision === "REJECT" && config?.attackSimulation && <p className="text-[13px] text-steel">Simulating a compromised agent makes it try to pay anyway. The treasury contract still says no.</p>}

      <Section title="Audit trail" className="!py-4">
        {trail.data?.length ? (
          <ol className="space-y-2 text-[14px]">
            {trail.data.map((t) => (
              <li key={t.id} className="flex gap-3"><span className="w-40 shrink-0 font-medium">{STAGE[t.stage] ?? t.stage}</span><span className="text-steel">{new Date(t.createdAt).toLocaleTimeString()}</span></li>
            ))}
          </ol>
        ) : <p className="text-steel">No events yet.</p>}
      </Section>
    </div>
  );
}

const STAGE: Record<string, string> = {
  SUBMITTED: "Invoice submitted", AGENT_DECISION: "Agent decided", POLICY_RESULT: "Policy checked", CONTRACT_REQUEST: "Agent asked the contract",
  CONTRACT_REFUSED: "Contract refused", SETTLED: "Settled on Arc",
};
