import { createPublicClient, defineChain, http, type Address, type Hex } from "viem";
import { arcMainnet, arcTestnet } from "@vaultos/sdk";
import { AgentWallet } from "@vaultos/agent";
import { env } from "./env";

// Known Arc networks use the SDK definitions; anything else (e.g. a local anvil) is a generic chain.
export const chain =
  env.ARC_CHAIN_ID === arcTestnet.id
    ? arcTestnet
    : env.ARC_CHAIN_ID === arcMainnet.id
      ? arcMainnet
      : defineChain({
          id: env.ARC_CHAIN_ID,
          name: `Local ${env.ARC_CHAIN_ID}`,
          nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
          rpcUrls: { default: { http: [env.ARC_RPC_URL] } },
        });

export const publicClient = createPublicClient({ chain, transport: http(env.ARC_RPC_URL) });

export const agentWallet = new AgentWallet(env.AGENT_PRIVATE_KEY as Hex, chain, env.ARC_RPC_URL, publicClient);
export const AGENT_ADDRESS = agentWallet.address as Address;
export const FACTORY = env.TREASURY_FACTORY_ADDRESS as Address;
export const USDC = env.ARC_USDC_ADDRESS as Address;
export const networkName = chain.name;
