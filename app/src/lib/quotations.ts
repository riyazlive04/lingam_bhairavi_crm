/**
 * Quotation helpers shared by quotation pages, export, print and follow-ups. Maintainer: Sirah Digital.
 * Pure functions + settings readers (relational query API → no runtime schema imports), safe to unit-test.
 */
import type { DB } from "@/db";

// ---------------------------------------------------------------- amount in words (Indian system)
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowHundred(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10), o = n % 10;
  return TENS[t] + (o ? " " + ONES[o] : "");
}
function belowThousand(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(ONES[h] + " Hundred");
  if (r) parts.push(belowHundred(r));
  return parts.join(" ");
}
/** Integer → words using Crore / Lakh / Thousand / Hundred (supports any size via repeated crores). */
function intToIndianWords(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7);
  let rest = n % 1e7;
  if (crore) parts.push(intToIndianWords(crore) + " Crore");
  const lakh = Math.floor(rest / 1e5);
  rest %= 1e5;
  if (lakh) parts.push(belowHundred(lakh) + " Lakh");
  const thousand = Math.floor(rest / 1000);
  rest %= 1000;
  if (thousand) parts.push(belowHundred(thousand) + " Thousand");
  if (rest) parts.push(belowThousand(rest));
  return parts.join(" ");
}

/**
 * Amount in words, Indian numbering system.
 * numberToIndianWords(1234567.5) → "Rupees Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven and Fifty Paise Only"
 */
export function numberToIndianWords(amount: number, opts: { currency?: boolean } = {}): string {
  const currency = opts.currency ?? true;
  if (!Number.isFinite(amount)) return "";
  const neg = amount < 0;
  const abs = Math.abs(amount);
  let rupees = Math.floor(abs);
  let paise = Math.round((abs - rupees) * 100);
  if (paise === 100) { rupees += 1; paise = 0; }
  const words = intToIndianWords(rupees);
  if (!currency) return (neg ? "Minus " : "") + words + (paise ? ` Point ${belowHundred(paise)}` : "");
  let s = `Rupees ${words}`;
  if (paise) s += ` and ${belowHundred(paise)} Paise`;
  return (neg ? "Minus " : "") + s + " Only";
}

// ---------------------------------------------------------------- sections
/** Groups lines by `section`, preserving first-appearance order (lines are assumed sorted by sortOrder). */
export function groupBySection<T extends { section: string | null }>(lines: readonly T[]): { section: string; lines: T[] }[] {
  const map = new Map<string, T[]>();
  for (const l of lines) {
    const key = (l.section ?? "").trim();
    const arr = map.get(key);
    if (arr) arr.push(l);
    else map.set(key, [l]);
  }
  return [...map.entries()].map(([section, ls]) => ({ section, lines: ls }));
}

/** "A - Pump House & Tanks" → { code: "A", title: "Pump House & Tanks" } (code empty when no " - "). */
export function splitSection(section: string): { code: string; title: string } {
  const m = /^\s*([A-Za-z0-9.]{1,8})\s+-\s+(.+)$/.exec(section);
  return m ? { code: m[1], title: m[2] } : { code: "", title: section };
}

// ---------------------------------------------------------------- numbering
/** Revision number: "LBE/Q/2026-27/0019" (rev 1) → "LBE/Q/2026-27/0019-R1"; strips any previous -Rn suffix. */
export function revisionNumber(number: string, revision: number): string {
  return `${number.replace(/-R\d+$/, "")}-R${revision}`;
}

// ---------------------------------------------------------------- phone / WhatsApp
/** Indian mobile → 12-digit "91XXXXXXXXXX", or null if it cannot be normalised. */
export function normalizeIndianMobile(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const first = phone.split(/[,/;]/)[0];
  let d = first.replace(/\D/g, "");
  if (d.startsWith("0091")) d = d.slice(4);
  else if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d.length === 10 ? `91${d}` : null;
}

export function whatsappLink(phone: string | null | undefined, text: string): string | null {
  const n = normalizeIndianMobile(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}

export function telLink(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const first = phone.split(/[,/;]/)[0].replace(/[^\d+]/g, "");
  return first.length >= 6 ? `tel:${first}` : null;
}

/** Calendar date (YYYY-MM-DD) of a timestamp in IST. */
export function istDate(d: Date): string {
  return new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- statuses
export const OPEN_QUOTE_STATUSES = ["sent", "negotiation"] as const;
export const EDITABLE_QUOTE_STATUSES = ["draft", "sent", "negotiation"] as const;
export const FOLLOWUP_OUTCOMES = ["positive", "neutral", "negative", "no_response"] as const;
export const FOLLOWUP_OUTCOME_LABEL: Record<string, string> = {
  positive: "Positive", neutral: "Neutral", negative: "Negative", no_response: "No response",
};
export const FOLLOWUP_MODE_LABEL: Record<string, string> = {
  call: "Call", email: "Email", whatsapp: "WhatsApp", visit: "Site visit", meeting: "Meeting",
};

export function isEditableStatus(status: string) {
  return (EDITABLE_QUOTE_STATUSES as readonly string[]).includes(status);
}

// ---------------------------------------------------------------- company settings
export type CompanySettings = {
  name: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  gstin: string;
  quoteTerms: string;
  bankDetails: string;
};

export const DEFAULT_COMPANY: CompanySettings = {
  name: "Linga Bhairavi Enterprise",
  tagline: "Fire Protection Systems: Turnkey Solutions",
  address: "Hosur, Tamil Nadu",
  phone: "",
  email: "",
  website: "",
  gstin: "",
  quoteTerms: [
    "Prices are exclusive of GST, charged extra as applicable.",
    "Payment: 50% advance with PO, balance against delivery / completion.",
    "Delivery: 2 to 4 weeks from the date of confirmed PO and advance.",
    "Civil work, power supply and scaffolding at site in client scope unless stated.",
    "Quantities are as per BOQ; actuals will be billed as per site measurement.",
  ].join("\n"),
  bankDetails: "",
};

function str(v: unknown, fallback: string): string {
  if (Array.isArray(v)) return v.map(String).join("\n");
  return typeof v === "string" && v.trim() ? v : fallback;
}

export function parseCompanySettings(raw: unknown): CompanySettings {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    name: str(o.name, DEFAULT_COMPANY.name),
    tagline: str(o.tagline, DEFAULT_COMPANY.tagline),
    address: str(o.address, DEFAULT_COMPANY.address),
    phone: str(o.phone, ""),
    email: str(o.email, ""),
    website: str(o.website, ""),
    gstin: str(o.gstin, ""),
    quoteTerms: str(o.quoteTerms ?? o.terms, DEFAULT_COMPANY.quoteTerms),
    bankDetails: str(o.bankDetails ?? o.bank, ""),
  };
}

/** Reads settings key "company" (letterhead + quoteTerms) with safe defaults. */
export async function getCompanySettings(db: DB): Promise<CompanySettings> {
  try {
    const row = await db.query.settings.findFirst({ where: (s, { eq }) => eq(s.key, "company") });
    return parseCompanySettings(row?.value);
  } catch {
    return { ...DEFAULT_COMPANY };
  }
}
