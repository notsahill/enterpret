import type { ReactNode } from "react";
import type { Provenance, Source } from "@/lib/schema";

interface Line {
  indent: number;
  content: ReactNode;
  source: Source | null;
}

/** Finds who produced a path: exact match first, then nearest ancestor. */
function sourceFor(path: string, provenance: Provenance): Source | null {
  let p = path;
  while (p) {
    if (provenance[p]) return provenance[p];
    const cut = Math.max(p.lastIndexOf("."), p.lastIndexOf("["));
    p = cut > 0 ? p.slice(0, cut) : "";
  }
  return null;
}

function scalar(value: unknown): ReactNode {
  if (value === null) return <span className="j-null">null</span>;
  if (typeof value === "string") return <span className="j-str">{JSON.stringify(value)}</span>;
  if (typeof value === "number") return <span className="j-num">{value}</span>;
  return <span className="j-bool">{String(value)}</span>;
}

function walk(value: unknown, path: string, key: string | null, indent: number, last: boolean, prov: Provenance, out: Line[]) {
  const label = key !== null ? <span className="j-key">{JSON.stringify(key)}: </span> : null;
  const comma = last ? "" : ",";
  const source = path ? sourceFor(path, prov) : null;

  if (value !== null && typeof value === "object") {
    const isArray = Array.isArray(value);
    const entries = isArray ? value.map((v, i) => [String(i), v] as const) : Object.entries(value);
    const [open, close] = isArray ? ["[", "]"] : ["{", "}"];
    if (!entries.length) {
      out.push({ indent, content: <>{label}{open}{close}{comma}</>, source });
      return;
    }
    out.push({ indent, content: <>{label}{open}</>, source });
    entries.forEach(([k, v], i) => {
      const childPath = isArray ? `${path}[${k}]` : path ? `${path}.${k}` : k;
      walk(v, childPath, isArray ? null : k, indent + 1, i === entries.length - 1, prov, out);
    });
    out.push({ indent, content: <>{close}{comma}</>, source });
    return;
  }
  out.push({ indent, content: <>{label}{scalar(value)}{comma}</>, source: value === null ? null : source });
}

export function JsonView({ value, provenance, focus }: { value: unknown; provenance: Provenance; focus: Source | null }) {
  const lines: Line[] = [];
  walk(value, "", null, 0, true, provenance, lines);
  return (
    <pre className="json" data-focus={focus ?? undefined} aria-label="Extracted JSON">
      {lines.map((line, i) => (
        <div
          key={i}
          className="json-line"
          data-source={line.source ?? undefined}
          style={{ "--i": i, "--indent": line.indent } as React.CSSProperties}
        >
          {line.source && <span className="sr-only">{line.source === "rule" ? "Read by rule: " : "Read by model: "}</span>}
          {line.content}
        </div>
      ))}
    </pre>
  );
}
