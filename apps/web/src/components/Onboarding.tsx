"use client";

import { useRouter } from "next/navigation";
import { useCreateTreasury } from "@/lib/tx";
import { saveTreasury } from "@/lib/hooks";
import { useWallet } from "@/lib/wallet";
import { PolicyForm } from "./PolicyForm";
import { Addr, Mark, WalletMenu } from "./ui";

export function Onboarding() {
  const create = useCreateTreasury();
  const router = useRouter();
  const { config, address, disconnect } = useWallet();

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
      <div className="flex items-center justify-between">
        <p className="display flex items-center gap-2.5 text-[20px] font-bold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-seal text-white"><Mark size={18} /></span>
          VaultOS
        </p>
        {address && <WalletMenu address={address} onDisconnect={disconnect} />}
      </div>
      <div className="mt-12 grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12">
        <div>
          <h1 className="text-[40px] font-extrabold leading-[1.02] tracking-[-0.04em] sm:text-[52px]">Set the rules, then create your treasury.</h1>
          <p className="mt-5 max-w-[48ch] text-[16px] leading-relaxed text-steel">
            Your wallet becomes the owner. These limits are written into the treasury contract, so the agent can't go beyond them. You can change them later.
          </p>
          <div className="vault mt-8 rounded-2xl p-5 text-[14px] leading-relaxed">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="display text-[17px] font-semibold">Your Payment Agent</p>
              {config && <span className="rounded-md bg-white/15 px-2 py-0.5 [&_button]:text-white"><Addr value={config.agentAddress} /></span>}
            </div>
            <p className="mt-2 text-white/80">It's authorized when the treasury is created. It can only ask the contract to pay approved suppliers within these limits.</p>
          </div>
        </div>
        <div className="card p-6 sm:p-8">
          <h2 className="mb-6 text-[22px] font-bold">Spending limits</h2>
          <PolicyForm
            submitLabel="Create treasury"
            onSubmit={async (policy) => {
              // Failures are already shown as toasts (including a declined wallet prompt); don't rethrow into an unhandled rejection.
              const a = await create(policy).catch(() => null);
              if (!a) return;
              saveTreasury(a);
              router.replace("/dashboard");
            }}
          />
        </div>
      </div>
    </main>
  );
}
