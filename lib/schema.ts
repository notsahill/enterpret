import { z } from "zod";

// One schema covers invoices, bank statements, receipts and remittances.
// Every field is nullable so the rule layer can leave gaps for the model.

const Party = z.object({
  name: z.string().nullable(),
  tax_id: z.string().nullable(),
  address: z.string().nullable(),
});

const LineItem = z.object({
  date: z.string().nullable().describe("ISO 8601 date (YYYY-MM-DD)"),
  description: z.string().nullable(),
  quantity: z.number().nullable(),
  unit_price: z.number().nullable(),
  amount: z.number().nullable().describe("Signed: negative for debits/outflows"),
});

const TaxEntry = z.object({
  category: z.enum(["tds", "tcs", "sft", "tax_payment", "salary", "other"]),
  code: z.string().nullable().describe("Section or information code, e.g. 194A or SFT-015"),
  description: z.string().nullable(),
  source_name: z.string().nullable().describe("Deductor, collector or reporting entity"),
  source_tan: z.string().nullable(),
  date: z.string().nullable().describe("ISO 8601 date (YYYY-MM-DD)"),
  amount: z.number().nullable().describe("Amount paid/credited or value reported"),
  tax_deducted: z.number().nullable(),
  tax_deposited: z.number().nullable(),
});

const TaxStatement = z.object({
  pan: z.string().nullable(),
  taxpayer_name: z.string().nullable(),
  financial_year: z.string().nullable().describe("e.g. 2024-25"),
  assessment_year: z.string().nullable().describe("e.g. 2025-26"),
  entries: z.array(TaxEntry),
  total_tax_deducted: z.number().nullable(),
});

export const TAX_DOCUMENT_TYPES = ["form_26as", "ais", "tis", "form_16"] as const;

export const FinancialDocumentSchema = z.object({
  document_type: z.enum(["invoice", "bank_statement", "receipt", "remittance", ...TAX_DOCUMENT_TYPES, "unknown"]),
  document_number: z.string().nullable(),
  currency: z.string().nullable().describe("ISO 4217 code, e.g. EUR"),
  issue_date: z.string().nullable().describe("ISO 8601 date (YYYY-MM-DD)"),
  due_date: z.string().nullable().describe("ISO 8601 date (YYYY-MM-DD)"),
  period_start: z.string().nullable().describe("ISO 8601 date (YYYY-MM-DD)"),
  period_end: z.string().nullable().describe("ISO 8601 date (YYYY-MM-DD)"),
  issuer: Party,
  counterparty: Party,
  iban: z.string().nullable().describe("IBAN without spaces"),
  payment_reference: z.string().nullable(),
  line_items: z.array(LineItem),
  subtotal: z.number().nullable(),
  tax: z.number().nullable(),
  total: z.number().nullable(),
  opening_balance: z.number().nullable(),
  closing_balance: z.number().nullable(),
  tax_statement: TaxStatement.nullable().describe("Only for Indian tax statements: Form 26AS, AIS, TIS, Form 16"),
});

export type FinancialDocument = z.infer<typeof FinancialDocumentSchema>;
export type LineItem = z.infer<typeof LineItem>;
export type TaxStatement = z.infer<typeof TaxStatement>;
export type TaxEntry = z.infer<typeof TaxEntry>;

export function isTaxDocument(type: FinancialDocument["document_type"]): boolean {
  return (TAX_DOCUMENT_TYPES as readonly string[]).includes(type);
}

export type Source = "rule" | "model";
/** Maps a JSON path like "issuer.name" or "line_items" to who produced it. */
export type Provenance = Record<string, Source>;

export type CheckStatus = "pass" | "fail" | "skip";
export interface Check {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface MaskSummary {
  count: number;
  kinds: Record<string, number>;
}

export interface ExtractionResult {
  data: FinancialDocument;
  /** Exactly what was (or would be) sent to the model, with identifiers masked. */
  model_input: string | null;
  provenance: Provenance;
  checks: Check[];
  meta: {
    input_kind: "text" | "csv" | "pdf";
    model: string | null;
    model_note: string | null;
    pii_masked: MaskSummary | null;
    duration_ms: number;
  };
}

export function emptyDocument(): FinancialDocument {
  const party = { name: null, tax_id: null, address: null };
  return {
    document_type: "unknown",
    document_number: null,
    currency: null,
    issue_date: null,
    due_date: null,
    period_start: null,
    period_end: null,
    issuer: { ...party },
    counterparty: { ...party },
    iban: null,
    payment_reference: null,
    line_items: [],
    subtotal: null,
    tax: null,
    total: null,
    opening_balance: null,
    closing_balance: null,
    tax_statement: null,
  };
}
