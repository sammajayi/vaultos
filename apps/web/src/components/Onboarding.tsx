"use client";

import { useRouter } from "next/navigation";
import { useCreateTreasury } from "@/lib/tx";
import { saveTreasury } from "@/lib/hooks";
import { useWallet } from "@/lib/wallet";
import { PolicyForm } from "./PolicyForm";
import { Notice, Addr } from "./ui";

export function Onboarding() {
  const create = useCreateTreasury();
  const router = useRouter();
  const { config, address, disconnect } = useWallet();

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <div className="flex items-center justify-between">
        <p className="text-[15px] font-semibold tracking-tight">VaultOS</p>
        <p className="text-[13px] text-steel">Signed in as {address && <Addr value={address} />} · <button className="underline" onClick={disconnect}>Disconnect</button></p>
      </div>
      <h1 className="mt-10 text-[32px] font-semibold leading-tight tracking-tight">Set the rules, then create your treasury</h1>
      <p className="mt-2 max-w-[60ch] text-steel">
        Your wallet becomes the owner. These limits are written into the treasury contract, so the agent can't go beyond them. You can change them later.
      </p>
      <div className="mt-6 space-y-3">
        <Notice tone="seal">
          The Payment Agent ({config && <Addr value={config.agentAddress} />}) is authorized when the treasury is created. It can only ask the contract to pay approved suppliers within these limits.
        </Notice>
      </div>
      <div className="mt-8">
        <PolicyForm
          submitLabel="Create treasury"
          onSubmit={async (policy) => {
            const a = await create(policy);
            saveTreasury(a);
            router.replace("/dashboard");
          }}
        />
      </div>
    </main>
  );
}
