import {
  emptyDocument,
  isTaxDocument,
  type FinancialDocument,
  type LineItem,
  type Provenance,
  type TaxEntry,
} from "./schema";

// Rule layer. Everything here is pure and repeatable: the same input always
// yields the same output. When a rule can't be sure (an ambiguous date, an
// unlabeled amount) it leaves the field null instead of guessing.

export interface RuleResult {
  data: FinancialDocument;
  provenance: Provenance;
  kind: "text" | "csv";
}

const ISO_CURRENCIES = [
  "EUR", "USD", "GBP", "CHF", "JPY", "CAD", "AUD", "SEK", "NOK", "DKK",
  "PLN", "CZK", "HUF", "RON", "HRK", "BGN", "INR", "CNY", "SGD", "HKD", "NZD",
];
export const KNOWN_CURRENCIES = new Set(ISO_CURRENCIES);

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// ---------- primitives ----------

/** Parses "1,234.56", "1.234,56", "(12.50)", "-€ 9,00" into a number. */
export function parseAmount(raw: string): number | null {
  let s = raw.trim();
  const negative = /^\(.*\)$/.test(s) || s.includes("-");
  s = s.replace(/[^\d.,]/g, "");
  if (!/\d/.test(s)) return null;

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot !== -1 && lastComma !== -1) {
    const decimal = lastDot > lastComma ? "." : ",";
    const thousands = decimal === "." ? "," : ".";
    s = s.split(thousands).join("").replace(decimal, ".");
  } else if (lastComma !== -1) {
    // "1234,56" -> decimal comma; "1,234" or "1,234,567" -> thousands
    s = /,\d{1,2}$/.test(s) ? s.replace(/,/g, ".") : s.replace(/,/g, "");
  } else if ((s.match(/\./g) ?? []).length > 1) {
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

function isoDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1) return null;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > days) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Normalizes a date string to ISO 8601. Returns null for unreadable or
 * ambiguous dates such as 03/04/2026, which the model resolves from context.
 */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return isoDate(+m[1], +m[2], +m[3]);

  // Dotted dates are day-first across Europe.
  m = s.match(/(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})/);
  if (m) return isoDate(+m[3], +m[2], +m[1]);

  m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const a = +m[1], b = +m[2], y = +m[3];
    if (a > 12) return isoDate(y, b, a);
    if (b > 12) return isoDate(y, a, b);
    if (a === b) return isoDate(y, a, b);
    return null;
  }

  m = s.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})/);
  if (m && MONTHS[m[2].toLowerCase()]) return isoDate(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);

  m = s.match(/([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/);
  if (m && MONTHS[m[1].toLowerCase()]) return isoDate(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);

  return null;
}

const DATE_TOKEN =
  /\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\.\s?\d{1,2}\.\s?\d{4}|\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9}\.?,?\s+\d{4}|[A-Za-z]{3,9}\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}/g;

export function isValidIban(iban: string): boolean {
  const s = iban.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const rearranged = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (const digit of rearranged) rem = (rem * 10 + Number(digit)) % 97;
  return rem === 1;
}

// ---------- text rules ----------

const AMOUNT_TOKEN = /\(?-?\s?\d[\d.,]*\d\)?|\d/g;

/** Finds the first line matching `label` and returns the last amount on it. */
function labeledAmount(lines: string[], label: RegExp, exclude?: RegExp): number | null {
  for (const line of lines) {
    if (exclude?.test(line)) continue;
    const hit = line.match(label);
    if (!hit || hit.index === undefined) continue;
    const rest = line
      .slice(hit.index + hit[0].length)
      .replace(/\d+(?:[.,]\d+)?\s*%/g, "")
      .replace(DATE_TOKEN, "");
    const tokens = rest.match(AMOUNT_TOKEN);
    if (!tokens) continue;
    return parseAmount(tokens[tokens.length - 1]);
  }
  return null;
}

function labeledDate(lines: string[], label: RegExp): string | null {
  for (const line of lines) {
    const hit = line.match(label);
    if (!hit || hit.index === undefined) continue;
    const token = line.slice(hit.index + hit[0].length).match(DATE_TOKEN);
    if (token) return parseDate(token[0]);
  }
  return null;
}

