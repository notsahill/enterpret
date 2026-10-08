import Link from "next/link";
import { ContactForm } from "./components/ContactForm";
import { Extractor } from "./components/Extractor";

const STAGES = [
  {
    title: "Rules read everything with a fixed shape",
    body: "Labeled totals, ISO and European dates, VAT IDs, currency codes, CSV columns, PAN and TAN, and the TDS rows of Form 26AS and AIS. IBANs are accepted only when the mod-97 checksum passes. Same input, same output, every time. When a rule can’t be certain, as with 03/04/2026, it leaves the field empty instead of guessing.",
  },
  {
    title: "The model fills only the gaps",
    body: "Party names, line items in free-form tables, scanned PDFs, dates that need context. Claude receives the document with personal identifiers masked, plus the rule output, and must answer in the exact JSON schema. It can confirm a rule value, but never overwrite one.",
  },
  {
    title: "Checks run on the merged result",
    body: "Line items must add up to the subtotal, subtotal plus tax to the total, opening balance plus movements to the closing balance. On tax statements, TDS entries must add up and every rupee deducted must show as deposited. Every check result ships with the JSON, so your system decides what to post and what to send for review.",
  },
];

const DOCUMENTS = [
  {
    group: "Business finance",
    items: ["Invoices and credit notes", "Bank statements, CSV or PDF", "Remittance advices and payment emails", "Receipts"],
  },
  {
    group: "Indian income tax",
    items: ["Form 26AS", "Annual Information Statement (AIS)", "Taxpayer Information Summary (TIS)", "Form 16"],
  },
];

const PRIVACY = [
  {
    title: "Masked before the model",
    body: "PAN, Aadhaar, bank account numbers, IBANs, email addresses, phone numbers and the taxpayer’s name are replaced with placeholders like [PAN_1] before any text reaches the model. Rules read the real values locally, and they’re restored only in your response.",
  },
  {
    title: "Nothing is stored",
    body: "On our servers, documents are processed in memory and discarded once the response is sent. They aren’t written to disk, a database or logs.",
  },
  {
    title: "Rules-only when you need it",
    body: "Run without the model step and no document content leaves the server at all. You still get rule extraction and every check.",
  },
];

const RESPONSE_SHAPE = `POST /api/extract

{
  "data": {
    "document_type": "invoice",
    "total": 4392,
    "issuer": { "name": "LEDINA d.o.o.", … },
    "line_items": [ … ]
  },
  "provenance": {
    "total": "rule",
    "issuer.name": "model"
  },
  "checks": [
    { "id": "total", "status": "pass" }
  ]
}`;

export default function Home() {
  return (
    <>
      <a href="#demo" className="skip">Skip to the demo</a>
      <header className="site-head">
        <Link href="/" className="wordmark" aria-label="Enterpret home">enterpret</Link>
        <nav aria-label="Main">
          <a href="#how">How it works</a>
          <a href="#privacy">Privacy</a>
          <a href="#contact" className="nav-cta">Contact us</a>
        </nav>
      </header>

      <main>
        <section className="hero">
          <h1>
            <span>Financial documents in.</span> <span>Checked JSON out.</span>
          </h1>
          <p className="lede">
            Send an invoice, bank statement, Form 26AS or AIS. Enterpret reads it with deterministic rules first, asks
            an AI model only for what rules can’t read, and checks the numbers before returning structured JSON.
            Personal identifiers are masked before the model sees anything.
          </p>
        </section>

        <section id="demo" className="demo" aria-label="Try the extractor">
          <Extractor />
        </section>

        <section className="docs" aria-labelledby="docs-title">
          <h2 id="docs-title">Documents it reads</h2>
          <div className="docs-groups">
            {DOCUMENTS.map((d) => (
              <div key={d.group}>
                <h3>{d.group}</h3>
                <ul>
                  {d.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section id="how" className="how">
          <div className="how-text">
            <h2>Three passes over every document</h2>
            <ol className="stages">
              {STAGES.map((s, i) => (
                <li key={s.title} className="stage">
                  <span className="stage-n" aria-hidden="true">{i + 1}</span>
                  <div>
                    <h3>{s.title}</h3>
                    <p>{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <aside className="shape" aria-label="Response format">
            <p className="shape-caption">Every response says which layer produced each value.</p>
            <pre>{RESPONSE_SHAPE}</pre>
          </aside>
        </section>

        <section id="privacy" className="privacy" aria-labelledby="privacy-title">
          <h2 id="privacy-title">Personal data stays protected</h2>
          <div className="privacy-points">
            {PRIVACY.map((p) => (
              <div key={p.title} className="privacy-point">
                <h3>{p.title}</h3>
                <p>{p.body}</p>
              </div>
            ))}
          </div>
          <p className="privacy-note muted small">
            Uploaded PDFs are read by the model directly and can’t be masked first. For documents with personal data,
            paste the text or use rules-only mode. To see exactly what the model receives, extract an example above and
            open the masked text view.
          </p>
        </section>

        <section id="contact" className="contact">
          <div className="contact-text">
            <h2>Tell us what you need to extract</h2>
            <p>
              Describe the document types, monthly volume and where the data needs to go. Your message goes straight
              to <a href="mailto:support@enterpret.si">support@enterpret.si</a>.
            </p>
          </div>
          <ContactForm />
        </section>
      </main>

      <footer className="site-foot">
        <span>© {new Date().getFullYear()} Enterpret</span>
        <a href="mailto:support@enterpret.si">support@enterpret.si</a>
      </footer>
    </>
  );
}
