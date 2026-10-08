export interface Sample {
  id: string;
  label: string;
  filename: string;
  text: string;
}

export const SAMPLES: Sample[] = [
  {
    id: "invoice",
    label: "Invoice",
    filename: "INV-2026-0142.txt",
    text: `LEDINA d.o.o.
Dunajska cesta 156, 1000 Ljubljana, Slovenia
VAT ID: SI12345678

INVOICE
Invoice no: INV-2026-0142
Invoice date: 12.03.2026
Due date: 11.04.2026

Bill to:
Brandt Maschinenbau GmbH
Industriestraße 42, 70565 Stuttgart, Germany
VAT ID: DE811234567

Description                              Qty   Unit price      Amount
Data pipeline setup                        1     1,800.00    1,800.00
Monthly extraction licence (Mar 2026)      3       450.00    1,350.00
Support hours                              6        75.00      450.00

Subtotal                                                     3,600.00
VAT 22%                                                        792.00
Total due (EUR)                                              4,392.00

Pay to IBAN SI56 2633 0001 2039 086
Reference: SI00 2026-0142`,
  },
  {
    id: "statement",
    label: "Bank statement",
    filename: "statement-2026-03.csv",
    text: `Account holder;Ledina d.o.o.
IBAN;DE89 3704 0044 0532 0130 00
Statement period;01.03.2026 - 31.03.2026
Date;Description;Debit;Credit;Balance;Currency
02.03.2026;SEPA credit Novak Holding INV-2026-0131;;4.392,00;16.872,00;EUR
05.03.2026;Office rent March;1.950,00;;14.922,00;EUR
09.03.2026;AWS EMEA SARL;612,37;;14.309,63;EUR
16.03.2026;SEPA credit Brandt GmbH INV-2026-0138;;2.745,00;17.054,63;EUR
24.03.2026;Payroll March;8.400,00;;8.654,63;EUR
31.03.2026;Bank fees;14,90;;8.639,73;EUR`,
  },
  {
    id: "remittance",
    label: "Remittance",
    filename: "payment-advice.eml.txt",
    text: `From: Jana Weber <ap@brandt-maschinenbau.de>
Subject: Payment advice

Hi Ledina team,

Please find our payment advice below. We paid the following invoices on 03/04/2026 by SEPA transfer.

  INV-2026-0138    2,745.00
  INV-2026-0142    4,392.00

Total paid: EUR 7,137.00
Reference: SI00 2026-0142

Kind regards,
Jana Weber
Accounts Payable, Brandt Maschinenbau GmbH
+49 711 2345 6789`,
  },
  {
    id: "26as",
    label: "Form 26AS",
    filename: "26AS-ABCPE1234F-2025-26.txt",
    text: `Annual Tax Statement (Form 26AS)
Permanent Account Number (PAN): ABCPE1234F
Name of Assessee: RAHUL MEHTA
Financial Year: 2024-25    Assessment Year: 2025-26

PART-I - Details of Tax Deducted at Source
Sr.  Name of Deductor                  TAN of Deductor  Section  Total Amount Paid/Credited  Total Tax Deducted  Total TDS Deposited
1    NORTHWIND TECHNOLOGIES PVT LTD    MUMN12345C       192      18,60,000.00                2,41,800.00         2,41,800.00
2    HDFC BANK LIMITED                 MUMH03189E       194A     84,250.00                   8,425.00            8,425.00
3    ZENITH CONSULTING LLP             BLRZ04567A       194J     1,20,000.00                 12,000.00           9,000.00

Total Tax Deducted: 2,62,225.00`,
  },
  {
    id: "ais",
    label: "AIS",
    filename: "AIS-ABCPE1234F-2025-26.txt",
    text: `Annual Information Statement (AIS)
PAN: ABCPE1234F    Name: RAHUL MEHTA
Aadhaar: 4821 7730 1956
Financial Year: 2024-25    Assessment Year: 2025-26

Part B1 - Information relating to TDS/TCS
SR  Information Code  Information Description            Information Source                             Count  Amount
1   TDS-192           Salary received                    NORTHWIND TECHNOLOGIES PVT LTD (MUMN12345C)    12     18,60,000
2   TDS-194A          Interest other than securities     HDFC BANK LIMITED (MUMH03189E)                 4      84,250

Part B2 - SFT Information
3   SFT-016(SB)       Interest from savings bank         STATE BANK OF INDIA, A/c 50100234567812        1      6,412
4   SFT-015           Dividend                           INFOSYS LIMITED                                2      14,500
5   SFT-018           Purchase of mutual fund units      HDFC ASSET MANAGEMENT COMPANY LIMITED          3      2,40,000`,
  },
];
