/**
 * Pricing rules for quotations (CONVENTIONS business rules 1–3). OWNED BY: Team B (Quotations).
 *
 * Pure functions (no server-only imports) so they can be used in client components and unit tests.
 * `getPricingSettings` only needs a Drizzle db handle and uses the relational query API, so it adds
 * no runtime imports either.
 */
import type { DB } from "@/db";
import { marginPct, round2 } from "./format";

export type PricingSettings = {
  defaultMarkupPct: number;
  minMarginPct: number;
  gstPct: number;
  quoteValidityDays: number;
};

export const DEFAULT_PRICING: PricingSettings = { defaultMarkupPct: 40, minMarginPct: 15, gstPct: 18, quoteValidityDays: 30 };

function num(v: unknown, fallback: number, min = 0, max = 1000): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}

/** Normalises a raw settings value (unknown JSON) into PricingSettings with safe defaults. */
export function parsePricingSettings(raw: unknown): PricingSettings {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    defaultMarkupPct: num(o.defaultMarkupPct, DEFAULT_PRICING.defaultMarkupPct),
    minMarginPct: num(o.minMarginPct, DEFAULT_PRICING.minMarginPct, -100, 100),
    gstPct: num(o.gstPct, DEFAULT_PRICING.gstPct, 0, 100),
    quoteValidityDays: Math.round(num(o.quoteValidityDays, DEFAULT_PRICING.quoteValidityDays, 1, 3650)),
  };
}

/** Reads settings key "pricing" ({defaultMarkupPct,minMarginPct,gstPct,quoteValidityDays}), defaults 40/15/18/30. */
export async function getPricingSettings(db: DB): Promise<PricingSettings> {
  try {
    const row = await db.query.settings.findFirst({ where: (s, { eq }) => eq(s.key, "pricing") });
    return parsePricingSettings(row?.value);
  } catch {
    return { ...DEFAULT_PRICING };
  }
}

/** Minimal item shape needed for pricing. */
export type PriceableItem = {
  lastPurchaseRate?: number | null;
  listPrice?: number | null;
  markupPct?: number | null;
  erectionRate?: number | null;
};

/** Rule 1 — latest cost = lastPurchaseRate ?? listPrice ?? 0. */
export function latestCost(item: PriceableItem): number {
  const v = item.lastPurchaseRate ?? item.listPrice ?? 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Rule 2 — suggested rates. markupPct = quotation markup; when null/undefined falls back to the
 * item's own markupPct, then to the default 40%.
 */
export function suggestRates(item: PriceableItem, markupPct?: number | null): { costRate: number; supplyRate: number; erectionRate: number } {
  const costRate = round2(latestCost(item));
  const m = Number(markupPct ?? item.markupPct ?? DEFAULT_PRICING.defaultMarkupPct);
  const markup = Number.isFinite(m) ? m : DEFAULT_PRICING.defaultMarkupPct;
  return {
    costRate,
    supplyRate: round2(costRate * (1 + markup / 100)),
    erectionRate: round2(Number(item.erectionRate ?? 0) || 0),
  };
}

export type QuoteLineInput = { qty: number; supplyRate: number; erectionRate: number; costRate?: number | null };

export type QuoteTotals = {
  supply: number;
  erection: number;
  /** supply + erection */
  gross: number;
  discount: number;
  /** supply + erection − discount (taxable value, excl. GST) */
  taxable: number;
  tax: number;
  grand: number;
  cost: number;
  /** material margin % after the supply share of the discount: (netSupply − cost) / netSupply */
  marginPct: number;
  /** count of lines with qty > 0 */
  lineCount: number;
};

/**
 * Rule 3 — quotation totals. Lines with qty ≤ 0 (or non-finite) are ignored.
 * supply = Σ qty×supplyRate; erection = Σ qty×erectionRate; discount = (supply+erection)×discountPct/100;
 * tax = (supply+erection−discount)×gstPct/100; grand = supply+erection−discount+tax; cost = Σ qty×costRate.
 */
export function computeQuoteTotals(lines: readonly QuoteLineInput[], discountPct = 0, gstPct = 18): QuoteTotals {
  let supply = 0, erection = 0, cost = 0, lineCount = 0;
  for (const l of lines) {
    const q = Number(l.qty);
    if (!Number.isFinite(q) || q <= 0) continue;
    lineCount++;
    supply += q * (Number(l.supplyRate) || 0);
    erection += q * (Number(l.erectionRate) || 0);
    cost += q * (Number(l.costRate ?? 0) || 0);
  }
  supply = round2(supply);
  erection = round2(erection);
  cost = round2(cost);
  const d = Number(discountPct) || 0;
  const g = Number(gstPct) || 0;
  const gross = round2(supply + erection);
  const discount = round2((gross * d) / 100);
  const taxable = round2(gross - discount);
  const tax = round2((taxable * g) / 100);
  const grand = round2(taxable + tax);
  const netSupply = supply - (supply * d) / 100;
  return { supply, erection, gross, discount, taxable, tax, grand, cost, marginPct: round2(marginPct(netSupply, cost)), lineCount };
}

/** Material margin % of one line: (supplyRate − costRate) / supplyRate × 100 (0 when no supply rate). */
export function lineMarginPct(line: { supplyRate: number; costRate?: number | null }): number {
  return round2(marginPct(Number(line.supplyRate) || 0, Number(line.costRate ?? 0) || 0));
}

/** Pricing warning for a line: "below_cost" when supply < cost, "low_margin" when margin < min. */
export function linePriceWarning(line: { supplyRate: number; costRate?: number | null }, minMarginPct: number): "below_cost" | "low_margin" | null {
  const cost = Number(line.costRate ?? 0) || 0;
  if (cost <= 0) return null;
  if ((Number(line.supplyRate) || 0) < cost) return "below_cost";
  if (lineMarginPct(line) < minMarginPct) return "low_margin";
  return null;
}
