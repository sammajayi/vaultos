"use client";

import { useState } from "react";
import { useWallet } from "@/lib/wallet";
import { Button, Mark, Notice } from "./ui";
import { Tumblers, pinsFromCodes } from "./Tumblers";

const SCENARIOS = [
  { id: "aws", title: "AWS", amount: "$750", note: "Approved supplier, within limits", codes: [] as string[] },
  { id: "eq", title: "ETH", amount: "$3,500", note: "Approved supplier, above the agent's limit", codes: ["REQUIRES_HUMAN_APPROVAL"] },
  { id: "bad", title: "ARC", amount: "$20,000", note: "Not approved, over the cap", codes: ["RECIPIENT_NOT_APPROVED", "EXCEEDS_TX_LIMIT", "EXCEEDS_DAILY_LIMIT", "EXCEEDS_MONTHLY_LIMIT"] },
];

export function Landing() {
  const { connect, connecting, error, config, configError, hasBrowserWallet } = useWallet();
  const [sel, setSel] = useState(0);
  const [pending, setPending] = useState<"browser" | "demo" | null>(null);
  const sc = SCENARIOS[sel];
  const go = (k: "browser" | "demo") => { setPending(k); connect(k).finally(() => setPending(null)); };

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col px-5 py-8 sm:px-10 lg:px-14 lg:py-10">
        <p className="display flex items-center gap-2.5 text-[20px] font-bold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-seal text-white"><Mark size={18} /></span>
          VaultOS
        </p>
        <div className="my-auto max-w-[560px] py-14">
          <h1 className="text-[48px] font-extrabold leading-[0.98] tracking-[-0.045em] sm:text-[68px]">
            Software proposes.<br />The contract decides.
          </h1>
          <p className="mt-6 max-w-[48ch] text-[17px] leading-relaxed text-steel">
            VaultOS lets an AI agent pay your invoices in USDC on Arc, inside limits you set. Your treasury contract checks every payment. The agent never holds the keys.
          </p>

          <div className="mt-9 flex flex-wrap gap-3">
            <Button tone="primary" className="min-h-12 px-6 text-[15px]" busy={connecting && pending === "browser"} disabled={!config} onClick={() => go("browser")}>Connect wallet</Button>
            <Button className="min-h-12 px-6 text-[15px]" busy={connecting && pending === "demo"} disabled={!config} onClick={() => go("demo")}>Try with a demo wallet</Button>
          </div>
          <p className="mt-4 max-w-[52ch] text-[13px] text-steel">
            {hasBrowserWallet ? "Signing in proves you own the address. It moves no funds." : "No browser wallet detected. Install MetaMask, or use the demo wallet."}{" "}
            The demo wallet is a throwaway key kept in this browser. Use it on testnet only.
          </p>
          <div className="mt-4 space-y-2">
            {error && <Notice tone="oxblood">{error}</Notice>}
            {configError && <Notice tone="oxblood">{configError}</Notice>}
          </div>
        </div>
      </div>

      <div className="vault flex items-center justify-center px-5 py-12 sm:px-10 lg:m-3 lg:rounded-[28px]">
        <div className="w-full max-w-[520px]">
          <p className="display text-[28px] font-bold leading-tight sm:text-[34px]">Watch the contract decide.</p>
          <p className="mt-2 max-w-[44ch] text-[15px] text-white/75">Pick an invoice. Each pin is one rule the treasury contract checks before it moves USDC.</p>
          <div role="tablist" aria-label="Sample invoices" className="mt-6 flex flex-wrap gap-2">
            {SCENARIOS.map((s, i) => (
              <button
                key={s.id}
                role="tab"
                aria-selected={sel === i}
                onClick={() => setSel(i)}
                className={`rounded-full px-4 py-2 text-left text-[13.5px] transition-colors ${sel === i ? "bg-white font-semibold text-night" : "bg-white/10 text-white hover:bg-white/20"}`}
              >
                <span className="num font-bold">{s.amount}</span> <span>to {s.title}</span>
              </button>
            ))}
          </div>
          <div className="ledger mt-5 rounded-2xl bg-panel p-5 text-ink shadow-[0_30px_60px_-20px_rgba(0,0,0,0.5)] sm:p-6">
            <p className="text-[14px] font-medium text-steel">{sc.note}.</p>
            <div className="mt-4" key={sc.id}>
              <Tumblers pins={pinsFromCodes(sc.codes)} live />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
