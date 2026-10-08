import { isValidIban } from "./deterministic";
import type { MaskSummary } from "./schema";

// Replaces personal identifiers with stable placeholders before any text is
// sent to the model. The rule layer has already read the real values locally;
// placeholders the model echoes back are restored on the way out.

type Kind = "NAME" | "EMAIL" | "PHONE" | "IBAN" | "PAN" | "AADHAAR" | "ACCOUNT";

const PATTERNS: [Kind, RegExp, ((m: string) => boolean)?][] = [
  ["EMAIL", /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g],
  ["PHONE", /\+\d{1,3}[\s-]?\d[\d\s-]{7,}\d\b/g],
  ["IBAN", /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,3})?\b/g, (m) => isValidIban(m)],
  ["PAN", /\b[A-Z]{5}\d{4}[A-Z]\b/g],
  ["AADHAAR", /\b\d{4}\s\d{4}\s\d{4}\b|\b\d{12}\b/g],
  ["ACCOUNT", /\b\d{9,18}\b/g],
];

// IBANs and Aadhaar numbers are stored without spaces in the output schema.
const canonical = (kind: Kind, value: string) =>
  kind === "IBAN" || kind === "AADHAAR" ? value.replace(/\s+/g, "") : value;

export interface Masker {
  masked: string;
  summary: MaskSummary;
  /** Masks the same identifiers inside any JSON-serialisable value. */
  maskValue<T>(value: T): T;
  /** Restores placeholders inside any JSON-serialisable value. */
  unmaskValue<T>(value: T): T;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * `known` lets the rule layer pass values it has already identified as
 * personal, such as the taxpayer's name on a tax statement.
 */
export function createMasker(text: string, known: [Kind, string][] = []): Masker {
  const toToken = new Map<string, string>();
  const toValue = new Map<string, string>();
  const kinds: Record<string, number> = {};

  const patterns: [Kind, RegExp, ((m: string) => boolean)?][] = [
    ...known.filter(([, v]) => v.trim().length > 2).map(([k, v]) => [k, new RegExp(escape(v), "g")] as [Kind, RegExp]),
    ...PATTERNS,
  ];

  let masked = text;
  for (const [kind, re, accept] of patterns) {
    masked = masked.replace(re, (match) => {
      if (accept && !accept(match)) return match;
      const value = canonical(kind, match);
      let token = toToken.get(value);
      if (!token) {
        kinds[kind] = (kinds[kind] ?? 0) + 1;
        token = `[${kind}_${kinds[kind]}]`;
        toToken.set(value, token);
        toValue.set(token, value);
      }
      if (match !== value) toToken.set(match, token);
      return token;
    });
  }

  // Longest originals first so a value never gets partially replaced.
  const originals = [...toToken.keys()].sort((a, b) => b.length - a.length);
  const mapStrings = (value: unknown, fn: (s: string) => string): unknown => {
    if (typeof value === "string") return fn(value);
    if (Array.isArray(value)) return value.map((v) => mapStrings(v, fn));
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapStrings(v, fn)]));
    }
    return value;
  };

  return {
    masked,
    summary: { count: toValue.size, kinds },
    maskValue: <T,>(value: T) =>
      mapStrings(value, (s) => originals.reduce((acc, o) => acc.split(o).join(toToken.get(o)!), s)) as T,
    unmaskValue: <T,>(value: T) =>
      mapStrings(value, (s) => s.replace(/\[(?:NAME|EMAIL|PHONE|IBAN|PAN|AADHAAR|ACCOUNT)_\d+\]/g, (t) => toValue.get(t) ?? t)) as T,
  };
}