function detectCurrency(text: string): string | null {
  const counts = new Map<string, number>();
  for (const m of text.matchAll(new RegExp(`\\b(${ISO_CURRENCIES.join("|")})\\b`, "g"))) {
    counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  }
  if (counts.size) return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  if (text.includes("₹") || /\bRs\.?\s?\d/.test(text)) return "INR";
  if (text.includes("€")) return "EUR";
  if (text.includes("£")) return "GBP";
  if (text.includes("$")) return "USD";
  return null;
}

function detectType(text: string): FinancialDocument["document_type"] {
  if (/\bform\s*26\s?AS\b|\bannual tax statement\b/i.test(text)) return "form_26as";
  if (/\bannual information statement\b|\(AIS\)/i.test(text)) return "ais";
  if (/\btaxpayer information summary\b|\(TIS\)/i.test(text)) return "tis";
  if (/\bform\s*(?:no\.?\s*)?16\b/i.test(text)) return "form_16";
  if (/\b(remittance|payment advice)\b/i.test(text)) return "remittance";
  if (/\b(account statement|bank statement|statement period|opening balance)\b/i.test(text)) return "bank_statement";
  if (/\b(invoice|ra[čc]un)\b/i.test(text)) return "invoice";
  if (/\breceipt\b/i.test(text)) return "receipt";
  return "unknown";
}

