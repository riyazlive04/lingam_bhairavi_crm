/** Server-side loaders for the BOQ import: catalogue (with rule 10 cost snapshot) and quoting history. */
import "server-only";
import { asc, desc, eq, isNotNull } from "drizzle-orm";
import type { DB } from "@/db";
import { items, quotationLines, vendors } from "@/db/schema";
import { historyKey, KNOWN_MAKES, splitMakes, type MatchItem } from "@/lib/boq-import";
import { costSnapshot, suggestRates } from "@/lib/pricing";
import type { ImportCatalogItem } from "./types";

/** Active items with latest cost, date and supplier. Cost is stripped unless `withCost`. */
export async function loadImportCatalog(db: DB, opts: { withCost: boolean; markupPct: number }): Promise<ImportCatalogItem[]> {
  const rows = await db
    .select({ r: items, vendorName: vendors.name })
    .from(items)
    .leftJoin(vendors, eq(vendors.id, items.lastPurchaseVendorId))
    .where(eq(items.active, true))
    .orderBy(asc(items.system), asc(items.groupName), asc(items.name));
  return rows.map(({ r, vendorName }) => {
    const rates = suggestRates(r, opts.markupPct);
    const snap = costSnapshot(r);
    return {
      id: r.id, code: r.code, name: r.name, groupName: r.groupName, size: r.size, make: r.make, uom: r.uom, system: r.system,
      cost: opts.withCost ? rates.costRate : null,
      costDate: snap.costDate,
      costVendorName: snap.costVendorId != null ? vendorName ?? null : null,
      costSource: snap.costSource,
      supplyAtDefault: rates.supplyRate,
      erectionRate: rates.erectionRate,
      volatile: r.volatilePrice,
    };
  });
}

/** The fields the matcher needs, for all active items. */
export async function loadMatchItems(db: DB): Promise<MatchItem[]> {
  return db
    .select({ id: items.id, name: items.name, groupName: items.groupName, size: items.size, make: items.make, system: items.system })
    .from(items)
    .where(eq(items.active, true));
}

/** Makes worth looking for in descriptions: the known list plus every make in the catalogue. */
export function makeList(catalogue: readonly MatchItem[]): string[] {
  const set = new Map<string, string>();
  for (const m of KNOWN_MAKES) set.set(m.toLowerCase(), m);
  for (const it of catalogue) {
    for (const part of (it.make ?? "").split(/[/,]/)) {
      const clean = part.replace(/\bUL\b/g, "").trim();
      if (clean.length >= 3 && splitMakes(clean).length) set.set(clean.toLowerCase(), clean);
    }
  }
  return [...set.values()];
}

/**
 * "Quoted before" memory: description -> itemId from the most recent quotation lines that were linked to an item.
 * Newest wins. Limited to the latest 5,000 linked lines to keep the page fast.
 */
export async function loadQuoteHistory(db: DB): Promise<Map<string, number>> {
  const rows = await db
    .select({ description: quotationLines.description, itemId: quotationLines.itemId })
    .from(quotationLines)
    .where(isNotNull(quotationLines.itemId))
    .orderBy(desc(quotationLines.id))
    .limit(5000);
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.itemId == null) continue;
    const k = historyKey(r.description);
    if (k && !map.has(k)) map.set(k, r.itemId);
  }
  return map;
}
