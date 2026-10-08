# Enterpret landing page

Landing page with a live extractor: paste or upload a financial document (invoice, bank statement CSV, remittance email, Form 26AS, AIS, TIS, Form 16, PDF) and get structured JSON back.

## How extraction works

1. **Rules** (`lib/deterministic.ts`): labeled amounts, dates, VAT IDs, currency, CSV columns, IBANs (mod-97 verified). Ambiguous values stay `null`.
2. **Model** (`lib/ai.ts`): Claude (`claude-opus-5-5`) fills only the null fields, constrained to the Zod schema in `lib/schema.ts` via structured outputs. Rule values are never overwritten (`lib/pipeline.ts`); disagreements are reported.
3. **Checks** (`lib/validate.ts`): line items vs subtotal, subtotal + tax vs total, balance roll-forward, ISO dates, ISO 4217, IBAN checksum.

Each response includes `data`, `provenance` (`rule` / `model` per field), `checks` and `meta`.

Without `ANTHROPIC_API_KEY` the demo runs rules and checks only. PDFs require the model step.

## PII

`lib/pii.ts` replaces PAN, Aadhaar, account numbers, IBANs, emails, phone numbers and the rule-identified taxpayer name with placeholders (`[PAN_1]`) before text goes to the model, and restores them in the output. The response's `model_input` field shows exactly what was sent. PDFs go to the model unmasked. Documents are never persisted or logged.

## Contact form

`POST /api/contact` sends mail over SMTP (nodemailer) to `CONTACT_TO` (default `support@enterpret.si`), with the submitter as `Reply-To`. Includes validation, a honeypot field and per-IP rate limiting.

## Run

```bash
cp .env.example .env.local   # fill in SMTP_* and optionally ANTHROPIC_API_KEY
npm install
npm run dev                   # http://localhost:3000
```

Deploys as a standard Next.js app (e.g. Vercel). The rate limiter is in-memory; use a shared store if you run several instances.

## Deploy to GitHub Pages

`.github/workflows/deploy.yml` builds a static export on every push to `main` and publishes it to Pages. In the repo, set **Settings → Pages → Source** to **GitHub Actions**.

The Pages build differs from the server build:

- Extraction runs in the visitor's browser (rules, masking, checks). The model step and PDF upload are unavailable.
- The contact form posts to [FormSubmit](https://formsubmit.co), which forwards to `support@enterpret.si`. The first submission triggers a one-time activation email to that inbox; click the link in it to start receiving messages.
- The base path comes from the Pages config, so it works at `user.github.io/<repo>/` and on a custom domain.

The server routes in `app/api` remain for hosting with a Node runtime (e.g. Vercel), where the model step and SMTP work.
