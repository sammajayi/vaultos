"use client";

import { useActive } from "@/components/Shell";
import { Addr, Empty, ExplorerLink, PageHead, Status, ago, money } from "@/components/ui";
import { useTxs } from "@/lib/hooks";

const TYPE: Record<string, string> = {
  PAYMENT: "Payment", REQUEST: "Approval request", BLOCKED: "Blocked attempt", REJECTION: "Rejected by owner", DEPOSIT: "Deposit", WITHDRAWAL: "Withdrawal",
  PAUSE: "Emergency pause", UNPAUSE: "Resumed", POLICY: "Policy change", RECIPIENT: "Supplier change", AGENT: "Agent change",
};

export default function Transactions() {
  const { address } = useActive();
  const { data, isLoading } = useTxs(address);
  return (
    <>
      <PageHead title="Transactions" sub="Every payment, block and rule change, rebuilt from the treasury contract's own events." />
      {isLoading ? <p className="text-steel">Loading…</p> : !data?.length ? (
        <Empty title="No transactions yet" body="Deposits, payments and blocked attempts will show up here as they happen." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-rule text-left text-[13px] text-steel">
                {["Type", "Amount", "Recipient", "Invoice", "Agent", "Policy", "Transaction", "When", "Status"].map((h, i) => <th key={h} className={`py-2 pr-4 font-medium ${i === 1 ? "text-right" : ""}`}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.map((t) => (
                <tr key={t.id} className="border-b border-rule align-top">
                  <td className="py-2.5 pr-4 font-medium">{TYPE[t.type] ?? t.type}</td>
                  <td className="num pr-4 text-right">{t.amount ? money(t.amount) : ""}</td>
                  <td className="pr-4">{t.recipientName ?? (t.recipient ? <Addr value={t.recipient} /> : "")}</td>
                  <td className="pr-4 text-steel">{t.invoiceRef ?? ""}</td>
                  <td className="pr-4">{t.agent ? <Addr value={t.agent} /> : ""}</td>
                  <td className="max-w-[260px] pr-4 text-steel">{t.policyNote}</td>
                  <td className="pr-4">{t.txHash ? <ExplorerLink hash={t.txHash} /> : <span className="text-steel">Not sent</span>}</td>
                  <td className="whitespace-nowrap pr-4 text-steel">{ago(t.timestamp)}</td>
                  <td><Status value={t.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
