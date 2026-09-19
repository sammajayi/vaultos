"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Address, Hex } from "viem";
import { TreasuryAbi, TreasuryFactoryAbi, erc20Abi, explainRevert } from "@vaultos/sdk";
import { useWallet } from "./wallet";
import { api } from "./api";

export type Toast = { id: number; tone: "info" | "good" | "bad"; text: string; hash?: string };
const ToastCtx = createContext<{ toasts: Toast[]; push: (t: Omit<Toast, "id">, ms?: number) => number; drop: (id: number) => void } | null>(null);
export const useToasts = () => {
  const c = useContext(ToastCtx);
  if (!c) throw new Error("no toasts");
  return c;
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const drop = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((t: Omit<Toast, "id">, ms = 6000) => {
    const id = Date.now() + Math.random();
    setToasts((s) => [...s, { ...t, id }]);
    if (ms) setTimeout(() => drop(id), ms);
    return id;
  }, [drop]);
  return <ToastCtx.Provider value={{ toasts, push, drop }}>{children}</ToastCtx.Provider>;
}

export const errText = (e: unknown): string => {
  const m = (e as { shortMessage?: string; message?: string }).shortMessage ?? (e as Error).message ?? String(e);
  if (/User rejected|denied transaction/i.test(m)) return "You declined the request in your wallet.";
  return explainRevert(m);
};

/** Runs an on-chain write with consistent toasts, then syncs the API and refreshes data. */
export function useChainAction(treasury?: Address) {
  const { walletClient, publicClient, chain } = useWallet();
  const { push, drop } = useToasts();
  const qc = useQueryClient();

  return useCallback(
    async (label: string, write: () => Promise<Hex>, done?: string) => {
      if (!walletClient || !publicClient || !chain) throw new Error("Connect a wallet first.");
      const wait = push({ tone: "info", text: `${label}: confirm in your wallet…` }, 0);
      try {
        const hash = await write();
        drop(wait);
        const wait2 = push({ tone: "info", text: `${label}: settling on ${chain.name}…`, hash }, 0);
        const rc = await publicClient.waitForTransactionReceipt({ hash });
        drop(wait2);
        if (rc.status !== "success") throw new Error("Transaction reverted.");
        if (treasury) await api(`/treasuries/${treasury}/sync`, { method: "POST", body: {} }).catch(() => {});
        await qc.invalidateQueries();
        push({ tone: "good", text: done ?? `${label} confirmed`, hash });
        return rc;
      } catch (e) {
        drop(wait);
        push({ tone: "bad", text: `${label} failed. ${errText(e)}` }, 9000);
        throw e;
      }
    },
    [walletClient, publicClient, chain, push, drop, qc, treasury],
  );
}

/** Typed contract writes the owner can make. The agent never appears here: it has its own server-side key. */
export function useTreasuryWrites(treasury: Address) {
  const { walletClient, config } = useWallet();
  const run = useChainAction(treasury);
  const w = () => {
    if (!walletClient?.account) throw new Error("Connect a wallet first.");
    return walletClient;
  };
  const treasuryCall = (functionName: string, args: unknown[] = []) =>
    w().writeContract({ address: treasury, abi: TreasuryAbi, functionName, args, account: w().account!, chain: w().chain } as never);

  return {
    deposit: async (amount: bigint) => {
      await run("Approve USDC", () =>
        w().writeContract({ address: config!.usdc, abi: erc20Abi, functionName: "approve", args: [treasury, amount], account: w().account!, chain: w().chain } as never),
      );
      return run("Deposit", () => treasuryCall("deposit", [amount]), "Deposit confirmed");
    },
    withdraw: (amount: bigint, to: Address) => run("Withdraw", () => treasuryCall("withdraw", [config!.usdc, amount, to]), "Withdrawal confirmed"),
    addRecipient: (recipient: Address, metadataHash: Hex) => run("Approve supplier", () => treasuryCall("addRecipient", [recipient, metadataHash]), "Supplier approved on-chain"),
    removeRecipient: (recipient: Address) => run("Remove supplier", () => treasuryCall("removeRecipient", [recipient]), "Supplier removed"),
    updatePolicy: (p: { maxTransactionAmount: bigint; dailyLimit: bigint; monthlyLimit: bigint; approvalThreshold: bigint; expiresAt: bigint; active: boolean }) =>
      run("Update policy", () => treasuryCall("updatePolicy", [p]), "Policy updated on-chain"),
    pause: () => run("Emergency pause", () => treasuryCall("pause"), "Treasury paused. Agent payments are blocked."),
    unpause: () => run("Resume treasury", () => treasuryCall("unpause"), "Treasury resumed"),
    approvePayment: (id: bigint) => run("Approve payment", () => treasuryCall("approvePayment", [id]), "Payment approved and settled"),
    rejectPayment: (id: bigint) => run("Reject payment", () => treasuryCall("rejectPayment", [id]), "Payment rejected"),
    authorizeAgent: (agent: Address, expiresAt: bigint) => run("Authorize agent", () => treasuryCall("authorizeAgent", [agent, expiresAt]), "Agent authorized"),
    revokeAgent: (agent: Address) => run("Revoke agent", () => treasuryCall("revokeAgent", [agent]), "Agent revoked"),
  };
}

export function useCreateTreasury() {
  const { walletClient, publicClient, config } = useWallet();
  const run = useChainAction();
  return async (policy: { maxTransactionAmount: bigint; dailyLimit: bigint; monthlyLimit: bigint; approvalThreshold: bigint; expiresAt: bigint; active: boolean }) => {
    if (!walletClient?.account || !config || !publicClient) throw new Error("Connect a wallet first.");
    const rc = await run(
      "Create treasury",
      () =>
        walletClient.writeContract({
          address: config.factory, abi: TreasuryFactoryAbi, functionName: "createTreasury",
          args: [policy, config.agentAddress, 0n], account: walletClient.account!, chain: walletClient.chain,
        } as never),
      "Treasury created",
    );
    const { decodeEventLog } = await import("viem");
    for (const l of rc.logs) {
      try {
        const e = decodeEventLog({ abi: TreasuryFactoryAbi, data: l.data, topics: l.topics });
        if (e.eventName === "TreasuryCreated") {
          await api("/treasuries", { body: { address: e.args.treasury, creationTxHash: rc.transactionHash } });
          return e.args.treasury as Address;
        }
      } catch {}
    }
    throw new Error("Treasury created but its address could not be read.");
  };
}
