import "server-only";
import { eq } from "drizzle-orm";
import type { DB } from "@/db";
import { settings } from "@/db/schema";
import { parseApprovalMode, type ApprovalMode } from "@/lib/pricing";

/**
 * settings key "company". `bank` is structured; `bankDetails` is the same info pre-formatted as text
 * (quotation/invoice printouts read `bankDetails`). Unknown keys already in the row are preserved on save.
 */
export type CompanyForm = {
  name: string;
  tagline: string;
  address: string;
  gstin: string;
  phone: string;
  email: string;
  website: string;
  bank: { accountName: string; bankName: string; accountNo: string; ifsc: string; branch: string };
  quoteTerms: string;
};

export type PricingForm = { defaultMarkupPct: number; minMarginPct: number; gstPct: number; quoteValidityDays: number; approvalMode: ApprovalMode };
export const PRICING_DEFAULTS: PricingForm = { defaultMarkupPct: 40, minMarginPct: 15, gstPct: 18, quoteValidityDays: 30, approvalMode: "below_margin" };

const s = (v: unknown) => (typeof v === "string" ? v : Array.isArray(v) ? v.map(String).join("\n") : "");
const n = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : Number.isFinite(Number(v)) && v !== "" && v != null ? Number(v) : d);

export async function readSetting(db: DB, key: string): Promise<Record<string, unknown>> {
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).limit(1);
  return row?.value && typeof row.value === "object" && !Array.isArray(row.value) ? (row.value as Record<string, unknown>) : {};
}

export function toCompanyForm(o: Record<string, unknown>): CompanyForm {
  const b = o.bank && typeof o.bank === "object" ? (o.bank as Record<string, unknown>) : {};
  return {
    name: s(o.name) || "Linga Bhairavi Enterprise",
    tagline: s(o.tagline),
    address: s(o.address),
    gstin: s(o.gstin),
    phone: s(o.phone),
    email: s(o.email),
    website: s(o.website),
    bank: { accountName: s(b.accountName), bankName: s(b.bankName), accountNo: s(b.accountNo), ifsc: s(b.ifsc), branch: s(b.branch) },
    quoteTerms: s(o.quoteTerms ?? o.terms),
  };
}

export function toPricingForm(o: Record<string, unknown>): PricingForm {
  return {
    defaultMarkupPct: n(o.defaultMarkupPct, PRICING_DEFAULTS.defaultMarkupPct),
    minMarginPct: n(o.minMarginPct, PRICING_DEFAULTS.minMarginPct),
    gstPct: n(o.gstPct, PRICING_DEFAULTS.gstPct),
    quoteValidityDays: n(o.quoteValidityDays, PRICING_DEFAULTS.quoteValidityDays),
    approvalMode: parseApprovalMode(o.approvalMode),
  };
}

export function formatBankDetails(b: CompanyForm["bank"]) {
  return [
    b.accountName && `A/c name: ${b.accountName}`,
    b.bankName && `Bank: ${b.bankName}`,
    b.accountNo && `A/c no: ${b.accountNo}`,
    b.ifsc && `IFSC: ${b.ifsc}`,
    b.branch && `Branch: ${b.branch}`,
  ].filter(Boolean).join("\n");
}
