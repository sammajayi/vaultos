"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  http,
  type Address,
  type Chain,
  type PublicClient,
  type WalletClient,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { arcMainnet, arcTestnet, loginMessage } from "@vaultos/sdk";
import { api, setToken, type AppConfig } from "./api";

type Kind = "browser" | "demo";
type Ctx = {
  config: AppConfig | null;
  configError: string | null;
  chain: Chain | null;
  publicClient: PublicClient | null;
  walletClient: WalletClient | null;
  address: Address | null;
  kind: Kind | null;
  signedIn: boolean;
  hasBrowserWallet: boolean;
  connecting: boolean;
  error: string | null;
  connect: (k: Kind) => Promise<void>;
  disconnect: () => void;
};

const WalletCtx = createContext<Ctx | null>(null);
export const useWallet = () => {
  const c = useContext(WalletCtx);
  if (!c) throw new Error("useWallet outside provider");
  return c;
};

const DEMO_KEY = "vaultos.demoKey";
const SESSION = "vaultos.session";

const chainFrom = (c: AppConfig): Chain =>
  c.chainId === arcTestnet.id
    ? arcTestnet
    : c.chainId === arcMainnet.id
      ? arcMainnet
      : defineChain({
          id: c.chainId,
          name: c.network,
          nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
          rpcUrls: { default: { http: [c.rpcUrl] } },
        });

const safe = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k: string) => { try { localStorage.removeItem(k); } catch {} },
};

export function WalletProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null);
  const [address, setAddress] = useState<Address | null>(null);
  const [kind, setKind] = useState<Kind | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<AppConfig>("/config").then(setConfig).catch((e) => setConfigError(e.message));
  }, []);

  const chain = useMemo(() => (config ? chainFrom(config) : null), [config]);
  const publicClient = useMemo(
    () => (chain && config ? (createPublicClient({ chain, transport: http(config.rpcUrl) }) as PublicClient) : null),
    [chain, config],
  );
  const hasBrowserWallet = typeof window !== "undefined" && !!(window as unknown as { ethereum?: unknown }).ethereum;

  const disconnect = useCallback(() => {
    setToken(null);
    setWalletClient(null);
    setAddress(null);
    setKind(null);
    setSignedIn(false);
    safe.del(SESSION);
  }, []);

  const connect = useCallback(
    async (k: Kind) => {
      if (!config || !chain) return;
      setConnecting(true);
      setError(null);
      try {
        let client: WalletClient;
        let account: Address;
        if (k === "demo") {
          let key = safe.get(DEMO_KEY) as `0x${string}` | null;
          if (!key) {
            key = generatePrivateKey();
            safe.set(DEMO_KEY, key);
          }
          const acct = privateKeyToAccount(key);
          account = acct.address;
          client = createWalletClient({ account: acct, chain, transport: http(config.rpcUrl) });
        } else {
          const eth = (window as unknown as { ethereum?: { request: (a: { method: string }) => Promise<string[]> } }).ethereum;
          if (!eth) throw new Error("No browser wallet found. Install MetaMask or use the demo wallet.");
          const [a] = await eth.request({ method: "eth_requestAccounts" });
          account = a as Address;
          client = createWalletClient({ account, chain, transport: custom(eth as never) });
          try {
            await client.switchChain({ id: chain.id });
          } catch {
            await client.addChain({ chain });
            await client.switchChain({ id: chain.id });
          }
        }
        const issuedAt = new Date().toISOString();
        const signature = await client.signMessage({ account: client.account!, message: loginMessage(account, issuedAt) });
        const res = await api<{ token: string }>("/auth/login", { body: { address: account, issuedAt, signature } });
        setToken(res.token);
        setWalletClient(client);
        setAddress(account);
        setKind(k);
        setSignedIn(true);
        safe.set(SESSION, k);
      } catch (e) {
        const msg = (e as { shortMessage?: string; message?: string }).shortMessage ?? (e as Error).message;
        setError(/rejected|denied/i.test(msg) ? "Signature request was declined." : msg);
      } finally {
        setConnecting(false);
      }
    },
    [config, chain],
  );

  // Demo wallet reconnects silently (no popup); browser wallets ask again so the user stays in control.
  useEffect(() => {
    if (config && safe.get(SESSION) === "demo" && !signedIn) void connect("demo");
  }, [config, signedIn, connect]);

  return (
    <WalletCtx.Provider
      value={{ config, configError, chain, publicClient, walletClient, address, kind, signedIn, hasBrowserWallet, connecting, error, connect, disconnect }}
    >
      {children}
    </WalletCtx.Provider>
  );
}
