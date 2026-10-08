"use client";

import { useRef, useState } from "react";
import { runLocal } from "@/lib/local";
import { SAMPLES } from "@/lib/samples";
import type { ExtractionResult, Source } from "@/lib/schema";
import { JsonView } from "./JsonView";

type View = "data" | "masked" | "response";

// Static builds (GitHub Pages) have no server: extraction runs in the browser.
const STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "1";

const KIND_LABEL: Record<string, string> = {
  NAME: "name", EMAIL: "email", PHONE: "phone number", IBAN: "IBAN",
  PAN: "PAN", AADHAAR: "Aadhaar number", ACCOUNT: "account number",
};

function maskSummary(kinds: Record<string, number>): string {
  return Object.entries(kinds)
    .map(([k, n]) => `${n} ${KIND_LABEL[k] ?? k}${n > 1 ? "s" : ""}`)
    .join(", ");
}

/** Renders masked text with each placeholder highlighted. */
function MaskedText({ text }: { text: string }) {
  const parts = text.split(/(\[(?:NAME|EMAIL|PHONE|IBAN|PAN|AADHAAR|ACCOUNT)_\d+\])/g);
  return (
    <pre className="json json-plain masked-text">
      {parts.map((p, i) => (i % 2 ? <mark key={i} className="pii-token">{p}</mark> : p))}
    </pre>
  );
}

