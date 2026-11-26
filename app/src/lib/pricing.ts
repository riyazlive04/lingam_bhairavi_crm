/**
 * Pricing rules for quotations (CONVENTIONS business rules 1 to 3). Maintainer: Sirah Digital.
 *
 * Pure functions (no server-only imports) so they can be used in client components and unit tests.
 * `getPricingSettings` only needs a Drizzle db handle and uses the relational query API, so it adds
 * no runtime imports either.
 */
import type { DB } from "@/db";
import { marginPct, round2 } from "./format";

/** Rule 11: when a quotation needs internal approval before it can be sent. */
export type ApprovalMode = "off" | "below_margin" | "all";
export const APPROVAL_MODES: readonly ApprovalMode[] = ["off", "below_margin", "all"] as const;
export const APPROVAL_MODE_LABEL: Record<ApprovalMode, string> = {
  off: "Off",
  below_margin: "Only below minimum margin",
  all: "All quotations",
};

export type PricingSettings = {
  defaultMarkupPct: number;
  minMarginPct: number;
  gstPct: number;
  quoteValidityDays: number;
  approvalMode: ApprovalMode;
};

export const DEFAULT_PRICING: PricingSettings = { defaultMarkupPct: 40, minMarginPct: 15, gstPct: 18, quoteValidityDays: 30, approvalMode: "below_margin" };

export function parseApprovalMode(v: unknown): ApprovalMode {
  return typeof v === "string" && (APPROVAL_MODES as readonly string[]).includes(v) ? (v as ApprovalMode) : DEFAULT_PRICING.approvalMode;
}

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
    approvalMode: parseApprovalMode(o.approvalMode),
  };
}

/** Reads settings key "pricing" ({defaultMarkupPct,minMarginPct,gstPct,quoteValidityDays,approvalMode}), defaults 40/15/18/30/below_margin. */
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
  lastPurchaseDate?: string | null;
  lastPurchaseVendorId?: number | null;
  listPrice?: number | null;
  markupPct?: number | null;
  erectionRate?: number | null;
};

/** Rule 1: latest cost = lastPurchaseRate ?? listPrice ?? 0. */
export function latestCost(item: PriceableItem): number {
  const v = item.lastPurchaseRate ?? item.listPrice ?? 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Rule 2: suggested rates. markupPct = quotation markup; when null/undefined falls back to the
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
 * Rule 3: quotation totals. Lines with qty ≤ 0 (or non-finite) are ignored.
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

// ---------------------------------------------------------------- rule 10: cost snapshot with date
/** Where a quotation line's cost came from: a posted purchase, the master list price, or typed by hand. */
export type CostSource = "purchase" | "list" | "manual";

export type CostSnapshot = { costRate: number; costDate: string | null; costVendorId: number | null; costSource: CostSource };

/**
 * Rule 10: the cost snapshot stored on a quotation line built from an item.
 * costSource is `purchase` when lastPurchaseRate is set (same test as rule 1), else `list`.
 */
export function costSnapshot(item: PriceableItem): CostSnapshot {
  const costRate = round2(latestCost(item));
  if (item.lastPurchaseRate != null && Number.isFinite(Number(item.lastPurchaseRate))) {
    return { costRate, costDate: item.lastPurchaseDate ?? null, costVendorId: item.lastPurchaseVendorId ?? null, costSource: "purchase" };
  }
  return { costRate, costDate: null, costVendorId: null, costSource: "list" };
}

export const parseCostSource = (v: unknown): CostSource | null => (v === "purchase" || v === "list" || v === "manual" ? v : null);

/** Stale-price windows (days): volatile items (pipes, steel) 7 days, everything else 90 days. */
export const STALE_DAYS_VOLATILE = 7;
export const STALE_DAYS_DEFAULT = 90;
export const staleDaysFor = (volatile: boolean | null | undefined) => (volatile ? STALE_DAYS_VOLATILE : STALE_DAYS_DEFAULT);

/** Whole days between a YYYY-MM-DD date and today (YYYY-MM-DD); null for a missing/invalid date. */
export function costAgeDays(costDate: string | null | undefined, today: string): number | null {
  if (!costDate || !/^\d{4}-\d{2}-\d{2}/.test(costDate) || !/^\d{4}-\d{2}-\d{2}/.test(today)) return null;
  const a = Date.parse(costDate.slice(0, 10) + "T00:00:00Z"), b = Date.parse(today.slice(0, 10) + "T00:00:00Z");
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.round((b - a) / 86400000));
}

