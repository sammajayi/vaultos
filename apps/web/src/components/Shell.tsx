"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Address } from "viem";
import { useWallet } from "@/lib/wallet";
import { saveTreasury, savedTreasury, useSummary, useTreasuries } from "@/lib/hooks";
import { useTreasuryWrites } from "@/lib/tx";
import type { TreasurySummary } from "@/lib/api";
import {
  Chart01Icon,
  BankIcon,
  Invoice01Icon,
  CheckmarkCircle02Icon,
  Activity01Icon,
  Settings01Icon,
  RoboticIcon,
} from "hugeicons-react";
import { Addr, Button, ConfirmButton, Mark, PageLoading, WalletMenu } from "./ui";

type Active = { address: Address; summary: TreasurySummary | undefined; loading: boolean };
const ActiveCtx = createContext<Active | null>(null);
export const useActive = () => {
  const c = useContext(ActiveCtx);
  if (!c) throw new Error("useActive outside shell");
  return c;
};

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: Chart01Icon },
  { href: "/treasury", label: "Treasury", icon: BankIcon },
  { href: "/invoices", label: "Invoices", icon: Invoice01Icon },
  { href: "/approvals", label: "Approvals", icon: CheckmarkCircle02Icon },
  { href: "/transactions", label: "Transactions", icon: Activity01Icon },
  { href: "/policies", label: "Policies", icon: Settings01Icon },
  { href: "/agents", label: "Agents", icon: RoboticIcon },
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
  if (!signedIn || !active) return <PageLoading />;

  return (
    <ActiveCtx.Provider value={{ address: active, summary: summary.data, loading: summary.isLoading }}>
      <div className="grid min-h-dvh lg:grid-cols-[248px_1fr]">
        <aside className="bg-night px-4 py-4 text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:px-5 lg:py-6">
          <p className="display flex items-center gap-2.5 px-1 text-[20px] font-bold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-seal"><Mark size={18} /></span>
            VaultOS
          </p>
          <nav aria-label="Main" className="-mx-1 mt-4 flex gap-1 overflow-x-auto lg:mx-0 lg:mt-9 lg:flex-col">
            {NAV.map((n) => {
              const on = path === n.href;
              const Icon = n.icon;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={on ? "page" : undefined}
                  className={`flex items-center justify-between whitespace-nowrap rounded-lg px-3 py-2 text-[14.5px] transition-colors ${on ? "bg-seal font-semibold text-white shadow-[0_8px_20px_-8px_rgba(58,54,224,0.9)]" : "text-white/65 hover:bg-white/8 hover:text-white"}`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon size={18} />
                    {n.label}
                  </span>
                  {n.href === "/approvals" && !!summary.data?.pendingApprovals && (
                    <span className="num ml-2 min-w-5 rounded-full bg-brass px-1.5 text-center text-[12px] font-bold text-white">{summary.data.pendingApprovals}</span>
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto hidden rounded-xl bg-night-2 p-3.5 text-[12.5px] leading-snug text-white/65 lg:block">
            <p className="font-semibold text-white">{summary.data?.paused ? "Treasury paused" : "Contract enforced"}</p>
            <p className="mt-1">{summary.data?.paused ? "The agent can't pay anyone until you resume." : "Every agent payment is checked on-chain before USDC moves."}</p>
          </div>
        </aside>

        <div className="min-w-0 px-5 pb-16 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-[1080px]">
            <TopBar address={address} onDisconnect={disconnect} active={active} network={config?.network} onSwitch={(a) => { saveTreasury(a); setActive(a as Address); }} list={list.data?.map((t) => t.address) ?? []} />
            {children}
          </div>
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
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule py-4">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-steel">
        {list.length > 1 ? (
          <select aria-label="Treasury" value={active} onChange={(e) => onSwitch(e.target.value)} className="h-9 rounded-lg border border-rule bg-panel px-2.5 font-mono text-[13px]">
            {list.map((a) => <option key={a} value={a}>{a.slice(0, 8)}…{a.slice(-4)}</option>)}
          </select>
        ) : (
          <Addr value={active} chars={5} />
        )}
        <span className="rounded-full border border-rule bg-panel px-2.5 py-0.5 text-[12.5px] font-medium text-ink">{network}</span>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12.5px] font-medium ${paused ? "bg-oxblood-tint text-oxblood" : "bg-verdigris-tint text-verdigris"}`}>
          <span aria-hidden className={`h-1.5 w-1.5 rounded-full bg-current ${paused ? "" : "animate-pulse motion-reduce:animate-none"}`} />
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
        {address && <WalletMenu address={address} onDisconnect={onDisconnect} />}
      </div>
    </div>
  );
}
