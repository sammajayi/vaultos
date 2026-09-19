import type { Address, Hex, PublicClient } from "viem";
import { parseUsdc, invoiceIdFor } from "@vaultos/sdk";
import { readPolicyContext, type PolicyContext } from "./context";
import { decide, type Decision } from "./decide";
import { explainDecision } from "./explain";
import { InvoiceInput } from "./invoice";

export * from "./context";
export * from "./decide";
export * from "./executor";
export * from "./invoice";
export { explainDecision } from "./explain";

export type Analysis = {
  invoice: InvoiceInput;
  invoiceId: Hex;
  context: PolicyContext;
  decision: Decision;
  explanationSource: "llm" | "rules";
};

/** The full decision pipeline (PRD §18): Parse → Identify → Policy context → Decide. */
export async function analyzeInvoice(
  client: PublicClient,
  args: { treasury: Address; agent: Address; invoice: unknown },
): Promise<Analysis> {
  const invoice = InvoiceInput.parse(args.invoice); // Stage 1
  const invoiceId = invoiceIdFor(args.treasury, invoice.supplierAddress, invoice.invoiceNumber);
  const context = await readPolicyContext(client, {
    treasury: args.treasury,
    agent: args.agent,
    recipient: invoice.supplierAddress as Address, // Stage 2 happens on-chain: isRecipient()
    amount: parseUsdc(invoice.amount),
    invoiceId,
  }); // Stage 3
  const decision = decide(context); // Stage 4
  const { reason, source } = await explainDecision(invoice, context, decision);
  return { invoice, invoiceId, context, decision: { ...decision, reason }, explanationSource: source };
}
