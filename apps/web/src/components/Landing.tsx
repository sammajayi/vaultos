"use client";

import { useState } from "react";
import { useWallet } from "@/lib/wallet";
import { Button, Notice } from "./ui";
import { Tumblers, pinsFromCodes } from "./Tumblers";

const SCENARIOS = [
  { id: "aws", title: "AWS", amount: "$750", note: "Approved supplier, within limits", codes: [] as string[] },
  { id: "eq", title: "Supplier A", amount: "$4,500", note: "Approved supplier, above the agent's limit", codes: ["REQUIRES_HUMAN_APPROVAL"] },
  { id: "bad", title: "Unknown supplier", amount: "$20,000", note: "Not approved, over the cap", codes: ["RECIPIENT_NOT_APPROVED", "EXCEEDS_TX_LIMIT", "EXCEEDS_DAILY_LIMIT", "EXCEEDS_MONTHLY_LIMIT"] },
];

export function Landing() {
  const { connect, connecting, error, config, configError, hasBrowserWallet } = useWallet();
  const [sel, setSel] = useState(0);
  const sc = SCENARIOS[sel];

  return (
    <main className="mx-auto grid min-h-dvh max-w-6xl content-center gap-12 px-5 py-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
      <div>
        <p className="text-[15px] font-semibold tracking-tight">VaultOS</p>
        <h1 className="mt-6 text-[44px] font-semibold leading-[1.04] tracking-[-0.03em] sm:text-[56px]">
          Software proposes.<br />The contract decides.
        </h1>
        <p className="mt-5 max-w-[52ch] text-[17px] leading-relaxed text-steel">
          VaultOS lets an AI agent pay your invoices in USDC on Arc, inside limits you set. Your treasury contract checks every payment. The agent never holds the keys.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button tone="primary" busy={connecting} disabled={!config || !hasBrowserWallet} onClick={() => connect("browser")}>Connect wallet</Button>
          <Button busy={connecting} disabled={!config} onClick={() => connect("demo")}>Try with a demo wallet</Button>
        </div>
        <p className="mt-3 max-w-[52ch] text-[13px] text-steel">
          {hasBrowserWallet ? "Signing in proves you own the address. It moves no funds." : "No browser wallet detected. Install MetaMask, or use the demo wallet."}{" "}
          The demo wallet is a throwaway key kept in this browser. Use it on testnet only.
        </p>
        <div className="mt-4 space-y-2">
          {error && <Notice tone="oxblood">{error}</Notice>}
          {configError && <Notice tone="oxblood">{configError}</Notice>}
        </div>
      </div>

      <div className="rounded-lg border border-rule bg-panel p-5 sm:p-6">
        <p className="text-[15px] font-semibold">See how a payment is decided</p>
        <p className="mt-1 text-[13.5px] text-steel">Pick an invoice. Each pin is one rule the treasury contract checks before it moves USDC.</p>
        <div role="tablist" aria-label="Sample invoices" className="mt-4 flex flex-wrap gap-2">
          {SCENARIOS.map((s, i) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={sel === i}
              onClick={() => setSel(i)}
              className={`rounded-md border px-3 py-1.5 text-left text-[13.5px] transition-colors ${sel === i ? "border-seal bg-seal-tint text-seal" : "border-rule bg-white hover:bg-sunk"}`}
            >
              <span className="num font-semibold">{s.amount}</span> <span>{s.title}</span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-[13.5px] text-steel">{sc.note}.</p>
        <div className="mt-4" key={sc.id}>
          <Tumblers pins={pinsFromCodes(sc.codes)} live />
        </div>
      </div>
    </main>
  );
}
