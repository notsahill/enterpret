import { extractWithRules } from "./deterministic";
import { createMasker } from "./pii";
import type { ExtractionResult } from "./schema";
import { runChecks } from "./validate";

// Browser-side pipeline for the static (GitHub Pages) build: rules, masking
// preview and checks, with no model step. Nothing leaves the visitor's machine.

export function runLocal(text: string): ExtractionResult {
  const started = performance.now();
  const rules = extractWithRules(text);
  const taxpayer = rules.data.tax_statement?.taxpayer_name;
  const masker = createMasker(text, taxpayer ? [["NAME", taxpayer]] : []);
  return {
    data: rules.data,
    model_input: masker.masked,
    provenance: rules.provenance,
    checks: runChecks(rules.data),
    meta: {
      input_kind: rules.kind,
      model: null,
      model_note: "Ran in your browser. Nothing left this page.",
      pii_masked: masker.summary,
      duration_ms: Math.round(performance.now() - started),
    },
  };
}
