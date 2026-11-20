"use client";
import { useId, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, inputClass } from "@/components/ui";
import { money, qty as fmtQty, round2 } from "@/lib/format";

export type InvPickItem = { id: number; code: string; name: string; uom: string; rate: number; gstRate: number };
export type InvEditorLine = {
  orderLineId: number | null;
  itemId: number | null;
  description: string;
  uom: string;
  qty: number;
  rate: number;
  gstRate: number;
  /** order-linked lines: max invoiceable (ordered − invoiced) and info */
  maxQty?: number;
  info?: string;
};

const label = (i: InvPickItem) => `${i.code} · ${i.name}`;
const GST_RATES = [0, 5, 12, 18, 28];

/** Invoice line editor with live GST totals. Posts JSON in hidden input "lines". */
export function InvoiceLineEditor({ items, initial }: { items: InvPickItem[]; initial: InvEditorLine[] }) {
  const listId = useId();
  const [lines, setLines] = useState<InvEditorLine[]>(
    initial.length ? initial : [{ orderLineId: null, itemId: null, description: "", uom: "Nos", qty: 1, rate: 0, gstRate: 18 }],
  );
  const byLabel = useMemo(() => new Map(items.map((i) => [label(i), i])), [items]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const set = (idx: number, patch: Partial<InvEditorLine>) => setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const pickText = (idx: number, text: string) => {
    const it = byLabel.get(text);
    if (it) set(idx, { itemId: it.id, description: it.name, uom: it.uom, rate: it.rate || lines[idx].rate, gstRate: it.gstRate });
    else set(idx, { itemId: null, description: text });
  };

  const valid = lines.filter((l) => l.description.trim() && l.qty > 0);
  const subtotal = round2(valid.reduce((s, l) => s + round2(l.qty * l.rate), 0));
  const tax = round2(valid.reduce((s, l) => s + (round2(l.qty * l.rate) * l.gstRate) / 100, 0));
  const over = lines.some((l) => l.maxQty != null && l.qty > l.maxQty + 1e-6);

  return (
    <div>
      <datalist id={listId}>{items.map((i) => <option key={i.id} value={label(i)} />)}</datalist>
      <input type="hidden" name="lines" value={JSON.stringify(valid.map((l) => ({
        orderLineId: l.orderLineId, itemId: l.itemId, description: l.description.trim(), qty: l.qty, rate: l.rate, gstRate: l.gstRate,
      })))} />
      <ol className="space-y-3">
        {lines.map((l, idx) => {
          const it = l.itemId ? byId.get(l.itemId) : undefined;
          const amt = round2((l.qty || 0) * (l.rate || 0));
          const tooMuch = l.maxQty != null && l.qty > l.maxQty + 1e-6;
          return (
            <li key={idx} className="rounded-lg border border-line bg-muted/40 p-3">
              <div className="grid gap-3 sm:grid-cols-12">
                <label className="block sm:col-span-5">
                  <span className="mb-1 block text-xs font-medium text-ink-soft">Description #{idx + 1}</span>
                  {l.orderLineId ? (
                    <input className={inputClass} value={l.description} maxLength={2000} onChange={(e) => set(idx, { description: e.target.value })} />
                  ) : (
                    <input className={inputClass} list={listId} value={it ? label(it) : l.description} onChange={(e) => pickText(idx, e.target.value)} placeholder="Item code / name or free text (e.g. Transport)" />
                  )}
                  {l.info && <span className="mt-1 block text-xs text-ink-soft">{l.info}</span>}
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs font-medium text-ink-soft">Qty ({l.uom})</span>
                  <input className={inputClass} type="number" inputMode="decimal" step="any" min={0} max={l.maxQty} value={Number.isFinite(l.qty) ? l.qty : ""}
                    aria-invalid={tooMuch || undefined} onChange={(e) => set(idx, { qty: Number(e.target.value) })} />
                  {tooMuch && <span className="mt-1 block text-xs text-red-600" role="alert">Max {fmtQty(l.maxQty)}</span>}
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs font-medium text-ink-soft">Rate (₹)</span>
                  <input className={inputClass} type="number" inputMode="decimal" step="any" min={0} value={Number.isFinite(l.rate) ? l.rate : ""}
                    onChange={(e) => set(idx, { rate: Number(e.target.value) })} />
                </label>
                <label className="block sm:col-span-1">
                  <span className="mb-1 block text-xs font-medium text-ink-soft">GST %</span>
                  <select className={inputClass} value={l.gstRate} onChange={(e) => set(idx, { gstRate: Number(e.target.value) })}>
                    {[...new Set([...GST_RATES, l.gstRate])].sort((a, b) => a - b).map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </label>
                <div className="flex items-end justify-between gap-2 sm:col-span-2 sm:flex-col sm:items-end">
                  <span className="text-sm tabular-nums text-ink">{money(amt)}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))} aria-label={`Remove line ${idx + 1}`}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {lines.length === 0 && <p className="rounded-lg border border-dashed border-line p-4 text-center text-sm text-ink-soft">No lines. Add a line to invoice.</p>}
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <Button type="button" variant="secondary" onClick={() => setLines((ls) => [...ls, { orderLineId: null, itemId: null, description: "", uom: "Nos", qty: 1, rate: 0, gstRate: 18 }])}>
          <Plus className="h-4 w-4" aria-hidden /> Add line
        </Button>
        <dl className="min-w-56 space-y-1 text-sm" aria-live="polite">
          <div className="flex justify-between gap-6"><dt className="text-ink-soft">Taxable value</dt><dd className="tabular-nums">{money(subtotal)}</dd></div>
          <div className="flex justify-between gap-6"><dt className="text-ink-soft">GST</dt><dd className="tabular-nums">{money(tax)}</dd></div>
          <div className="flex justify-between gap-6 border-t border-line pt-1 text-base font-semibold"><dt>Invoice total</dt><dd className="tabular-nums">{money(round2(subtotal + tax))}</dd></div>
        </dl>
      </div>
      {over && <p className="mt-2 text-sm text-red-600" role="alert">Some quantities exceed what is left to invoice on the order.</p>}
      <p className="mt-2 text-xs text-ink-faint">Lines with zero quantity are not invoiced.</p>
    </div>
  );
}
