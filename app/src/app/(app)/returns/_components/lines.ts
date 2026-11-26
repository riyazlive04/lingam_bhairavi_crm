import type { ReturnableLine, VendorReturnableLine } from "@/lib/returns";
import type { ReturnEditorLine } from "./return-line-editor";

/** Returnable customer lines to editor rows. `saved` pre-fills a draft being edited (key to values). */
export function toEditorLines(rows: ReturnableLine[], saved?: Map<string, { qty: number; rate: number; gstRate: number; restock: boolean }>): ReturnEditorLine[] {
  return rows.map((r) => {
    const s = saved?.get(r.key);
    return {
      key: r.key, description: r.description, uom: r.uom, returnable: r.returnable, rate: s?.rate ?? r.rate, gstRate: s?.gstRate ?? r.gstRate,
      info: r.info, stockable: r.itemId != null, qty: s?.qty ?? 0, restock: s ? s.restock : r.itemId != null,
    };
  });
}

/** Returnable vendor bill lines to editor rows (no restock choice: the goods leave stock). */
export function toVendorEditorLines(rows: VendorReturnableLine[], saved?: Map<string, { qty: number; rate: number; gstRate: number }>): ReturnEditorLine[] {
  return rows.map((r) => {
    const s = saved?.get(r.key);
    return {
      key: r.key, description: r.description, uom: r.uom, returnable: r.returnable, rate: s?.rate ?? r.rate, gstRate: s?.gstRate ?? r.gstRate,
      info: r.info, stockable: true, qty: s?.qty ?? 0, restock: false,
    };
  });
}
