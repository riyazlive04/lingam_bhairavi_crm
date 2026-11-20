/**
 * Item & Price Master helpers. Maintainer: Sirah Digital.
 *
 * Other teams: use `getLatestCost` / `latestCostOf` / `getLatestCosts` to price quotations (CONVENTIONS rule 1)
 * and `suggestedSupplyRate` for rule 2.
 */
import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { DB } from "@/db";
import { items, priceHistory, settings, vendors } from "@/db/schema";
import { daysBetween, round2, todayIST } from "./format";

/** Executor accepted by helpers: the db itself or a transaction handle. */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type Executor = DB | Tx;

export type CostSource = "purchase" | "list" | "none";
export type LatestCost = {
  /** latest buying cost (₹/unit) or null when neither purchase nor list price exists */
  rate: number | null;
  source: CostSource;
  /** date of the purchase invoice that set the rate (null for list prices) */
  date: string | null;
  vendorId: number | null;
};

type CostFields = Pick<typeof items.$inferSelect, "lastPurchaseRate" | "lastPurchaseDate" | "lastPurchaseVendorId" | "listPrice">;

/** Pure: CONVENTIONS rule 1: lastPurchaseRate, falling back to listPrice. */
export function latestCostOf(it: CostFields): LatestCost {
  if (it.lastPurchaseRate != null && Number(it.lastPurchaseRate) > 0) {
    return { rate: Number(it.lastPurchaseRate), source: "purchase", date: it.lastPurchaseDate ?? null, vendorId: it.lastPurchaseVendorId ?? null };
  }
  if (it.listPrice != null) return { rate: Number(it.listPrice), source: "list", date: null, vendorId: null };
  return { rate: null, source: "none", date: null, vendorId: null };
}

/** Latest cost of one item (null when item doesn't exist). */
export async function getLatestCost(db: Executor, itemId: number): Promise<LatestCost | null> {
  const [it] = await db
    .select({ lastPurchaseRate: items.lastPurchaseRate, lastPurchaseDate: items.lastPurchaseDate, lastPurchaseVendorId: items.lastPurchaseVendorId, listPrice: items.listPrice })
    .from(items).where(eq(items.id, itemId));
  return it ? latestCostOf(it) : null;
}

/** Latest cost for many items at once → Map(itemId → LatestCost). */
export async function getLatestCosts(db: Executor, itemIds: number[]): Promise<Map<number, LatestCost>> {
  const out = new Map<number, LatestCost>();
  if (!itemIds.length) return out;
  const rows = await db
    .select({ id: items.id, lastPurchaseRate: items.lastPurchaseRate, lastPurchaseDate: items.lastPurchaseDate, lastPurchaseVendorId: items.lastPurchaseVendorId, listPrice: items.listPrice })
    .from(items).where(inArray(items.id, [...new Set(itemIds)]));
  for (const r of rows) out.set(r.id, latestCostOf(r));
  return out;
}

/** CONVENTIONS rule 2: round2(cost × (1 + markup/100)). */
export function suggestedSupplyRate(cost: number | null | undefined, markupPct: number): number | null {
  if (cost == null) return null;
  return round2(Number(cost) * (1 + Number(markupPct) / 100));
}

