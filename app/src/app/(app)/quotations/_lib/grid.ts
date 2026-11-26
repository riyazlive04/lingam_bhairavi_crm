/** Builds BOQ grid lines (server side) from template lines and saved quotation lines. */
import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { DB } from "@/db";
import { boqTemplateLines, extinguisherAssets, items, quotationLines } from "@/db/schema";
import { round2 } from "@/lib/format";
import { costSnapshot, parseCostSource, suggestRates } from "@/lib/pricing";
import { itemPricing, vendorNames } from "./data";
import type { GridLine } from "../_components/quote-editor";

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

type ItemRow = typeof items.$inferSelect;
const NO_COST = { costDate: null, costVendorName: null, costSource: null, volatile: false } as const;

/** Rule 10 cost-source fields of a grid line built from an item right now. */
function snapFields(it: ItemRow | undefined, names: Map<number, string>): Pick<GridLine, "costDate" | "costVendorName" | "costSource" | "volatile"> {
  if (!it) return { ...NO_COST };
  const s = costSnapshot(it);
  return { costDate: s.costDate, costVendorName: s.costVendorId != null ? names.get(s.costVendorId) ?? null : null, costSource: s.costSource, volatile: it.volatilePrice };
}
const vendorIdsOf = (m: Map<number, ItemRow>) => [...m.values()].map((i) => i.lastPurchaseVendorId);

/** Template lines → grid lines priced at `markupPct` (rule 2), qty = template default qty. */
export async function templateGridLines(db: DB, templateId: number, markupPct: number, showCost: boolean): Promise<GridLine[]> {
  const tl = await db.select().from(boqTemplateLines).where(eq(boqTemplateLines.templateId, templateId))
    .orderBy(asc(boqTemplateLines.sortOrder), asc(boqTemplateLines.id));
  const map = await itemPricing(db, tl.map((l) => l.itemId).filter((x): x is number => x != null));
  const names = await vendorNames(db, vendorIdsOf(map));
  return tl.map((l) => {
    const it = l.itemId != null ? map.get(l.itemId) : undefined;
    const r = it ? suggestRates(it, markupPct) : { costRate: 0, supplyRate: 0, erectionRate: 0 };
    return {
      key: `t${l.id}`, lineId: null, section: l.section ?? "", boqRef: l.boqRef ?? "", itemId: it ? l.itemId : null,
      description: l.description, uom: l.uom, qty: Number(l.defaultQty) || 0,
      costRate: showCost ? r.costRate : null, supplyRate: r.supplyRate, erectionRate: r.erectionRate, remarks: "", manual: !it,
      ...(it ? snapFields(it, names) : { ...NO_COST, costSource: "manual" as const }),
    };
  });
}

/**
 * Refill quotation from the Refill Tracker: selected extinguisher assets of one customer → one line per
 * (type, make), priced from the matching "Refilling <type> <size>, <make>" item in the master (rule 2).
 */
