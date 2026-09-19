import { z } from "zod";

/** Stage 1 — Parse. Invoices are untrusted input: validate and normalise before anything else. */
export const InvoiceInput = z.object({
  supplierName: z.string().trim().min(1).max(120),
  supplierAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid wallet address"),
  invoiceNumber: z.string().trim().min(1).max(64),
  amount: z.string().regex(/^\d+(\.\d{1,6})?$/, "Amount must be a USDC value with up to 6 decimals"),
  dueDate: z.string().trim().min(1).max(40),
  description: z.string().trim().max(500).default(""),
});
export type InvoiceInput = z.infer<typeof InvoiceInput>;
