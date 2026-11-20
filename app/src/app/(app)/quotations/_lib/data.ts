/** Server-side data helpers for quotations / BOQ templates / follow-ups. Maintainer: Sirah Digital. */
import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import type { DB } from "@/db";
import { items, quotationLines, quotations } from "@/db/schema";
import { computeQuoteTotals, suggestRates } from "@/lib/pricing";
import type { PickerItem } from "../_components/item-picker";

export type CatalogItem = PickerItem & {
  /** latest cost (rule 1); null when the viewer may not see cost */
  cost: number | null;
  /** item default markup % (only used when the viewer can see cost) */
  markupPct: number;
  /** suggested supply rate at the quotation markup (always present) */
  supply: number;
  erectionRate: number;
  /** last quoted / sold rate to show as reference */
  lastSaleRate: number | null;
};

/** Active items for pickers. Cost fields are stripped unless `withCost`. */
export async function loadCatalog(db: DB, opts: { withCost: boolean; markupPct: number }): Promise<CatalogItem[]> {
  const rows = await db.select().from(items).where(eq(items.active, true)).orderBy(asc(items.system), asc(items.groupName), asc(items.name));
  return rows.map((r) => {
    const s = suggestRates(r, opts.markupPct);
    return {
      id: r.id, code: r.code, name: r.name, size: r.size, make: r.make, uom: r.uom, groupName: r.groupName, system: r.system,
      cost: opts.withCost ? s.costRate : null,
      markupPct: Number(r.markupPct),
      supply: s.supplyRate,
      erectionRate: s.erectionRate,
      lastSaleRate: r.lastSaleRate,
    };
  });
}

/** Picker list without any pricing (BOQ templates). */
export async function loadPickerItems(db: DB): Promise<PickerItem[]> {
  const rows = await db
    .select({ id: items.id, code: items.code, name: items.name, size: items.size, make: items.make, uom: items.uom, groupName: items.groupName, system: items.system })
    .from(items).where(eq(items.active, true)).orderBy(asc(items.system), asc(items.groupName), asc(items.name));
  return rows;
}

/** Map of itemId → latest cost/erection for server-side pricing (never trust client cost). */
export async function itemPricing(db: DB, ids: number[]) {
  const uniq = [...new Set(ids)];
  if (!uniq.length) return new Map<number, typeof items.$inferSelect>();
  const rows = await db.select().from(items).where(inArray(items.id, uniq));
  return new Map(rows.map((r) => [r.id, r]));
}

/** Recomputes and stores header totals from the quotation's lines (rule 3). */
export async function recalcQuotation(db: DB, quotationId: number) {
  const [q] = await db.select().from(quotations).where(eq(quotations.id, quotationId));
  if (!q) return null;
  const ls = await db.select().from(quotationLines).where(eq(quotationLines.quotationId, quotationId));
  const t = computeQuoteTotals(ls, q.discountPct, q.gstPct);
  await db.update(quotations).set({
    subtotalSupply: t.supply, subtotalErection: t.erection, costTotal: t.cost, taxAmount: t.tax, grandTotal: t.grand,
  }).where(eq(quotations.id, quotationId));
  return t;
}

/** Re-pulls latest cost + suggested supply/erection rates for all item-linked lines of a quotation. */
export async function refreshLinePrices(db: DB, quotationId: number, markupPct: number) {
  const ls = await db.select().from(quotationLines).where(eq(quotationLines.quotationId, quotationId));
  const map = await itemPricing(db, ls.map((l) => l.itemId).filter((x): x is number => x != null));
  let changed = 0;
  for (const l of ls) {
    if (l.itemId == null) continue;
    const it = map.get(l.itemId);
    if (!it) continue;
    const s = suggestRates(it, markupPct);
    if (s.costRate !== l.costRate || s.supplyRate !== l.supplyRate || s.erectionRate !== l.erectionRate) {
      await db.update(quotationLines).set({ costRate: s.costRate, supplyRate: s.supplyRate, erectionRate: s.erectionRate }).where(eq(quotationLines.id, l.id));
      changed++;
    }
  }
  return changed;
}


