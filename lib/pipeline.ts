import { extractWithModel, modelConfigured, MODEL, type DocumentInput } from "./ai";
import { extractWithRules } from "./deterministic";
import { createMasker } from "./pii";
import { emptyDocument, type Check, type ExtractionResult, type FinancialDocument, type Provenance } from "./schema";
import { runChecks } from "./validate";

const PARTY_FIELDS = ["name", "tax_id", "address"] as const;
const TAX_FIELDS = ["pan", "taxpayer_name", "financial_year", "assessment_year", "total_tax_deducted"] as const;
type ScalarKey = Exclude<keyof FinancialDocument, "issuer" | "counterparty" | "line_items" | "tax_statement">;

/** Rule values always win; the model only fills fields the rules left empty. */
function merge(rule: FinancialDocument, ruleProv: Provenance, model: FinancialDocument) {
  const data = structuredClone(rule);
  const provenance: Provenance = { ...ruleProv };
  const disagreements: string[] = [];

  for (const key of Object.keys(data) as (keyof FinancialDocument)[]) {
    if (key === "issuer" || key === "counterparty") {
      for (const f of PARTY_FIELDS) {
        const path = `${key}.${f}`;
        if (provenance[path]) {
          if (model[key][f] !== null && model[key][f] !== rule[key][f]) disagreements.push(path);
        } else if (model[key][f] !== null) {
          data[key][f] = model[key][f];
          provenance[path] = "model";
        }
      }
    } else if (key === "tax_statement") {
      if (!model.tax_statement) continue;
      if (!data.tax_statement) {
        data.tax_statement = model.tax_statement;
        provenance.tax_statement = "model";
        continue;
      }
      for (const f of TAX_FIELDS) {
        const path = `tax_statement.${f}`;
        const ruleValue = data.tax_statement[f];
        const modelValue = model.tax_statement[f];
        if (provenance[path]) {
          if (modelValue !== null && modelValue !== ruleValue) disagreements.push(path);
        } else if (modelValue !== null) {
          (data.tax_statement as Record<string, unknown>)[f] = modelValue;
          provenance[path] = "model";
        }
      }
      if (!provenance["tax_statement.entries"] && model.tax_statement.entries.length) {
        data.tax_statement.entries = model.tax_statement.entries;
        provenance["tax_statement.entries"] = "model";
      }
    } else if (key === "line_items") {
      if (!provenance.line_items && model.line_items.length) {
        data.line_items = model.line_items;
        provenance.line_items = "model";
      }
    } else {
      const k = key as ScalarKey;
      if (provenance[k]) {
        if (model[k] !== null && model[k] !== rule[k]) disagreements.push(k);
      } else if (model[k] !== null && !(k === "document_type" && model[k] === "unknown")) {
        (data as Record<ScalarKey, unknown>)[k] = model[k];
        provenance[k] = "model";
      }
    }
  }
  return { data, provenance, disagreements };
}

export async function runPipeline(input: DocumentInput): Promise<ExtractionResult> {
  const started = Date.now();

  const rules =
    input.kind === "text"
      ? extractWithRules(input.text)
      : { data: emptyDocument(), provenance: {} as Provenance, kind: "pdf" as const };

  // Identifiers are masked before anything leaves for the model. PDFs can't be
  // masked here because the model reads the file itself.
  const taxpayer = rules.data.tax_statement?.taxpayer_name;
  const masker = input.kind === "text" ? createMasker(input.text, taxpayer ? [["NAME", taxpayer]] : []) : null;

  let data = rules.data;
  let provenance = rules.provenance;
  let modelUsed: string | null = null;
  let modelNote: string | null = null;
  const extraChecks: Check[] = [];

  if (!modelConfigured()) {
    modelNote = input.kind === "pdf"
      ? "PDFs need the model step, which is not configured on this server. Paste the text instead."
      : "Model step not configured on this server. Showing rule output only; nothing was sent to a model.";
  } else {
    try {
      const model = masker
        ? masker.unmaskValue(await extractWithModel({ kind: "text", text: masker.masked }, masker.maskValue(rules.data)))
        : await extractWithModel(input, rules.data);
      const merged = merge(rules.data, rules.provenance, model);
      data = merged.data;
      provenance = merged.provenance;
      modelUsed = MODEL;
      if (input.kind === "pdf") modelNote = "PDFs are read by the model as-is, without masking. Paste the text to mask identifiers first.";
      if (Object.keys(rules.provenance).length) {
        extraChecks.push({
          id: "agreement",
          label: "Model agrees with rule values",
          status: merged.disagreements.length ? "fail" : "pass",
          detail: merged.disagreements.length
            ? `Rule value kept for: ${merged.disagreements.join(", ")}`
            : `${Object.keys(rules.provenance).length} rule fields confirmed.`,
        });
      }
    } catch (err) {
      modelNote = `Model step failed: ${err instanceof Error ? err.message : "unknown error"}. Showing rule output only.`;
    }
  }

  return {
    data,
    model_input: masker?.masked ?? null,
    provenance,
    checks: [...runChecks(data), ...extraChecks],
    meta: {
      input_kind: rules.kind,
      model: modelUsed,
      model_note: modelNote,
      pii_masked: masker?.summary ?? null,
      duration_ms: Date.now() - started,
    },
  };
}
