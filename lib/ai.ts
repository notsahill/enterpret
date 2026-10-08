import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { FinancialDocumentSchema, type FinancialDocument } from "./schema";

// Model layer. Only called for what the rule layer could not read: party
// names, free-form line items, ambiguous dates. Output is constrained to the
// same schema, then merged and re-verified by validate.ts.

export const MODEL = "claude-opus-5-5";

const SYSTEM = `You extract structured data from financial documents: invoices, bank statements, receipts, remittance advices, and Indian income tax statements (Form 26AS, AIS, TIS, Form 16).

You receive the document and a partial extraction produced by deterministic parsers. Those values were read by exact rules; keep them as given. Your job is to fill the fields that are null.

Rules:
- Only use information present in the document. If a value is not there, return null. Never estimate or compute a value that the document does not state, except signing bank movements (debits negative, credits positive).
- Dates as YYYY-MM-DD. For ambiguous numeric dates, use the document's locale, currency and surrounding dates to decide.
- Amounts as plain numbers without currency symbols or thousands separators.
- currency as an ISO 4217 code.
- issuer is the party that issued the document (seller, bank, payer of a remittance); counterparty is the other party.
- line_items: one entry per product, service or transaction row, in document order.
- For Indian tax statements, fill tax_statement (PAN, financial and assessment year, one entry per TDS/TCS/SFT/tax payment row) and leave line_items empty. For all other documents, tax_statement is null.
- Personal identifiers have been replaced with placeholders such as [PAN_1], [ACCOUNT_2] or [EMAIL_1]. Copy a placeholder verbatim wherever a field needs that value.`;

export type DocumentInput = { kind: "text"; text: string } | { kind: "pdf"; base64: string };

let client: Anthropic | null = null;
function getClient() {
  client ??= new Anthropic();
  return client;
}

export function modelConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export async function extractWithModel(input: DocumentInput, partial: FinancialDocument): Promise<FinancialDocument> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (input.kind === "pdf") {
    content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: input.base64 } });
  } else {
    content.push({ type: "text", text: `<document>\n${input.text}\n</document>` });
  }
  content.push({
    type: "text",
    text: `<rule_extraction>\n${JSON.stringify(partial, null, 2)}\n</rule_extraction>\n\nReturn the complete extraction with the null fields filled where the document supports it.`,
  });

  const response = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: "medium", format: betaZodOutputFormat(FinancialDocumentSchema) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{ role: "user", content }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The model declined to process this document.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("The document produced more output than the model step allows.");
  }
  if (!response.parsed_output) {
    throw new Error("The model returned output that does not match the schema.");
  }
  return response.parsed_output;
}