export function Extractor() {
  const [sampleId, setSampleId] = useState<string>(SAMPLES[0].id);
  const [text, setText] = useState(SAMPLES[0].text);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("data");
  const [focus, setFocus] = useState<Source | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  function pickSample(id: string) {
    const sample = SAMPLES.find((s) => s.id === id)!;
    setSampleId(id);
    setText(sample.text);
    setFile(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    setSampleId("upload");
    setFile(f);
    const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    setText(isPdf ? "" : (await f.text()).slice(0, 100_000));
  }

  async function extract() {
    setLoading(true);
    setError(null);
    const isPdf = file && (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
    if (STATIC) {
      if (isPdf) setError("PDFs need the model step, which isn't available on this page. Paste the text instead.");
      else setResult(runLocal(text));
      setLoading(false);
      return;
    }
    const body = new FormData();
    if (isPdf) body.append("file", file);
    else body.append("text", text);
    try {
      const res = await fetch("/api/extract", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Extraction failed.");
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed.");
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!result) return;
    const content =
      view === "masked" ? (result.model_input ?? "") : JSON.stringify(view === "data" ? result.data : result, null, 2);
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  const counts = result
    ? Object.values(result.provenance).reduce(
        (acc, s) => ({ ...acc, [s]: acc[s] + 1 }),
        { rule: 0, model: 0 } as Record<Source, number>,
      )
    : null;
  const isPdf = file !== null && text === "";
  const canExtract = !loading && (isPdf || text.trim().length > 0);

  return (
    <div className="extractor">
      <section className="pane pane-source" aria-labelledby="source-title">
        <header className="pane-head">
          <h2 id="source-title" className="pane-title">Source</h2>
          <div className="tabs" role="tablist" aria-label="Example documents">
            {SAMPLES.map((s) => (
              <button
                key={s.id}
                role="tab"
                aria-selected={sampleId === s.id}
                className="tab"
                onClick={() => pickSample(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </header>

        {isPdf ? (
          <div className="pdf-card">
            <p className="pdf-name">{file.name}</p>
            <p className="muted">
              {(file.size / 1024).toFixed(0)} KB PDF. The model reads PDFs directly, so identifiers in a PDF are not
              masked. Paste the text instead to mask them. Every value still goes through the rule checks.
            </p>
          </div>
        ) : (
          <textarea
            className="source"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (sampleId !== "upload") setSampleId("custom");
            }}
            spellCheck={false}
            aria-label="Document text"
            placeholder="Paste an invoice, bank statement CSV, payment email, Form 26AS or AIS."
          />
        )}

        <footer className="pane-foot">
          <button className="btn-primary" onClick={extract} disabled={!canExtract}>
            {loading ? "Extracting…" : "Extract JSON"}
          </button>
          <label className="btn-quiet btn-upload">
            <input
              ref={fileInput}
              type="file"
              accept={STATIC ? ".csv,.txt,.tsv,.eml,text/*" : ".pdf,.csv,.txt,.tsv,.eml,application/pdf,text/*"}
              className="sr-only"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
            Upload a file
          </label>
          <span className="muted small">
            {STATIC ? "CSV or plain text. Runs in your browser." : "PDF, CSV or plain text, up to 8 MB."}
          </span>
        </footer>
      </section>

      <section className="pane pane-output" aria-labelledby="output-title" aria-busy={loading}>
        <header className="pane-head">
          <h2 id="output-title" className="pane-title">Output</h2>
          {result && (
            <div className="out-tools">
              <div className="seg" role="group" aria-label="Output view">
                <button aria-pressed={view === "data"} onClick={() => setView("data")}>Data</button>
                {result.model_input !== null && (
                  <button aria-pressed={view === "masked"} onClick={() => setView("masked")}>
                    {STATIC ? "Masked text" : "Sent to model"}
                  </button>
                )}
                <button aria-pressed={view === "response"} onClick={() => setView("response")}>Full response</button>
              </div>
              <button className="btn-quiet" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
            </div>
          )}
        </header>

        {!result && !error && (
          <div className="empty">
            <p>Pick an example or upload a document, then extract.</p>
            <p className="muted">
              Each value in the output is marked with how it was read: by a rule, or by the model.
            </p>
          </div>
        )}
        {error && <p className="alert" role="alert">{error}</p>}

        {result && (
          <>
            {view === "data" && counts && (
              <div className="legend" role="group" aria-label="Highlight values by source">
                <button
                  className="key key-rule"
                  aria-pressed={focus === "rule"}
                  onClick={() => setFocus(focus === "rule" ? null : "rule")}
                >
                  Read by rule <strong>{counts.rule}</strong>
                </button>
                <button
                  className="key key-model"
                  aria-pressed={focus === "model"}
                  onClick={() => setFocus(focus === "model" ? null : "model")}
                >
                  Read by model <strong>{counts.model}</strong>
                </button>
              </div>
            )}
            {view === "masked" && (
              <p className="mask-banner">
                {!result.meta.pii_masked?.count
                  ? "No personal identifiers found in this document."
                  : result.meta.model
                    ? `Masked before the model step: ${maskSummary(result.meta.pii_masked.kinds)}. Real values are restored only in your response.`
                    : `Nothing was sent to a model. When the model step runs, it receives this text, with ${maskSummary(result.meta.pii_masked.kinds)} masked.`}
              </p>
            )}
            <div className="json-wrap" key={result.meta.duration_ms + view}>
              {view === "data" ? (
                <JsonView value={result.data} provenance={result.provenance} focus={focus} />
              ) : view === "masked" ? (
                <MaskedText text={result.model_input ?? ""} />
              ) : (
                <pre className="json json-plain">{JSON.stringify(result, null, 2)}</pre>
              )}
            </div>

            <div className="checks">
              <h3 className="checks-title">Checks before return</h3>
              <ul>
                {result.checks.map((c) => (
                  <li key={c.id} className="check" data-status={c.status}>
                    <span className="check-status">{c.status === "pass" ? "Passed" : c.status === "fail" ? "Failed" : "Skipped"}</span>
                    <span className="check-label">{c.label}</span>
                    <span className="check-detail">{c.detail}</span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="run-meta muted small">
              {result.meta.model ? `Rules, then ${result.meta.model}.` : "Rules only."} {(result.meta.duration_ms / 1000).toFixed(2)} s.
              {result.meta.pii_masked && result.meta.pii_masked.count > 0 && (
                <> {result.meta.pii_masked.count} identifiers masked.</>
              )}
              {result.meta.model_note && <span className="note"> {result.meta.model_note}</span>}
            </p>
          </>
        )}
      </section>
    </div>
  );
}
