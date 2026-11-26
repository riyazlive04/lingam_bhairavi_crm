"use client";
import { useState } from "react";
import { cx, inputClass } from "@/components/ui";
import { money, qty as fmtQty, round2 } from "@/lib/format";

export type ReturnEditorLine = {
  /** order line id, purchase invoice line id, or "i<invoiceLineId>" for invoice lines without an order line */
  key: string;
  description: string;
  uom: string;
  /** max qty that can come back / go back */
  returnable: number;
  rate: number;
  gstRate: number;
  info: string;
  /** true when the line has an item master (only those can go back into stock) */
  stockable: boolean;
  qty: number;
  restock: boolean;
};

const GST_RATES = [0, 5, 12, 18, 28];

/**
 * Return / credit note line editor with live GST totals. Posts JSON in the hidden input "lines"
 * as [{ key, qty, rate, gstRate, restock }] for lines with qty above 0. The server re-checks every quantity.
 */
export function ReturnLineEditor({ initial, showRestock, totalLabel }: { initial: ReturnEditorLine[]; showRestock: boolean; totalLabel: string }) {
  const [lines, setLines] = useState(initial);
  const set = (idx: number, patch: Partial<ReturnEditorLine>) => setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const valid = lines.filter((l) => Number.isFinite(l.qty) && l.qty > 0);
  const subtotal = round2(valid.reduce((s, l) => s + round2(l.qty * (l.rate || 0)), 0));
  const tax = round2(valid.reduce((s, l) => s + (round2(l.qty * (l.rate || 0)) * l.gstRate) / 100, 0));
  const over = lines.some((l) => l.qty > l.returnable + 1e-6);

  if (!lines.length) {
    return <p className="rounded-lg border border-dashed border-line p-4 text-center text-sm text-ink-soft">Nothing on this document can be returned. Every delivered quantity has already come back.</p>;
  }

  return (
    <div>
      <input type="hidden" name="lines" value={JSON.stringify(valid.map((l) => ({
        key: l.key, qty: l.qty, rate: l.rate || 0, gstRate: l.gstRate, restock: showRestock && l.stockable ? l.restock : false,
      })))} />
      <ol className="space-y-3">
        {lines.map((l, idx) => {
          const amt = round2((l.qty || 0) * (l.rate || 0));
          const tooMuch = l.qty > l.returnable + 1e-6;
          const none = l.returnable <= 1e-6;
          return (
            <li key={l.key} className={cx("rounded-lg border border-line bg-muted/40 p-3", none && "opacity-60")}>
              <div className="grid gap-3 sm:grid-cols-12">
                <div className="min-w-0 sm:col-span-4">
                  <span className="block text-sm font-medium text-ink">{l.description}</span>
                  <span className="mt-0.5 block text-xs text-ink-soft">{l.info}</span>
                  <span className="mt-0.5 block text-xs font-medium text-ink-soft">{none ? "Nothing left to return" : `Can return up to ${fmtQty(l.returnable)} ${l.uom}`}</span>
                </div>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs font-medium text-ink-soft">Qty ({l.uom})</span>
                  <input className={inputClass} type="number" inputMode="decimal" step="any" min={0} max={l.returnable} disabled={none}
                    value={Number.isFinite(l.qty) ? l.qty : ""} aria-invalid={tooMuch || undefined}
                    onChange={(e) => set(idx, { qty: e.target.value === "" ? 0 : Number(e.target.value) })} />
                  {tooMuch && <span className="mt-1 block text-xs text-red-600" role="alert">Max {fmtQty(l.returnable)}</span>}
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs font-medium text-ink-soft">Rate (₹)</span>
                  <input className={inputClass} type="number" inputMode="decimal" step="any" min={0} disabled={none}
                    value={Number.isFinite(l.rate) ? l.rate : ""} onChange={(e) => set(idx, { rate: Number(e.target.value) })} />
                </label>
                <label className="block sm:col-span-1">
                  <span className="mb-1 block text-xs font-medium text-ink-soft">GST %</span>
                  <select className={inputClass} value={l.gstRate} disabled={none} onChange={(e) => set(idx, { gstRate: Number(e.target.value) })}>
                    {[...new Set([...GST_RATES, l.gstRate])].sort((a, b) => a - b).map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </label>
                {showRestock ? (
                  <label className="flex items-center gap-2 text-sm sm:col-span-2 sm:flex-col sm:items-start sm:gap-1">
                    <span className="text-xs font-medium text-ink-soft">Back to stock?</span>
                    <select className={inputClass} value={l.stockable && l.restock ? "yes" : "no"} disabled={none || !l.stockable}
                      onChange={(e) => set(idx, { restock: e.target.value === "yes" })} title={l.stockable ? undefined : "Not linked to an item, so it cannot go into stock"}>
                      <option value="yes">Yes, restock</option>
                      <option value="no">No (scrap or send to vendor)</option>
                    </select>
                  </label>
                ) : <div className="sm:col-span-2" />}
                <div className="flex items-end justify-end sm:col-span-1">
                  <span className="text-sm tabular-nums text-ink">{money(amt)}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex justify-end">
        <dl className="min-w-56 space-y-1 text-sm" aria-live="polite">
          <div className="flex justify-between gap-6"><dt className="text-ink-soft">Taxable value</dt><dd className="tabular-nums">{money(subtotal)}</dd></div>
          <div className="flex justify-between gap-6"><dt className="text-ink-soft">GST</dt><dd className="tabular-nums">{money(tax)}</dd></div>
          <div className="flex justify-between gap-6 border-t border-line pt-1 text-base font-semibold"><dt>{totalLabel}</dt><dd className="tabular-nums">{money(round2(subtotal + tax))}</dd></div>
        </dl>
      </div>
      {over && <p className="mt-2 text-sm text-red-600" role="alert">Some quantities are more than what can be returned.</p>}
      <p className="mt-2 text-xs text-ink-faint">Lines left at 0 are not included. Set the rate to 0 if you are replacing the goods free of charge and not giving credit.</p>
    </div>
  );
}
