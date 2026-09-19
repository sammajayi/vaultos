export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type AppConfig = {
  network: string;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string | null;
  factory: `0x${string}`;
  usdc: `0x${string}`;
  agentAddress: `0x${string}`;
  attackSimulation: boolean;
};

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

let token: string | null = null;
export const setToken = (t: string | null) => {
  token = t;
};

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError("Can't reach the VaultOS API. Check that it is running.", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `Request failed (${res.status})`, res.status);
  return data as T;
}

// ---- response shapes (amounts are 6-decimal USDC base units as strings) ----
export type Policy = {
  maxTransactionAmount: string;
  dailyLimit: string;
  monthlyLimit: string;
  approvalThreshold: string;
  expiresAt: string;
  active: boolean;
};
export type TreasurySummary = {
  address: `0x${string}`;
  network: string;
  owner: string;
  paused: boolean;
  balance: string;
  spentToday: string;
  spentThisMonth: string;
  policy: Policy;
  agent: { address: string; active: boolean; expiresAt: string };
  pendingApprovals: number;
  activeAgents: number;
  recipients: number;
  invoiceCounts: Record<string, number>;
};
export type Decision = {
  decision: "AUTONOMOUS_APPROVAL" | "HUMAN_APPROVAL" | "REJECT";
  reason: string;
  checks: Record<string, boolean>;
  blockers: string[];
  explanationSource?: "llm" | "rules";
};
export type Invoice = {
  id: string;
  supplierName: string;
  supplierAddress: string;
  invoiceNumber: string;
  amount: string;
  description: string;
  dueDate: string;
  status: string;
  agentDecision: Decision | null;
  failureReason: string | null;
  createdAt: string;
  paymentRequest: { onchainRequestId: string | null; status: string; executionTxHash: string | null; requestTxHash: string | null } | null;
};
export type Approval = {
  id: string;
  onchainRequestId: string;
  amount: string;
  recipient: string;
  createdAt: string;
  invoice: Invoice & { recipient: { name: string; category: string } | null };
};
export type Recipient = { id: string; name: string; walletAddress: string; category: string; status: "APPROVED" | "PENDING" | "REMOVED" };
export type Tx = {
  id: string;
  type: string;
  amount: string | null;
  recipient: string | null;
  recipientName: string | null;
  invoiceRef: string | null;
  agent: string | null;
  policyNote: string | null;
  txHash: string | null;
  status: string;
  timestamp: string;
};
export type AgentRow = {
  name: string;
  address: string;
  status: "ACTIVE" | "PAUSED" | "REVOKED" | "EXPIRED";
  expiresAt: string;
  authority: { perTransaction: string; daily: string; monthly: string };
  spentToday: string;
};
