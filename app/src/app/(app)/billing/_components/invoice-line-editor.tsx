"use client";
import { useId, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { LineItemsTable, MoneySummary, li } from "@/components/patterns";
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
  /** order-linked lines: max invoiceable (ordered minus invoiced) and info */
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
    <div className="space-y-3">
      <datalist id={listId}>{items.map((i) => <option key={i.id} value={label(i)} />)}</datalist>
      <input type="hidden" name="lines" value={JSON.stringify(valid.map((l) => ({
        orderLineId: l.orderLineId, itemId: l.itemId, description: l.description.trim(), qty: l.qty, rate: l.rate, gstRate: l.gstRate,
      })))} />
      <LineItemsTable minWidth={820} caption="Invoice lines">
        <thead>
          <tr>
            <th className="w-10">#</th>
            <th>Description</th>
            <th className={cx(li.num, "w-28")}>Qty</th>
            <th className={cx(li.num, "w-32")}>Rate (₹)</th>
            <th className={cx(li.num, "w-24")}>GST %</th>
            <th className={cx(li.num, "w-32")}>Amount</th>
            <th className="w-12"><span className="sr-only">Remove</span></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, idx) => {
            const it = l.itemId ? byId.get(l.itemId) : undefined;
            const amt = round2((l.qty || 0) * (l.rate || 0));
            const tooMuch = l.maxQty != null && l.qty > l.maxQty + 1e-6;
            return (
              <tr key={idx}>
                <td className="pt-2.5 text-ink-soft">{idx + 1}</td>
                <td>
                  {l.orderLineId ? (
                    <input className={li.input} value={l.description} maxLength={2000} aria-label={`Description, line ${idx + 1}`}
                      onChange={(e) => set(idx, { description: e.target.value })} />
                  ) : (
                    <input className={li.input} list={listId} value={it ? label(it) : l.description} aria-label={`Item or description, line ${idx + 1}`}
                      onChange={(e) => pickText(idx, e.target.value)} placeholder="Item code or name, or free text such as Transport" />
                  )}
                  {l.info && <span className="mt-0.5 block px-2 text-caption text-ink-soft">{l.info}</span>}
                </td>
                <td>
                  <input className={li.numInput} type="number" inputMode="decimal" step="any" min={0} max={l.maxQty} value={Number.isFinite(l.qty) ? l.qty : ""}
                    aria-label={`Quantity in ${l.uom}, line ${idx + 1}`} aria-invalid={tooMuch || undefined} onChange={(e) => set(idx, { qty: Number(e.target.value) })} />
                  <span className={cx("mt-0.5 block px-2 text-right text-caption", tooMuch ? "text-danger" : "text-ink-faint")} role={tooMuch ? "alert" : undefined}>
                    {tooMuch ? `Max ${fmtQty(l.maxQty)}` : l.uom}
                  </span>
                </td>
                <td>
                  <input className={li.numInput} type="number" inputMode="decimal" step="any" min={0} value={Number.isFinite(l.rate) ? l.rate : ""}
                    aria-label={`Rate, line ${idx + 1}`} onChange={(e) => set(idx, { rate: Number(e.target.value) })} />
                </td>
                <td>
                  <select className={li.numInput} value={l.gstRate} aria-label={`GST rate, line ${idx + 1}`} onChange={(e) => set(idx, { gstRate: Number(e.target.value) })}>
                    {[...new Set([...GST_RATES, l.gstRate])].sort((a, b) => a - b).map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </td>
                <td className={cx(li.num, "pt-2.5")}>{money(amt)}</td>
                <td>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))} aria-label={`Remove line ${idx + 1}`}>
                    <Trash2 className="icon-sm" aria-hidden />
                  </Button>
                </td>
              </tr>
            );
          })}
          {lines.length === 0 && (
            <tr><td colSpan={7} className="py-6 text-center text-ink-soft">No lines yet. Add a line to invoice.</td></tr>
          )}
        </tbody>
      </LineItemsTable>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <Button type="button" variant="secondary" onClick={() => setLines((ls) => [...ls, { orderLineId: null, itemId: null, description: "", uom: "Nos", qty: 1, rate: 0, gstRate: 18 }])}>
          <Plus className="icon-sm" aria-hidden /> Add line
        </Button>
        <div className="sm:w-72" aria-live="polite">
          <MoneySummary taxable={subtotal} tax={tax} total={round2(subtotal + tax)} totalLabel="Invoice total" note="Lines with zero quantity are not invoiced." />
        </div>
      </div>
      {over && <p className="text-sm text-danger" role="alert">Some quantities are more than what is left to invoice on the order.</p>}
    </div>
  );
}