export async function refillGridLines(db: DB, customerId: number, assetIds: number[], markupPct: number, showCost: boolean): Promise<GridLine[]> {
  if (!assetIds.length) return [];
  const assets = await db.select().from(extinguisherAssets)
    .where(and(eq(extinguisherAssets.customerId, customerId), inArray(extinguisherAssets.id, assetIds.slice(0, 500))));
  if (!assets.length) return [];
  const refillItems = await db.select({ id: items.id, name: items.name, size: items.size, make: items.make, groupName: items.groupName, uom: items.uom })
    .from(items).where(and(eq(items.system, "extinguisher_refill"), eq(items.active, true)));
  const groups = new Map<string, { extType: string; make: string; qty: number; locations: Set<string> }>();
  for (const a of assets) {
    const k = `${norm(a.extType)}|${norm(a.make)}`;
    const g = groups.get(k) ?? { extType: a.extType, make: a.make ?? "", qty: 0, locations: new Set<string>() };
    g.qty += a.qty;
    if (a.location) g.locations.add(a.location);
    groups.set(k, g);
  }
  const match = (extType: string, make: string) => {
    // "ABC 6 Kg" → kind "abc", size "6 kg"; "Clean Agent 2 Kg" → "clean agent", "2 kg"
    const m = extType.match(/^(.*?)\s*([\d.]+\s*(kg|l))$/i);
    const kind = norm(m ? m[1] : extType), size = norm(m ? m[2] : "").replace(/\s+/g, " ");
    const cands = refillItems.filter((i) => norm(i.groupName).startsWith(kind) && norm(i.size).replace(/\s+/g, " ") === size);
    return cands.find((i) => norm(i.make) === norm(make)) ?? cands[0];
  };
  const priced = await itemPricing(db, refillItems.map((i) => i.id));
  const names = await vendorNames(db, vendorIdsOf(priced));
  return [...groups.values()].map((g, idx) => {
    const it = match(g.extType, g.make);
    const p = it ? priced.get(it.id) : undefined;
    const r = p ? suggestRates(p, markupPct) : { costRate: 0, supplyRate: 0, erectionRate: 0 };
    const where = g.locations.size ? ` (${[...g.locations].slice(0, 4).join(", ")}${g.locations.size > 4 ? "…" : ""})` : "";
    return {
      key: `rf${idx}`, lineId: null, section: "Extinguisher Refilling", boqRef: String(idx + 1), itemId: it && p ? it.id : null,
      description: `Refilling of ${g.extType} fire extinguisher${g.make ? `, ${g.make}` : ""}${where}`, uom: it?.uom ?? "Nos", qty: g.qty,
      costRate: showCost ? r.costRate : null, supplyRate: r.supplyRate, erectionRate: r.erectionRate, remarks: "", manual: !(it && p),
      ...(p ? snapFields(p, names) : { ...NO_COST, costSource: "manual" as const }),
    };
  });
}

/**
 * Saved quotation lines → grid lines; when the quotation came from a template, the template lines that were
 * left at qty 0 are merged back in (in template order) so they can still be quantified while editing.
 */
export async function quotationGridLines(db: DB, q: { id: number; templateId: number | null; markupPct: number }, showCost: boolean): Promise<GridLine[]> {
  const saved = await db.select().from(quotationLines).where(eq(quotationLines.quotationId, q.id)).orderBy(asc(quotationLines.sortOrder), asc(quotationLines.id));
  const [names, savedItems] = await Promise.all([
    vendorNames(db, saved.map((l) => l.costVendorId)),
    itemPricing(db, saved.map((l) => l.itemId).filter((x): x is number => x != null)),
  ]);
  const savedLines: GridLine[] = saved.map((l) => ({
    key: `q${l.id}`, lineId: l.id, section: l.section ?? "", boqRef: l.boqRef ?? "", itemId: l.itemId, description: l.description,
    uom: l.uom, qty: l.qty, costRate: showCost ? l.costRate : null, supplyRate: l.supplyRate, erectionRate: l.erectionRate,
    remarks: l.remarks ?? "",
    manual: l.itemId == null || Math.abs(l.supplyRate - round2(l.costRate * (1 + q.markupPct / 100))) > 0.01,
    costDate: l.costDate ?? null,
    costVendorName: l.costVendorId != null ? names.get(l.costVendorId) ?? null : null,
    costSource: parseCostSource(l.costSource) ?? (l.itemId == null ? "manual" : null),
    volatile: l.itemId != null ? savedItems.get(l.itemId)?.volatilePrice ?? false : false,
  }));
  if (!q.templateId) return savedLines;
  const tmpl = await templateGridLines(db, q.templateId, q.markupPct, showCost);
  const used = new Set(saved.map((l) => `${norm(l.boqRef)}|${norm(l.description)}`));
  const unused = tmpl.filter((t) => !used.has(`${norm(t.boqRef)}|${norm(t.description)}`)).map((t) => ({ ...t, qty: 0 }));
  if (!unused.length) return savedLines;
  // Interleave: keep saved order, insert each unused template line right after the last line of its section.
  const out = [...savedLines];
  for (const u of unused) {
    let idx = -1;
    for (let i = out.length - 1; i >= 0; i--) if (out[i].section === u.section) { idx = i; break; }
    if (idx === -1) out.push(u);
    else out.splice(idx + 1, 0, u);
  }
  return out;
}
