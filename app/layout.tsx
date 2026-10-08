import type { Metadata } from "next";
import { Instrument_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const sans = Instrument_Sans({ subsets: ["latin", "latin-ext"], axes: ["wdth"], variable: "--font-sans" });
const mono = JetBrains_Mono({ subsets: ["latin", "latin-ext"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Enterpret — financial documents to structured JSON",
  description:
    "Send an invoice, bank statement, Form 26AS or AIS. Enterpret reads it with deterministic rules and an AI model, masks personal identifiers, checks the arithmetic, and returns structured JSON.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