/** True when a dated purchase cost is older than the stale window for the item. Undated costs are never "stale" (they are shown as list/manual). */
export function isCostStale(costDate: string | null | undefined, volatile: boolean | null | undefined, today: string): boolean {
  const age = costAgeDays(costDate, today);
  return age != null && age > staleDaysFor(volatile);
}

// ---------------------------------------------------------------- rule 11: approval
export type ApprovalStatus = "not_required" | "pending" | "approved" | "rejected";
export const parseApprovalStatus = (v: unknown): ApprovalStatus =>
  v === "pending" || v === "approved" || v === "rejected" ? v : "not_required";

export type ApprovalLine = { qty: number; supplyRate: number; erectionRate?: number; costRate?: number | null };

/**
 * Why a quotation needs approval (empty array = it does not).
 * - mode "all": always.
 * - mode "below_margin": any quantified line below cost or under the minimum margin (rule 11), or the whole
 *   quote's material margin after discount under the minimum (a big discount can push a healthy quote under).
 * - mode "off": never.
 */
export function approvalReasons(lines: readonly ApprovalLine[], opts: { mode: ApprovalMode; minMarginPct: number; discountPct?: number; gstPct?: number }): string[] {
  if (opts.mode === "off") return [];
  if (opts.mode === "all") return ["All quotations need approval before sending"];
  const active = lines.filter((l) => Number(l.qty) > 0);
  const below = active.filter((l) => linePriceWarning(l, opts.minMarginPct) === "below_cost").length;
  const low = active.filter((l) => linePriceWarning(l, opts.minMarginPct) === "low_margin").length;
  const out: string[] = [];
  if (below) out.push(`${below} line${below === 1 ? " is" : "s are"} priced below cost`);
  if (low) out.push(`${low} line${low === 1 ? " is" : "s are"} under the ${opts.minMarginPct}% minimum margin`);
  if (!out.length) {
    const t = computeQuoteTotals(active.map((l) => ({ qty: l.qty, supplyRate: l.supplyRate, erectionRate: l.erectionRate ?? 0, costRate: l.costRate ?? 0 })), opts.discountPct ?? 0, opts.gstPct ?? 0);
    if (t.supply > 0 && t.cost > 0 && t.marginPct < opts.minMarginPct) out.push(`Overall margin after discount is ${t.marginPct}%, under the ${opts.minMarginPct}% minimum`);
  }
  return out;
}

export const needsApproval = (lines: readonly ApprovalLine[], opts: Parameters<typeof approvalReasons>[1]) => approvalReasons(lines, opts).length > 0;

/** Sending / emailing / marking won is blocked while approval is needed and not granted. */
export const approvalBlocks = (needs: boolean, status: string) => needs && status !== "approved";

/**
 * Status after the quote's priced content changed (edit, refresh prices).
 * - no longer needs approval → not_required
 * - approved → pending (needs a fresh look), pending stays pending, rejected stays rejected (sales re-requests)
 * - not_required stays not_required (the panel shows "Approval needed" until someone requests it)
 */
export function approvalAfterChange(current: string, needs: boolean): ApprovalStatus {
  const s = parseApprovalStatus(current);
  if (!needs) return "not_required";
  return s === "approved" ? "pending" : s;
}
