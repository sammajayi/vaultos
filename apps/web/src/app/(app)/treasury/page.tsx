"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { erc20Abi, formatUsdc, parseUsdc } from "@vaultos/sdk";
import { useActive } from "@/components/Shell";
import { Button, ExplorerLink, Field, Input, Notice, PageHead, Section, money } from "@/components/ui";
import { useTreasuryWrites, useChainAction } from "@/lib/tx";
import { useWallet } from "@/lib/wallet";

const amountOk = (s: string) => /^\d+(\.\d{1,6})?$/.test(s) && Number(s) > 0;

export default function TreasuryPage() {
  const { address, summary } = useActive();
  const { address: me, publicClient, walletClient, config, chain } = useWallet();
  const w = useTreasuryWrites(address);
  const run = useChainAction();
  const [dep, setDep] = useState("");
  const [wd, setWd] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const mine = useQuery({
    queryKey: ["walletUsdc", me, config?.usdc],
    enabled: !!me && !!publicClient && !!config,
    queryFn: () => publicClient!.readContract({ address: config!.usdc, abi: erc20Abi, functionName: "balanceOf", args: [me!] }),
  });
  if (!summary) return <p className="py-10 text-steel">Reading the treasury contract…</p>;

  const isLocal = chain && chain.id !== 5042 && chain.id !== 5042002;
  const exceeds = amountOk(wd) && parseUsdc(wd) > BigInt(summary.balance);
  const lacks = amountOk(dep) && mine.data !== undefined && parseUsdc(dep) > mine.data;
  const toAddr = (to || me || "") as Address;

  return (
    <>
      <PageHead title="Treasury" sub="Only you, as owner, can add or withdraw funds. The agent can neither deposit nor withdraw." />

      <dl className="grid gap-x-10 gap-y-4 pb-8 sm:grid-cols-2">
        <div><dt className="text-[13px] text-steel">Treasury contract</dt><dd><ExplorerLink address={address}>{address}</ExplorerLink></dd></div>
        <div><dt className="text-[13px] text-steel">Balance</dt><dd className="num text-[24px] font-semibold">{money(summary.balance)}</dd></div>
        <div><dt className="text-[13px] text-steel">Status</dt><dd>{summary.paused ? "Paused. Agent payments are blocked." : "Running"}</dd></div>
        <div><dt className="text-[13px] text-steel">Your wallet holds</dt><dd className="num">{mine.data !== undefined ? money(mine.data) : "…"} USDC</dd></div>
      </dl>

      <Section title="Add funds">
        <div className="flex max-w-xl flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <Field label="Amount (USDC)" error={lacks ? "Your wallet doesn't hold that much USDC." : undefined}>
              <Input inputMode="decimal" placeholder="25000" value={dep} onChange={(e) => setDep(e.target.value)} />
            </Field>
          </div>
          <Button tone="primary" busy={busy === "dep"} disabled={!amountOk(dep) || lacks} onClick={async () => { setBusy("dep"); try { await w.deposit(parseUsdc(dep)); setDep(""); } catch {} finally { setBusy(null); } }}>Deposit</Button>
        </div>
        <p className="mt-2 max-w-[62ch] text-[13px] text-steel">Two wallet confirmations: allow the treasury to pull USDC, then deposit. Arc transactions cost a small amount of USDC in gas.</p>
        {isLocal && (
          <div className="mt-3">
            <Button busy={busy === "mint"} onClick={async () => {
              setBusy("mint");
              try { await run("Mint test USDC", () => walletClient!.writeContract({ address: config!.usdc, abi: erc20Abi, functionName: "mint", args: [me!, parseUsdc(25000)], account: walletClient!.account!, chain: walletClient!.chain } as never)); } catch {} finally { setBusy(null); }
            }}>Get 25,000 test USDC</Button>
            <span className="ml-3 text-[13px] text-steel">Local network only.</span>
          </div>
        )}
        {!isLocal && <p className="mt-2 text-[13px] text-steel">Need testnet USDC? Use the <a className="text-seal underline" href="https://faucet.circle.com" target="_blank" rel="noreferrer">Circle faucet</a> and pick Arc Testnet.</p>}
      </Section>

      <Section title="Withdraw">
        <div className="grid max-w-xl gap-3 sm:grid-cols-2">
          <Field label="Amount (USDC)" error={exceeds ? "The treasury doesn't hold that much." : undefined}>
            <Input inputMode="decimal" placeholder="1000" value={wd} onChange={(e) => setWd(e.target.value)} />
          </Field>
          <Field label="Send to" hint="Defaults to your wallet.">
            <Input placeholder={me ?? "0x…"} value={to} onChange={(e) => setTo(e.target.value)} className="font-mono text-[13.5px]" />
          </Field>
        </div>
        <div className="mt-3">
          <Button busy={busy === "wd"} disabled={!amountOk(wd) || exceeds || !/^0x[a-fA-F0-9]{40}$/.test(toAddr)} onClick={async () => { setBusy("wd"); try { await w.withdraw(parseUsdc(wd), toAddr); setWd(""); } catch {} finally { setBusy(null); } }}>Withdraw</Button>
        </div>
        {summary.paused && <div className="mt-3"><Notice tone="seal">Withdrawals still work while the treasury is paused, so you can always get your funds out.</Notice></div>}
        <p className="mt-3 text-[12.5px] text-steel">Available: {formatUsdc(BigInt(summary.balance))} USDC</p>
      </Section>
    </>
  );
}