/** Default quotation markup from settings `pricing.defaultMarkupPct` (null if not configured). */
export async function getDefaultMarkupPct(db: Executor): Promise<number | null> {
  const [s] = await db.select().from(settings).where(eq(settings.key, "pricing.defaultMarkupPct"));
  if (!s) return null;
  const v = typeof s.value === "object" && s.value !== null && "value" in (s.value as Record<string, unknown>)
    ? (s.value as Record<string, unknown>).value : s.value;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Stale-price windows (days): volatile items (pipes) 7 days, others 90 days. */
export const STALE_DAYS_VOLATILE = 7;
export const STALE_DAYS_DEFAULT = 90;

/** Age (days) of the latest purchase price; null when the item has never been purchased. */
export function priceAgeDays(lastPurchaseDate: string | null | undefined, today = todayIST()): number | null {
  if (!lastPurchaseDate) return null;
  return Math.max(0, daysBetween(lastPurchaseDate, today));
}
export function isPriceStale(it: { lastPurchaseDate: string | null; volatilePrice: boolean }, today = todayIST()): boolean {
  const age = priceAgeDays(it.lastPurchaseDate, today);
  if (age == null) return true;
  return age > (it.volatilePrice ? STALE_DAYS_VOLATILE : STALE_DAYS_DEFAULT);
}

/** Pipe/fitting sizes in the order of the client's Excel price list (300 NB → 25 NB). */
export const NB_SIZES = ["300NB", "250NB", "200NB", "150NB", "125NB", "100NB", "80NB", "65NB", "50NB", "40NB", "32NB", "25NB", "20NB", "15NB"] as const;
/** Normalise "150 NB", "150nb", "150 mm" → "150NB" (null if not a nominal-bore size). */
export function normaliseNB(size: string | null | undefined): string | null {
  if (!size) return null;
  const m = size.trim().toUpperCase().match(/^(\d{2,3})\s*(NB|MM)$/);
  return m ? `${m[1]}NB` : null;
}

export type PricePoint = {
  id: number; kind: string; rate: number; date: string; qty: number | null;
  vendorId: number | null; vendorName: string | null; customerId: number | null; refType: string | null; refId: number | null;
};

/** Purchase (or other kind) price history for an item, oldest first. */
export async function getPriceHistory(db: Executor, itemId: number, kinds: string[] = ["purchase"]): Promise<PricePoint[]> {
  const rows = await db
    .select({
      id: priceHistory.id, kind: priceHistory.kind, rate: priceHistory.rate, date: priceHistory.date, qty: priceHistory.qty,
      vendorId: priceHistory.vendorId, vendorName: vendors.name, customerId: priceHistory.customerId, refType: priceHistory.refType, refId: priceHistory.refId,
    })
    .from(priceHistory)
    .leftJoin(vendors, eq(vendors.id, priceHistory.vendorId))
    .where(and(eq(priceHistory.itemId, itemId), inArray(priceHistory.kind, kinds)))
    .orderBy(asc(priceHistory.date), asc(priceHistory.id));
  return rows.map((r) => ({ ...r, rate: Number(r.rate), qty: r.qty == null ? null : Number(r.qty) }));
}

export type YearSummary = { year: string; min: number; max: number; avg: number; last: number; count: number };
/** Year-wise min/avg/max/last of price points (input sorted oldest first). Newest year first. */
export function yearSummary(points: { rate: number; date: string }[]): YearSummary[] {
  const by = new Map<string, number[]>();
  for (const p of points) {
    const y = p.date.slice(0, 4);
    if (!by.has(y)) by.set(y, []);
    by.get(y)!.push(p.rate);
  }
  return [...by.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([year, rates]) => ({
    year, count: rates.length, min: Math.min(...rates), max: Math.max(...rates),
    avg: round2(rates.reduce((s, r) => s + r, 0) / rates.length), last: rates[rates.length - 1],
  }));
}

export type MonthChange = { month: string; avg: number; last: number; changePct: number | null };
/** Monthly average rate with % change vs the previous month that had data. Newest month first. */
export function monthOverMonth(points: { rate: number; date: string }[]): MonthChange[] {
  const by = new Map<string, number[]>();
  for (const p of points) {
    const m = p.date.slice(0, 7);
    if (!by.has(m)) by.set(m, []);
    by.get(m)!.push(p.rate);
  }
  const months = [...by.keys()].sort();
  const out: MonthChange[] = [];
  let prev: number | null = null;
  for (const m of months) {
    const rates = by.get(m)!;
    const avg = round2(rates.reduce((s, r) => s + r, 0) / rates.length);
    out.push({ month: m, avg, last: rates[rates.length - 1], changePct: prev ? round2(((avg - prev) / prev) * 100) : null });
    prev = avg;
  }
  return out.reverse();
}

export type VendorComparison = { vendorId: number | null; vendorName: string; lastRate: number; lastDate: string; count: number; avg: number; minRate: number };
/** Per-vendor comparison of purchase points (input sorted oldest first). Cheapest last rate first. */
export function vendorComparison(points: PricePoint[]): VendorComparison[] {
  const by = new Map<string, PricePoint[]>();
  for (const p of points) {
    const k = String(p.vendorId ?? "none");
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push(p);
  }
  return [...by.values()].map((ps) => {
    const last = ps[ps.length - 1];
    return {
      vendorId: last.vendorId, vendorName: last.vendorName ?? "Unknown vendor", lastRate: last.rate, lastDate: last.date, count: ps.length,
      avg: round2(ps.reduce((s, p) => s + p.rate, 0) / ps.length), minRate: Math.min(...ps.map((p) => p.rate)),
    };
  }).sort((a, b) => a.lastRate - b.lastRate);
}

/** Most recent purchase price point before the latest one, used to show price movement. */
export async function previousPurchaseRates(db: Executor, itemIds: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (!itemIds.length) return out;
  const rows = await db
    .select({ itemId: priceHistory.itemId, rate: priceHistory.rate })
    .from(priceHistory)
    .where(and(inArray(priceHistory.itemId, itemIds), eq(priceHistory.kind, "purchase")))
    .orderBy(asc(priceHistory.itemId), desc(priceHistory.date), desc(priceHistory.id));
  const seen = new Map<number, number>();
  for (const r of rows) {
    const n = (seen.get(r.itemId) ?? 0) + 1;
    seen.set(r.itemId, n);
    if (n === 2) out.set(r.itemId, Number(r.rate));
  }
  return out;
}
