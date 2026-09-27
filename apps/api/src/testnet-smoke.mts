import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { loginMessage, TreasuryAbi } from "@vaultos/sdk";

const API = "http://127.0.0.1:4000";
const RPC = "https://rpc.testnet.arc.io";
const TREASURY = "0x5812E8366EE151bE50518b66A20Bdc807a073A36" as Address;
const CREATE_TX = "0x4130fb223dad027628ff3634603011d4900917be646952f65597e388a72fdbd5";
const RESEARCH_AGENT = "0x640c6516FED2A75a7c5A38Ca3B7810b0799Aa142" as Address;

const ownerKey = process.env.OWNER_KEY as `0x${string}`;
const owner = privateKeyToAccount(ownerKey);
const chain = { id: 5042002, name: "arc-testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } } as const;
const pub = createPublicClient({ chain, transport: http(RPC) });
const wallet = createWalletClient({ account: owner, chain, transport: http(RPC) });

let token = "";
async function api(path: string, init: { method?: string; body?: unknown } = {}) {
  const res = await fetch(API + path, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) as any };
}

async function main() {
  console.log("owner:", owner.address);

  const issuedAt = new Date().toISOString();
  const signature = await owner.signMessage({ message: loginMessage(owner.address, issuedAt) });
  const login = await api("/auth/login", { body: { address: owner.address, issuedAt, signature } });
  console.log("login:", login.status);
  token = login.data.token;

  const reg = await api("/treasuries", { body: { address: TREASURY, creationTxHash: CREATE_TX } });
  console.log("register treasury:", reg.status, JSON.stringify(reg.data));

  const name = "Research Agent";
  const category = "Research";
  const recip = await api(`/treasuries/${TREASURY}/recipients`, { body: { name, walletAddress: RESEARCH_AGENT, category } });
  console.log("recipient prep:", recip.status, JSON.stringify(recip.data));

  if (recip.status === 200) {
    const hash = await wallet.writeContract({
      address: TREASURY, abi: TreasuryAbi, functionName: "addRecipient", args: [RESEARCH_AGENT, recip.data.metadataHash],
    });
    const rc = await pub.waitForTransactionReceipt({ hash });
    console.log("addRecipient tx:", rc.status, hash);
  }

  const invoice = await api(`/treasuries/${TREASURY}/invoices`, {
    body: { supplierName: name, supplierAddress: RESEARCH_AGENT, invoiceNumber: "SMOKE-1", amount: "0.5", dueDate: "Oct 1", description: "Testnet smoke test" },
  });
  console.log("invoice:", invoice.status, JSON.stringify(invoice.data));

  if (invoice.status === 200) {
    const analyze = await api(`/invoices/${invoice.data.id}/analyze`, { method: "POST", body: {} });
    console.log("analyze:", analyze.status, JSON.stringify(analyze.data));

    const execute = await api(`/invoices/${invoice.data.id}/execute`, { body: {} });
    console.log("execute:", execute.status, JSON.stringify(execute.data));
  }
}

main();
