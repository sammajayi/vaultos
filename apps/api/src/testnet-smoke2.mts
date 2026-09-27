import { privateKeyToAccount } from "viem/accounts";
import { loginMessage } from "@vaultos/sdk";

const API = "http://127.0.0.1:4000";
const INVOICE_ID = "cmuj22fug000ivb7r6wrjez0s";

const ownerKey = process.env.OWNER_KEY as `0x${string}`;
const owner = privateKeyToAccount(ownerKey);

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
  const issuedAt = new Date().toISOString();
  const signature = await owner.signMessage({ message: loginMessage(owner.address, issuedAt) });
  const login = await api("/auth/login", { body: { address: owner.address, issuedAt, signature } });
  token = login.data.token;
  console.log("login:", login.status);

  const analyze = await api(`/invoices/${INVOICE_ID}/analyze`, { method: "POST", body: {} });
  console.log("analyze:", analyze.status, JSON.stringify(analyze.data));

  const execute = await api(`/invoices/${INVOICE_ID}/execute`, { body: {} });
  console.log("execute:", execute.status, JSON.stringify(execute.data));
}

main();