function extractText(text: string, data: FinancialDocument, prov: Provenance) {
  const lines = text.split(/\r?\n/);
  const set = <K extends keyof FinancialDocument>(key: K, value: FinancialDocument[K] | null) => {
    if (value === null || value === undefined) return;
    data[key] = value as FinancialDocument[K];
    prov[key as string] = "rule";
  };

  const type = detectType(text);
  if (type !== "unknown") set("document_type", type);
  if (isTaxDocument(type)) {
    // Indian tax statements are always in rupees.
    set("currency", "INR");
    extractTaxStatement(lines, text, data, prov);
    return;
  }
  set("currency", detectCurrency(text));

  const num = text.match(
    /\b(?:invoice|receipt|statement|credit note|remittance)\s*(?:no\.?|number|nr\.?|#)\s*[:#]?\s*([A-Z0-9][A-Z0-9\-\/]{2,})/i,
  );
  if (num) set("document_number", num[1]);

  set("issue_date", labeledDate(lines, /\b(?:invoice date|issue date|date of issue|date issued|payment date|value date)\b\s*[:]?/i));
  set("due_date", labeledDate(lines, /\b(?:due date|payment due|due by|pay by)\b\s*[:]?/i));

  for (const line of lines) {
    if (!/\b(?:statement period|period)\b/i.test(line)) continue;
    const dates = line.match(DATE_TOKEN);
    if (dates && dates.length >= 2) {
      set("period_start", parseDate(dates[0]));
      set("period_end", parseDate(dates[1]));
    }
    break;
  }

  // IBANs are only accepted when the mod-97 checksum passes.
  for (const m of text.matchAll(/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,3})?\b/g)) {
    const iban = m[0].replace(/\s+/g, "");
    if (isValidIban(iban)) {
      set("iban", iban);
      break;
    }
  }

  const ref = text.match(/\b(?:payment reference|reference|ref\.?)\s*[:#]\s*([A-Z0-9][A-Z0-9\-\/ ]{2,34}[A-Z0-9])/i);
  if (ref) set("payment_reference", ref[1].trim());

  // Tax IDs above the "Bill to" block belong to the issuer, below it to the customer.
  const billTo = text.search(/\b(?:bill to|billed to|invoice to|customer|buyer|kupec)\b/i);
  for (const m of text.matchAll(/\b(?:VAT\s*(?:ID|No\.?|number|reg\.?\s*no\.?)|Tax\s*ID|ID\s*za\s*DDV)\s*[:#]?\s*([A-Z]{2}\s?[0-9A-Z]{8,12})\b/gi)) {
    const id = m[1].replace(/\s+/g, "");
    const party = billTo !== -1 && (m.index ?? 0) > billTo ? "counterparty" : "issuer";
    if (data[party].tax_id === null) {
      data[party].tax_id = id;
      prov[`${party}.tax_id`] = "rule";
    }
  }

  const taxIdLine = /\b(?:vat|tax)\s*(?:id|no|number|reg)/i;
  set("subtotal", labeledAmount(lines, /\b(?:subtotal|sub-total|net amount|net total)\b/i));
  set("tax", labeledAmount(lines, /\b(?:vat|tax|ddv|gst|sales tax)\b/i, taxIdLine));
  set("total", labeledAmount(lines, /\b(?:total due|amount due|grand total|balance due|total|amount paid|payment amount)\b/i, taxIdLine));
  set("opening_balance", labeledAmount(lines, /\b(?:opening balance|balance brought forward|previous balance)\b/i));
  set("closing_balance", labeledAmount(lines, /\b(?:closing balance|new balance|ending balance)\b/i));
}

// ---------- Indian tax statement rules (Form 26AS, AIS, TIS, Form 16) ----------

export const PAN_RE = /\b[A-Z]{5}\d{4}[A-Z]\b/;
export const TAN_RE = /\b[A-Z]{4}\d{5}[A-Z]\b/;

// 26AS Part I row: Sr, deductor, TAN, [section], paid/credited, deducted, deposited
const ROW_26AS =
  /^\s*\d+\s+(.+?)\s{2,}([A-Z]{4}\d{5}[A-Z])\s+(?:(\d{3}[A-Z]{0,2})\s+)?([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$/;
// AIS row: Sr, information code, description, source [(TAN)], count, amount
const ROW_AIS =
  /^\s*\d+\s+((?:TDS|TCS|SFT)-[\w()]+)\s+(.+?)\s{2,}(.+?)(?:\s*\(([A-Z]{4}\d{5}[A-Z])\))?\s{2,}(\d+)\s{2,}([\d,]+(?:\.\d{2})?)\s*$/;

function extractTaxStatement(lines: string[], text: string, data: FinancialDocument, prov: Provenance) {
  const ts: NonNullable<FinancialDocument["tax_statement"]> = {
    pan: null,
    taxpayer_name: null,
    financial_year: null,
    assessment_year: null,
    entries: [],
    total_tax_deducted: null,
  };
  data.tax_statement = ts;
  const set = <K extends keyof typeof ts>(key: K, value: (typeof ts)[K] | null) => {
    if (value === null) return;
    ts[key] = value as (typeof ts)[K];
    prov[`tax_statement.${key}`] = "rule";
  };

  const pan = text.match(/\b(?:PAN|Permanent Account Number)(?:\s*\(PAN\))?\s*(?:of the (?:employee|assessee))?\s*[:\-]?\s*([A-Z]{5}\d{4}[A-Z])\b/i);
  set("pan", pan ? pan[1] : (text.match(PAN_RE)?.[0] ?? null));

  const name = text.match(/\bName(?: of (?:the )?(?:Assessee|Taxpayer|Employee))?\s*[:\-]\s*([A-Za-z][A-Za-z .&']{2,60}?)(?=\s{2,}|\s*$)/m);
  if (name) set("taxpayer_name", name[1].trim());

  const fy = text.match(/\b(?:Financial Year|F\.?Y\.?)\s*[:\-]?\s*(\d{4}-\d{2})\b/i);
  if (fy) set("financial_year", fy[1]);
  const ay = text.match(/\b(?:Assessment Year|A\.?Y\.?)\s*[:\-]?\s*(\d{4}-\d{2})\b/i);
  if (ay) set("assessment_year", ay[1]);

  const entries: TaxEntry[] = [];
  for (const line of lines) {
    let m = line.match(ROW_26AS);
    if (m) {
      entries.push({
        category: "tds",
        code: m[3] ?? null,
        description: null,
        source_name: m[1].trim(),
        source_tan: m[2],
        date: null,
        amount: parseAmount(m[4]),
        tax_deducted: parseAmount(m[5]),
        tax_deposited: parseAmount(m[6]),
      });
      continue;
    }
    m = line.match(ROW_AIS);
    if (m) {
      const prefix = m[1].slice(0, 3).toLowerCase() as "tds" | "tcs" | "sft";
      entries.push({
        category: prefix,
        code: m[1],
        description: m[2].trim(),
        source_name: m[3].trim(),
        source_tan: m[4] ?? null,
        date: null,
        amount: parseAmount(m[6]),
        tax_deducted: null,
        tax_deposited: null,
      });
    }
  }
  if (entries.length) set("entries", entries);

  set("total_tax_deducted", labeledAmount(lines, /\btotal (?:tax deducted|tds)\b/i));
}

// ---------- CSV rules ----------

function splitCsvLine(line: string, delim: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === delim && !quoted) {
      cells.push(cur.trim());
      cur = "";
    } else cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

function findCsvHeader(lines: string[]): { index: number; delim: string } | null {
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const line = lines[i].toLowerCase();
    if (!/date/.test(line) || !/(amount|debit|credit|withdraw|deposit)/.test(line)) continue;
    for (const delim of [";", "\t", ",", "|"]) {
      const width = splitCsvLine(lines[i], delim).length;
      if (width >= 3 && lines[i + 1] && splitCsvLine(lines[i + 1], delim).length === width) {
        return { index: i, delim };
      }
    }
  }
  return null;
}

function extractCsv(text: string, data: FinancialDocument, prov: Provenance): boolean {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  const header = findCsvHeader(lines);
  if (!header) return false;

  // Preamble lines (account holder, IBAN, period) go through the text rules.
  extractText(lines.slice(0, header.index).join("\n"), data, prov);

  const cols = splitCsvLine(lines[header.index], header.delim).map((c) => c.toLowerCase());
  const find = (re: RegExp) => cols.findIndex((c) => re.test(c));
  const col = {
    date: find(/date|booking/),
    description: find(/desc|detail|narrative|payee|memo|text|purpose/),
    amount: find(/^amount|amount$/),
    debit: find(/debit|withdraw|paid out|money out/),
    credit: find(/credit|deposit|paid in|money in/),
    balance: find(/balance/),
    currency: find(/currency|ccy/),
  };

  const items: LineItem[] = [];
  const balances: number[] = [];
  let currency: string | null = null;
  for (const line of lines.slice(header.index + 1)) {
    const cells = splitCsvLine(line, header.delim);
    if (cells.length !== cols.length) continue;
    const cell = (i: number) => (i >= 0 ? cells[i] : "");
    let amount: number | null = null;
    if (col.amount >= 0) amount = parseAmount(cell(col.amount));
    else {
      const credit = parseAmount(cell(col.credit)) ?? 0;
      const debit = parseAmount(cell(col.debit)) ?? 0;
      amount = Math.round((credit - Math.abs(debit)) * 100) / 100;
    }
    items.push({
      date: parseDate(cell(col.date)),
      description: cell(col.description) || null,
      quantity: null,
      unit_price: null,
      amount,
    });
    const bal = parseAmount(cell(col.balance));
    if (col.balance >= 0 && bal !== null) balances.push(bal);
    if (col.currency >= 0 && KNOWN_CURRENCIES.has(cell(col.currency).toUpperCase())) {
      currency = cell(col.currency).toUpperCase();
    }
  }
  if (!items.length) return false;

  data.document_type = "bank_statement";
  prov.document_type = "rule";
  data.line_items = items;
  prov.line_items = "rule";
  if (currency) {
    data.currency = currency;
    prov.currency = "rule";
  }

  const dates = items.map((i) => i.date).filter((d): d is string => d !== null).sort();
  if (dates.length && data.period_start === null) {
    data.period_start = dates[0];
    data.period_end = dates[dates.length - 1];
    prov.period_start = prov.period_end = "rule";
  }

  // Running balance column: opening = first balance minus first movement.
  if (balances.length === items.length && items[0].amount !== null) {
    data.opening_balance = Math.round((balances[0] - items[0].amount) * 100) / 100;
    data.closing_balance = balances[balances.length - 1];
    prov.opening_balance = prov.closing_balance = "rule";
  }
  return true;
}

// ---------- entry point ----------

export function extractWithRules(text: string): RuleResult {
  const data = emptyDocument();
  const provenance: Provenance = {};
  if (extractCsv(text, data, provenance)) return { data, provenance, kind: "csv" };
  extractText(text, data, provenance);
  return { data, provenance, kind: "text" };
}
