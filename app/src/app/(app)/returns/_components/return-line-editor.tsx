"use client";
import { useState } from "react";
import { cx } from "@/components/ui";
import { Callout, LineItemsTable, MoneySummary, li } from "@/components/patterns";
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
    return <p className="rounded-xl border border-dashed border-line-strong p-4 text-center text-sm text-ink-soft">Nothing on this document can be returned. Every delivered quantity has already come back.</p>;
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name="lines" value={JSON.stringify(valid.map((l) => ({
        key: l.key, qty: l.qty, rate: l.rate || 0, gstRate: l.gstRate, restock: showRestock && l.stockable ? l.restock : false,
      })))} />
      <LineItemsTable minWidth={showRestock ? 900 : 760} caption="Return lines">
        <thead>
          <tr>
            <th className="w-8">#</th>
            <th>Item</th>
            <th className={li.num}>Qty</th>
            <th className={li.num}>Rate</th>
            <th className={li.num}>GST %</th>
            {showRestock && <th>Back to stock</th>}
            <th className={li.num}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, idx) => {
            const amt = round2((l.qty || 0) * (l.rate || 0));
            const tooMuch = l.qty > l.returnable + 1e-6;
            const none = l.returnable <= 1e-6;
            const errId = `ret-err-${idx}`;
            return (
              <tr key={l.key} className={cx(none && "opacity-60")}>
                <td className="pt-2.5 text-caption text-ink-soft tabular-nums">{idx + 1}</td>
                <td className="min-w-64 max-w-md whitespace-normal py-2">
                  <span className="block text-sm font-medium text-ink">{l.description}</span>
                  <span className="block text-caption text-ink-soft">{l.info}</span>
                  <span className="block text-caption font-medium text-ink-soft">{none ? "Nothing left to return" : `Can return up to ${fmtQty(l.returnable)} ${l.uom}`}</span>
                </td>
                <td className="w-28">
                  <div className="flex items-center gap-1">
                    <input className={cx(li.numInput, tooMuch && "border-danger")} type="number" inputMode="decimal" step="any" min={0} max={l.returnable} disabled={none}
                      value={Number.isFinite(l.qty) ? l.qty : ""} aria-invalid={tooMuch || undefined} aria-describedby={tooMuch ? errId : undefined}
                      aria-label={`Line ${idx + 1} quantity in ${l.uom}`}
                      onChange={(e) => set(idx, { qty: e.target.value === "" ? 0 : Number(e.target.value) })} />
                    <span className="text-caption text-ink-soft">{l.uom}</span>
                  </div>
                  {tooMuch && <span id={errId} className="block px-2 text-caption text-danger" role="alert">Max {fmtQty(l.returnable)}</span>}
                </td>
                <td className="w-32">
                  <input className={li.numInput} type="number" inputMode="decimal" step="any" min={0} disabled={none} aria-label={`Line ${idx + 1} rate`}
                    value={Number.isFinite(l.rate) ? l.rate : ""} onChange={(e) => set(idx, { rate: Number(e.target.value) })} />
                </td>
                <td className="w-20">
                  <select className={li.numInput} value={l.gstRate} disabled={none} aria-label={`Line ${idx + 1} GST rate`} onChange={(e) => set(idx, { gstRate: Number(e.target.value) })}>
                    {[...new Set([...GST_RATES, l.gstRate])].sort((a, b) => a - b).map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </td>
                {showRestock && (
                  <td className="w-52">
                    <select className={li.input} value={l.stockable && l.restock ? "yes" : "no"} disabled={none || !l.stockable} aria-label={`Line ${idx + 1} back to stock`}
                      onChange={(e) => set(idx, { restock: e.target.value === "yes" })} title={l.stockable ? undefined : "Not linked to an item, so it cannot go into stock"}>
                      <option value="yes">Yes, restock</option>
                      <option value="no">No (scrap or send to vendor)</option>
                    </select>
                  </td>
                )}
                <td className={cx(li.num, "w-32 whitespace-nowrap pt-2.5 text-ink")}>{money(amt)}</td>
              </tr>
            );
          })}
        </tbody>
      </LineItemsTable>
      {over && <Callout tone="danger" title="Some quantities are too high">They are more than what can be returned. Lower them to the limit shown under each item.</Callout>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-md text-caption text-ink-faint">Lines left at 0 are not included. Set the rate to 0 if you are replacing the goods free of charge and not giving credit.</p>
        <div className="sm:w-72" aria-live="polite">
          <MoneySummary taxable={subtotal} tax={tax} total={round2(subtotal + tax)} totalLabel={totalLabel} />
        </div>
      </div>
    </div>
  );
}
