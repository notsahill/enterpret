"use client";

import { useState } from "react";

const CONTACT_EMAIL = "support@enterpret.si";
// Static builds (GitHub Pages) post to FormSubmit, which forwards to CONTACT_EMAIL.
const STATIC = process.env.NEXT_PUBLIC_STATIC_EXPORT === "1";

function validate(fields: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!fields.name?.trim()) errors.name = "Enter your name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email?.trim() ?? "")) errors.email = "Enter a valid email address.";
  if ((fields.message?.trim().length ?? 0) < 10) errors.message = "Write at least a sentence about what you need.";
  return errors;
}

async function sendStatic(fields: Record<string, string>) {
  const res = await fetch(`https://formsubmit.co/ajax/${CONTACT_EMAIL}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      name: fields.name,
      email: fields.email,
      company: fields.company || "-",
      message: fields.message,
      _subject: `Enterpret enquiry from ${fields.name}${fields.company ? ` (${fields.company})` : ""}`,
      _replyto: fields.email,
      _template: "table",
      _honey: fields.website,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || String(json.success) !== "true") {
    throw new Error(`The message could not be sent. Write to ${CONTACT_EMAIL} directly.`);
  }
}

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string };

export function ContactForm() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fields = Object.fromEntries(new FormData(form)) as Record<string, string>;
    const errors = validate(fields);
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setStatus({ kind: "error", message: "Check the highlighted fields." });
      return;
    }
    setStatus({ kind: "sending" });
    try {
      if (STATIC) {
        await sendStatic(fields);
        form.reset();
        setStatus({ kind: "sent" });
        return;
      }
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      const json = await res.json();
      if (!res.ok) {
        setFieldErrors(json.fieldErrors ?? {});
        throw new Error(json.error ?? "The message could not be sent.");
      }
      form.reset();
      setStatus({ kind: "sent" });
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : "The message could not be sent." });
    }
  }

  if (status.kind === "sent") {
    return (
      <div className="form-done" role="status">
        <p className="form-done-title">Message sent.</p>
        <p className="muted">We reply from {CONTACT_EMAIL}, usually within one working day.</p>
        <button className="btn-quiet" onClick={() => setStatus({ kind: "idle" })}>Send another message</button>
      </div>
    );
  }

  const err = (name: string) =>
    fieldErrors[name] ? <span className="field-error" id={`${name}-error`}>{fieldErrors[name]}</span> : null;
  const described = (name: string) => (fieldErrors[name] ? `${name}-error` : undefined);

  return (
    <form className="contact-form" onSubmit={onSubmit} noValidate>
      <div className="field-row">
        <label className="field">
          <span>Name</span>
          <input name="name" autoComplete="name" required aria-invalid={!!fieldErrors.name} aria-describedby={described("name")} />
          {err("name")}
        </label>
        <label className="field">
          <span>Work email</span>
          <input name="email" type="email" autoComplete="email" required aria-invalid={!!fieldErrors.email} aria-describedby={described("email")} />
          {err("email")}
        </label>
      </div>
      <label className="field">
        <span>Company <em className="muted">(optional)</em></span>
        <input name="company" autoComplete="organization" />
      </label>
      <label className="field">
        <span>What documents do you need to extract?</span>
        <textarea
          name="message"
          rows={5}
          required
          placeholder="e.g. Form 26AS and AIS for 1,500 clients each filing season, exported to our tax software."
          aria-invalid={!!fieldErrors.message}
          aria-describedby={described("message")}
        />
        {err("message")}
      </label>
      <label className="honeypot" aria-hidden="true">
        Website <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
      <div className="form-foot">
        <button className="btn-primary" type="submit" disabled={status.kind === "sending"}>
          {status.kind === "sending" ? "Sending…" : "Send message"}
        </button>
        {status.kind === "error" && <p className="alert" role="alert">{status.message}</p>}
      </div>
    </form>
  );
}
