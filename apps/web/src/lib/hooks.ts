"use client";

import { useQuery } from "@tanstack/react-query";
import { api, type AgentRow, type Approval, type Invoice, type Recipient, type TreasurySummary, type Tx } from "./api";
import { useWallet } from "./wallet";

const KEY = "vaultos.treasury";
export const savedTreasury = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
export const saveTreasury = (a: string) => { try { localStorage.setItem(KEY, a); } catch {} };

export function useTreasuries() {
  const { signedIn, address } = useWallet();
  return useQuery({ queryKey: ["treasuries", address], enabled: signedIn, queryFn: () => api<{ address: `0x${string}`; network: string }[]>("/treasuries") });
}

export function useSummary(addr?: string) {
  return useQuery({ queryKey: ["summary", addr], enabled: !!addr, refetchInterval: 8000, queryFn: () => api<TreasurySummary>(`/treasuries/${addr}`) });
}
export const useInvoices = (a?: string) => useQuery({ queryKey: ["invoices", a], enabled: !!a, refetchInterval: 6000, queryFn: () => api<Invoice[]>(`/treasuries/${a}/invoices`) });
export const useApprovals = (a?: string) => useQuery({ queryKey: ["approvals", a], enabled: !!a, refetchInterval: 6000, queryFn: () => api<Approval[]>(`/treasuries/${a}/approvals`) });
export const useRecipients = (a?: string) => useQuery({ queryKey: ["recipients", a], enabled: !!a, queryFn: () => api<Recipient[]>(`/treasuries/${a}/recipients`) });
export const useTxs = (a?: string) => useQuery({ queryKey: ["txs", a], enabled: !!a, refetchInterval: 8000, queryFn: () => api<Tx[]>(`/treasuries/${a}/transactions`) });
export const useAgents = (a?: string) => useQuery({ queryKey: ["agents", a], enabled: !!a, queryFn: () => api<AgentRow[]>(`/treasuries/${a}/agents`) });
