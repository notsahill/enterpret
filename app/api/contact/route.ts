import { NextResponse } from "next/server";
import nodemailer, { type Transporter } from "nodemailer";
import { z } from "zod";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const CONTACT_TO = process.env.CONTACT_TO ?? "support@enterpret.si";

const oneLine = (max: number) =>
  z.string().trim().max(max).transform((s) => s.replace(/[\r\n]+/g, " "));

const ContactSchema = z.object({
  name: oneLine(120).pipe(z.string().min(1, "Enter your name.")),
  email: z.string().trim().email("Enter a valid email address.").max(200),
  company: oneLine(160).optional().default(""),
  message: z.string().trim().min(10, "Write at least a sentence about what you need.").max(5000),
  website: z.string().optional().default(""), // honeypot
});

let transporter: Transporter | null = null;
function getTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  const port = Number(SMTP_PORT ?? 587);
  transporter ??= nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

export async function POST(req: Request) {
  if (!rateLimit(`contact:${clientIp(req)}`, 5, 10 * 60_000)) {
    return NextResponse.json({ error: "Too many messages from this address. Try again later." }, { status: 429 });
  }

  const parsed = ContactSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const fieldErrors = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]));
    return NextResponse.json({ error: "Check the highlighted fields.", fieldErrors }, { status: 400 });
  }
  const { name, email, company, message, website } = parsed.data;

  // Bots fill the hidden field; report success so they don't retry.
  if (website) return NextResponse.json({ ok: true });

  const mailer = getTransporter();
  if (!mailer) {
    console.error("contact: SMTP_HOST, SMTP_USER and SMTP_PASS must be set");
    return NextResponse.json(
      { error: `Email is not configured on this server. Write to ${CONTACT_TO} directly.` },
      { status: 503 },
    );
  }

  try {
    await mailer.sendMail({
      from: process.env.CONTACT_FROM ?? process.env.SMTP_USER,
      to: CONTACT_TO,
      replyTo: { name, address: email },
      subject: `Enterpret enquiry from ${name}${company ? ` (${company})` : ""}`,
      text: [`Name: ${name}`, `Email: ${email}`, `Company: ${company || "-"}`, "", message].join("\n"),
    });
  } catch (err) {
    console.error("contact: send failed", err);
    return NextResponse.json(
      { error: `The message could not be sent. Write to ${CONTACT_TO} directly.` },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
