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
  type EIP1193Provider,
  type PublicClient,
  type WalletClient,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { WagmiProvider, createConfig, useConnectors } from "wagmi";
import { injected } from "wagmi/connectors";
import { arcMainnet, arcTestnet, loginMessage } from "@vaultos/sdk";
import { api, setToken, type AppConfig } from "./api";

// wagmi's injected() connector uses EIP-6963 provider discovery: every wallet extension
// announces itself over an event, so we pick it up whenever it arrives instead of relying on a
// single, possibly-stale snapshot of window.ethereum. The chain list here is fixed and separate
// from viem's own `chain` (below), which follows the API's live config.
const wagmiConfig = createConfig({
  chains: [arcTestnet, arcMainnet],
  connectors: [injected()],
  transports: { [arcTestnet.id]: http(), [arcMainnet.id]: http() },
});

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
  return (
    <WagmiProvider config={wagmiConfig}>
      <WalletProviderInner>{children}</WalletProviderInner>
    </WagmiProvider>
  );
}

function WalletProviderInner({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null);
  const [address, setAddress] = useState<Address | null>(null);
  const [kind, setKind] = useState<Kind | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reactive: wagmi appends a connector the instant a wallet extension announces itself
  // (EIP-6963), so this stays accurate even if the extension injects after mount.
  const connectors = useConnectors();
  const hasBrowserWallet = connectors.length > 0;

  useEffect(() => {
    api<AppConfig>("/config").then(setConfig).catch((e) => setConfigError(e.message));
  }, []);

  const chain = useMemo(() => (config ? chainFrom(config) : null), [config]);
  const publicClient = useMemo(
    () => (chain && config ? (createPublicClient({ chain, transport: http(config.rpcUrl) }) as PublicClient) : null),
    [chain, config],
  );

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
          const connector = connectors.find((c) => c.name === "MetaMask") ?? connectors[0];
          if (!connector) throw new Error("No browser wallet found. Install MetaMask or use the demo wallet.");
          const eth = (await connector.getProvider()) as EIP1193Provider;
          const [a] = await eth.request({ method: "eth_requestAccounts" });
          account = a as Address;
          client = createWalletClient({ account, chain, transport: custom(eth) });
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
    [config, chain, connectors],
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
