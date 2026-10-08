import { isValidIban, KNOWN_CURRENCIES } from "./deterministic";
import { isTaxDocument, type Check, type FinancialDocument } from "./schema";

// Verification layer. Runs on the merged output regardless of which layer
// produced each value, so model output is held to the same arithmetic as rules.

const CENT = 0.011;
const round = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => n.toFixed(2);

function isIso(d: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const date = new Date(`${d}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(d);
}

export function runChecks(doc: FinancialDocument): Check[] {
  const checks: Check[] = [];
  const add = (id: string, label: string, status: Check["status"], detail: string) =>
    checks.push({ id, label, status, detail });

  // Dates
  const dateFields = ["issue_date", "due_date", "period_start", "period_end"] as const;
  const dates = [
    ...dateFields.map((f) => doc[f]),
    ...doc.line_items.map((i) => i.date),
    ...(doc.tax_statement?.entries.map((e) => e.date) ?? []),
  ].filter((d): d is string => d !== null);
  const badDates = dates.filter((d) => !isIso(d));
  if (!dates.length) add("dates_iso", "Dates are valid ISO 8601", "skip", "No dates found.");
  else if (badDates.length) add("dates_iso", "Dates are valid ISO 8601", "fail", `Invalid: ${badDates.join(", ")}`);
  else add("dates_iso", "Dates are valid ISO 8601", "pass", `${dates.length} dates checked.`);

  if (doc.issue_date && doc.due_date && isIso(doc.issue_date) && isIso(doc.due_date)) {
    const ok = doc.due_date >= doc.issue_date;
    add("due_after_issue", "Due date is on or after issue date", ok ? "pass" : "fail", `${doc.issue_date} → ${doc.due_date}`);
  }

  // Currency
  if (doc.currency === null) add("currency", "Currency is ISO 4217", "skip", "No currency found.");
  else {
    const ok = KNOWN_CURRENCIES.has(doc.currency);
    add("currency", "Currency is ISO 4217", ok ? "pass" : "fail", doc.currency);
  }

  if (isTaxDocument(doc.document_type)) {
    checks.push(...taxChecks(doc));
    return checks;
  }

  // IBAN
  if (doc.iban === null) add("iban", "IBAN checksum (mod 97)", "skip", "No IBAN found.");
  else {
    const ok = isValidIban(doc.iban);
    add("iban", "IBAN checksum (mod 97)", ok ? "pass" : "fail", ok ? doc.iban : `${doc.iban} fails mod 97`);
  }

  // Arithmetic
  const amounts = doc.line_items.map((i) => i.amount);
  const allAmounts = amounts.length > 0 && amounts.every((a): a is number => a !== null);
  const lineSum = allAmounts ? round((amounts as number[]).reduce((a, b) => a + b, 0)) : null;

  if (doc.document_type === "bank_statement") {
    if (doc.opening_balance !== null && doc.closing_balance !== null && lineSum !== null) {
      const expected = round(doc.opening_balance + lineSum);
      const ok = Math.abs(expected - doc.closing_balance) < CENT;
      add(
        "balance_roll",
        "Opening balance + movements = closing balance",
        ok ? "pass" : "fail",
        `${fmt(doc.opening_balance)} ${lineSum < 0 ? "−" : "+"} ${fmt(Math.abs(lineSum))} = ${fmt(expected)}, stated ${fmt(doc.closing_balance)}`,
      );
    } else add("balance_roll", "Opening balance + movements = closing balance", "skip", "Balances or movements missing.");
  } else {
    const net = doc.subtotal ?? (doc.total !== null ? round(doc.total - (doc.tax ?? 0)) : null);
    if (lineSum !== null && net !== null) {
      const ok = Math.abs(lineSum - net) < CENT;
      add("lines_sum", "Line items add up to net amount", ok ? "pass" : "fail", `Σ lines ${fmt(lineSum)}, net ${fmt(net)}`);
    } else add("lines_sum", "Line items add up to net amount", "skip", "Line items or subtotal missing.");

    if (doc.subtotal !== null && doc.tax !== null && doc.total !== null) {
      const expected = round(doc.subtotal + doc.tax);
      const ok = Math.abs(expected - doc.total) < CENT;
      add("total", "Subtotal + tax = total", ok ? "pass" : "fail", `${fmt(doc.subtotal)} + ${fmt(doc.tax)} = ${fmt(expected)}, stated ${fmt(doc.total)}`);
    } else add("total", "Subtotal + tax = total", "skip", "Subtotal, tax or total missing.");
  }

  for (const [i, item] of doc.line_items.entries()) {
    if (item.quantity === null || item.unit_price === null || item.amount === null) continue;
    const expected = round(item.quantity * item.unit_price);
    if (Math.abs(expected - item.amount) >= CENT) {
      add(`line_${i}`, `Line ${i + 1}: quantity × unit price = amount`, "fail", `${item.quantity} × ${fmt(item.unit_price)} = ${fmt(expected)}, stated ${fmt(item.amount)}`);
    }
  }

  return checks;
}

const PAN_HOLDER: Record<string, string> = {
  P: "individual", C: "company", H: "HUF", F: "firm", A: "AOP", T: "trust",
  B: "BOI", L: "local authority", J: "artificial juridical person", G: "government",
};

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function taxChecks(doc: FinancialDocument): Check[] {
  const checks: Check[] = [];
  const add = (id: string, label: string, status: Check["status"], detail: string) =>
    checks.push({ id, label, status, detail });
  const ts = doc.tax_statement;
  if (!ts) {
    add("tax_statement", "Tax statement present", "fail", "Document looks like a tax statement but no details were extracted.");
    return checks;
  }

  // PAN: AAAPA9999A, where the 4th letter encodes the holder type.
  if (ts.pan === null) add("pan", "PAN format", "skip", "No PAN found.");
  else {
    const ok = /^[A-Z]{3}[PCHFATBLJG][A-Z]\d{4}[A-Z]$/.test(ts.pan);
    add("pan", "PAN format", ok ? "pass" : "fail", ok ? `Holder type: ${PAN_HOLDER[ts.pan[3]]}` : `${ts.pan} is not a valid PAN`);
  }

  const tans = ts.entries.map((e) => e.source_tan).filter((t): t is string => t !== null);
  if (tans.length) {
    const bad = tans.filter((t) => !/^[A-Z]{4}\d{5}[A-Z]$/.test(t));
    add("tan", "Deductor TAN format", bad.length ? "fail" : "pass", bad.length ? `Invalid: ${bad.join(", ")}` : `${tans.length} TANs checked.`);
  }

  if (ts.financial_year && ts.assessment_year) {
    const fy = Number(ts.financial_year.slice(0, 4));
    const ay = Number(ts.assessment_year.slice(0, 4));
    add("ay_fy", "Assessment year follows financial year", ay === fy + 1 ? "pass" : "fail", `FY ${ts.financial_year}, AY ${ts.assessment_year}`);
  } else add("ay_fy", "Assessment year follows financial year", "skip", "Financial or assessment year missing.");

  const deducted = ts.entries.map((e) => e.tax_deducted).filter((n): n is number => n !== null);
  if (deducted.length && ts.total_tax_deducted !== null) {
    const sum = round(deducted.reduce((a, b) => a + b, 0));
    const ok = Math.abs(sum - ts.total_tax_deducted) < CENT;
    add("tds_total", "Entries add up to total TDS", ok ? "pass" : "fail", `Σ entries ${inr(sum)}, stated ${inr(ts.total_tax_deducted)}`);
  } else add("tds_total", "Entries add up to total TDS", "skip", "Per-entry TDS or total missing.");

  const compared = ts.entries.filter((e) => e.tax_deducted !== null && e.tax_deposited !== null);
  if (compared.length) {
    const short = compared.filter((e) => e.tax_deposited! + CENT < e.tax_deducted!);
    add(
      "tds_deposited",
      "TDS deducted has been deposited",
      short.length ? "fail" : "pass",
      short.length
        ? short.map((e) => `${e.source_name ?? e.source_tan}: ${inr(round(e.tax_deducted! - e.tax_deposited!))} short`).join("; ")
        : `${compared.length} deductors fully deposited.`,
    );
  }
  return checks;
}
