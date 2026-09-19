import {
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  createWalletClient,
  decodeEventLog,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { TreasuryAbi, explainRevert } from "@vaultos/sdk";

export class PaymentRefused extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

const revertCode = (e: unknown): string => {
  const msg = e instanceof Error ? `${e.message} ${(e as { shortMessage?: string }).shortMessage ?? ""}` : String(e);
  const m = msg.match(/[A-Z][A-Z_]{4,}/g);
  const known = m?.find((c) => explainRevert(c) !== c);
  return known ?? "UNKNOWN_REVERT";
};

/**
 * The agent's ONLY on-chain capability. It has no transfer(), no approve(), no admin calls — just
 * the two functions the Treasury lets an authorized agent call. Whatever it asks, the contract decides.
 * The key lives server-side only and is never the treasury owner (the contract enforces that too).
 */
export class AgentWallet {
  readonly address: Address;
  private wallet;
  constructor(privateKey: Hex, chain: Chain, rpcUrl: string, private client: PublicClient) {
    const account = privateKeyToAccount(privateKey);
    this.address = account.address;
    this.wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });
  }

  /** Dry-run against the real contract: same code path, no gas. Returns the revert code on refusal. */
  async simulate(kind: "executePayment" | "requestPayment", treasury: Address, recipient: Address, amount: bigint, invoiceId: Hex) {
    try {
      await this.client.simulateContract({
        address: treasury,
        abi: TreasuryAbi,
        functionName: kind,
        args: [recipient, amount, invoiceId],
        account: this.address,
      });
      return { ok: true as const };
    } catch (e) {
      const code = revertCode(e);
      return { ok: false as const, code, message: explainRevert(code) };
    }
  }

  async submit(kind: "executePayment" | "requestPayment", treasury: Address, recipient: Address, amount: bigint, invoiceId: Hex) {
    const sim = await this.simulate(kind, treasury, recipient, amount, invoiceId);
    if (!sim.ok) throw new PaymentRefused(sim.code, sim.message);

    const hash = await this.wallet.writeContract({
      address: treasury,
      abi: TreasuryAbi,
      functionName: kind,
      args: [recipient, amount, invoiceId],
    });
    const receipt = await this.client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new PaymentRefused("TX_REVERTED", "Transaction reverted on-chain.");

    let requestId: bigint | undefined;
    let executed = false;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== treasury.toLowerCase()) continue;
      try {
        const ev = decodeEventLog({ abi: TreasuryAbi, data: log.data, topics: log.topics });
        if (ev.eventName === "PaymentRequested") requestId = ev.args.requestId;
        if (ev.eventName === "PaymentExecuted") executed = true;
      } catch {
        /* not a Treasury event */
      }
    }
    return { txHash: hash, requestId, executed };
  }
}
