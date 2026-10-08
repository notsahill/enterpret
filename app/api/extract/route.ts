import { NextResponse } from "next/server";
import { runPipeline } from "@/lib/pipeline";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_TEXT_CHARS = 100_000;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  if (!rateLimit(`extract:${clientIp(req)}`, 10, 60_000)) {
    return fail(429, "Too many extractions from this address. Try again in a minute.");
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "Send the document as multipart form data with a `text` or `file` field.");
  }

  const file = form.get("file");
  const text = form.get("text");

  try {
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_FILE_BYTES) return fail(413, "Files must be 8 MB or smaller.");
      const bytes = Buffer.from(await file.arrayBuffer());
      const isPdf = file.type === "application/pdf" || bytes.subarray(0, 5).toString() === "%PDF-";
      if (isPdf) return NextResponse.json(await runPipeline({ kind: "pdf", base64: bytes.toString("base64") }));
      const decoded = bytes.toString("utf8");
      if (decoded.includes("\u0000")) return fail(415, "Upload a PDF, CSV or plain-text file.");
      return NextResponse.json(await runPipeline({ kind: "text", text: decoded.slice(0, MAX_TEXT_CHARS) }));
    }

    if (typeof text === "string" && text.trim()) {
      if (text.length > MAX_TEXT_CHARS) return fail(413, "Text must be 100,000 characters or fewer.");
      return NextResponse.json(await runPipeline({ kind: "text", text }));
    }
  } catch (err) {
    // Log the error type only; messages and stacks could echo document content.
    console.error("extract failed:", err instanceof Error ? err.name : "unknown");
    return fail(500, "Extraction failed. Check the input and try again.");
  }

  return fail(400, "Paste document text or upload a file to extract.");
}
