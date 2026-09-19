import Anthropic from "@anthropic-ai/sdk";
import { decodeEventLog, type Address, type Hex, type PublicClient } from "viem";
import { TreasuryAbi, parseUsdc } from "@vaultos/sdk";
import { EXPLAIN_MODEL } from "./explain";

/** Price of one research answer. Small on purpose: this demonstrates a machine-to-machine payment. */
export const RESEARCH_PRICE = parseUsdc("0.25");

/**
 * The Research Agent never trusts the buyer's word: it only answers after finding a PaymentExecuted
 * event from the buyer's treasury paying *it*, for at least the price, against the expected invoice id.
 */
export async function verifyResearchPayment(
  client: PublicClient,
  a: { treasury: Address; txHash: Hex; researchAgent: Address; invoiceId: Hex },
): Promise<boolean> {
  const rc = await client.getTransactionReceipt({ hash: a.txHash });
  if (rc.status !== "success") return false;
  for (const log of rc.logs) {
    if (log.address.toLowerCase() !== a.treasury.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: TreasuryAbi, data: log.data, topics: log.topics });
      if (
        ev.eventName === "PaymentExecuted" &&
        ev.args.recipient.toLowerCase() === a.researchAgent.toLowerCase() &&
        ev.args.amount >= RESEARCH_PRICE &&
        ev.args.invoiceId === a.invoiceId
      )
        return true;
    } catch {
      /* not a treasury event */
    }
  }
  return false;
}

export async function researchAnswer(question: string, apiKey = process.env.ANTHROPIC_API_KEY): Promise<{ answer: string; source: "llm" | "demo" }> {
  const q = question.trim().slice(0, 500);
  if (!apiKey) {
    return {
      answer: `Demo mode (no ANTHROPIC_API_KEY set): the Research Agent received a verified $0.25 payment for "${q}". Set a key to get a written answer.`,
      source: "demo",
    };
  }
  try {
    const res = await new Anthropic({ apiKey }).messages.create({
      model: EXPLAIN_MODEL,
      max_tokens: 400,
      system: "You are a research assistant sold per question. Answer in at most 4 sentences. If you are unsure, say so. You have no internet access.",
      messages: [{ role: "user", content: q }],
    });
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    return { answer: text || "No answer produced.", source: "llm" };
  } catch {
    return { answer: "The Research Agent could not produce an answer right now. Your payment was verified.", source: "demo" };
  }
}
