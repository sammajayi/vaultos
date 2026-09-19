import { formatUnits, keccak256, parseUnits, stringToHex } from "viem";
import { USDC_DECIMALS } from "./chains";

/** "750.5" -> 750500000n */
export const parseUsdc = (v: string | number): bigint => parseUnits(String(v), USDC_DECIMALS);

/** 750500000n -> "750.5" */
export const formatUsdc = (v: bigint): string => formatUnits(v, USDC_DECIMALS);

/** "$1,234.50" style for display */
export const usd = (v: bigint | string | number): string => {
  const n = typeof v === "bigint" ? Number(formatUsdc(v)) : Number(v);
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
};

/**
 * Deterministic on-chain invoice id. Scoped by treasury + supplier + invoice number so the same
 * invoice can never be paid twice by the same treasury (contract-level replay protection).
 */
export const invoiceIdFor = (treasury: string, supplierAddress: string, invoiceNumber: string) =>
  keccak256(stringToHex(`${treasury.toLowerCase()}|${supplierAddress.toLowerCase()}|${invoiceNumber.trim().toUpperCase()}`));

/** Recipient metadata hash stored on-chain; the readable name lives off-chain. */
export const recipientMetadataHash = (name: string, category: string) =>
  keccak256(stringToHex(JSON.stringify({ name: name.trim(), category: category.trim() })));
