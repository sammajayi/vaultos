"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Address } from "viem";
import { useWallet } from "@/lib/wallet";
import { saveTreasury, savedTreasury, useSummary, useTreasuries } from "@/lib/hooks";
import { useTreasuryWrites } from "@/lib/tx";
import type { TreasurySummary } from "@/lib/api";
import { Addr, Button, ConfirmButton } from "./ui";

type Active = { address: Address; summary: TreasurySummary | undefined; loading: boolean };
const ActiveCtx = createContext<Active | null>(null);
export const useActive = () => {
  const c = useContext(ActiveCtx);
  if (!c) throw new Error("useActive outside shell");
  return c;
};

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/treasury", label: "Treasury" },
  { href: "/invoices", label: "Invoices" },
  { href: "/approvals", label: "Approvals" },
  { href: "/transactions", label: "Transactions" },
  { href: "/policies", label: "Policies" },
  { href: "/agents", label: "Agents" },
];

export function Shell({ children }: { children: ReactNode }) {
  const { signedIn, address, disconnect, config } = useWallet();
  const router = useRouter();
  const path = usePathname();
  const list = useTreasuries();
  const [active, setActive] = useState<Address | null>(null);

  useEffect(() => {
    if (!signedIn) router.replace("/");
  }, [signedIn, router]);

  useEffect(() => {
    if (!list.data) return;
    if (list.data.length === 0) { router.replace("/"); return; }
    const saved = savedTreasury();
    setActive((list.data.find((t) => t.address.toLowerCase() === saved?.toLowerCase()) ?? list.data[0]).address);
  }, [list.data, router]);

  const summary = useSummary(active ?? undefined);
  if (!signedIn || !active) return <div className="grid min-h-dvh place-items-center text-steel">Loading your treasury…</div>;

  return (
    <ActiveCtx.Provider value={{ address: active, summary: summary.data, loading: summary.isLoading }}>
      <div className="mx-auto grid min-h-dvh max-w-[1240px] gap-0 lg:grid-cols-[210px_1fr]">
        <aside className="border-b border-rule px-5 py-5 lg:sticky lg:top-0 lg:h-dvh lg:border-b-0 lg:border-r">
          <p className="text-[17px] font-semibold tracking-tight">VaultOS</p>
          <nav aria-label="Main" className="-mx-2 mt-4 flex gap-1 overflow-x-auto lg:flex-col">
            {NAV.map((n) => {
              const on = path === n.href;
              return (
                <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined} className={`flex items-center justify-between whitespace-nowrap rounded-md px-2.5 py-1.5 text-[14.5px] ${on ? "bg-ink font-medium text-white" : "text-steel hover:bg-sunk hover:text-ink"}`}>
                  {n.label}
                  {n.href === "/approvals" && !!summary.data?.pendingApprovals && (
                    <span className={`num ml-2 rounded px-1.5 text-[12px] font-semibold ${on ? "bg-white/20" : "bg-brass-tint text-brass"}`}>{summary.data.pendingApprovals}</span>
                  )}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0 px-5 pb-16 sm:px-8">
          <TopBar address={address} onDisconnect={disconnect} active={active} network={config?.network} onSwitch={(a) => { saveTreasury(a); setActive(a as Address); }} list={list.data?.map((t) => t.address) ?? []} />
          {children}
        </div>
      </div>
    </ActiveCtx.Provider>
  );
}

function TopBar({ address, onDisconnect, active, network, list, onSwitch }: { address: string | null; onDisconnect: () => void; active: Address; network?: string; list: string[]; onSwitch: (a: string) => void }) {
  const { summary } = useActive();
  const w = useTreasuryWrites(active);
  const paused = summary?.paused;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule py-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-steel">
        {list.length > 1 ? (
          <select aria-label="Treasury" value={active} onChange={(e) => onSwitch(e.target.value)} className="rounded border border-rule bg-panel px-2 py-1 font-mono text-[13px]">
            {list.map((a) => <option key={a} value={a}>{a.slice(0, 8)}…{a.slice(-4)}</option>)}
          </select>
        ) : (
          <Addr value={active} chars={5} />
        )}
        <span>{network}</span>
        <span className={`rounded px-2 py-0.5 text-[12.5px] font-medium ${paused ? "bg-oxblood-tint text-oxblood" : "bg-verdigris-tint text-verdigris"}`}>
          {paused ? "Paused. Agent payments blocked." : "Running"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {summary &&
          (paused ? (
            <Button tone="good" onClick={() => w.unpause()}>Resume treasury</Button>
          ) : (
            <ConfirmButton label="Emergency pause" confirmLabel="Pause all agent payments" onConfirm={() => w.pause()} />
          ))}
        <span className="text-[13px] text-steel">{address && <Addr value={address} />} · <button className="underline hover:text-ink" onClick={onDisconnect}>Disconnect</button></span>
      </div>
    </div>
  );
}
