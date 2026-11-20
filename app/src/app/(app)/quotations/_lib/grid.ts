/** Builds BOQ grid lines (server side) from template lines and saved quotation lines. */
import "server-only";
import { asc, eq } from "drizzle-orm";
import type { DB } from "@/db";
import { boqTemplateLines, quotationLines } from "@/db/schema";
import { round2 } from "@/lib/format";
import { suggestRates } from "@/lib/pricing";
import { itemPricing } from "./data";
import type { GridLine } from "../_components/quote-editor";

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** Template lines → grid lines priced at `markupPct` (rule 2), qty = template default qty. */
export async function templateGridLines(db: DB, templateId: number, markupPct: number, showCost: boolean): Promise<GridLine[]> {
  const tl = await db.select().from(boqTemplateLines).where(eq(boqTemplateLines.templateId, templateId))
    .orderBy(asc(boqTemplateLines.sortOrder), asc(boqTemplateLines.id));
  const map = await itemPricing(db, tl.map((l) => l.itemId).filter((x): x is number => x != null));
  return tl.map((l) => {
    const it = l.itemId != null ? map.get(l.itemId) : undefined;
    const r = it ? suggestRates(it, markupPct) : { costRate: 0, supplyRate: 0, erectionRate: 0 };
    return {
      key: `t${l.id}`, lineId: null, section: l.section ?? "", boqRef: l.boqRef ?? "", itemId: it ? l.itemId : null,
      description: l.description, uom: l.uom, qty: Number(l.defaultQty) || 0,
      costRate: showCost ? r.costRate : null, supplyRate: r.supplyRate, erectionRate: r.erectionRate, remarks: "", manual: !it,
    };
  });
}

/**
 * Saved quotation lines → grid lines; when the quotation came from a template, the template lines that were
 * left at qty 0 are merged back in (in template order) so they can still be quantified while editing.
 */
export async function quotationGridLines(db: DB, q: { id: number; templateId: number | null; markupPct: number }, showCost: boolean): Promise<GridLine[]> {
  const saved = await db.select().from(quotationLines).where(eq(quotationLines.quotationId, q.id)).orderBy(asc(quotationLines.sortOrder), asc(quotationLines.id));
  const savedLines: GridLine[] = saved.map((l) => ({
    key: `q${l.id}`, lineId: l.id, section: l.section ?? "", boqRef: l.boqRef ?? "", itemId: l.itemId, description: l.description,
    uom: l.uom, qty: l.qty, costRate: showCost ? l.costRate : null, supplyRate: l.supplyRate, erectionRate: l.erectionRate,
    remarks: l.remarks ?? "",
    manual: l.itemId == null || Math.abs(l.supplyRate - round2(l.costRate * (1 + q.markupPct / 100))) > 0.01,
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
