"use client";
import { useId, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { LineItemsTable, li } from "@/components/patterns";
import { money, round2 } from "@/lib/format";

export type PickItem = { id: number; code: string; name: string; uom: string; rate: number };
export type EditorLine = { itemId: number | null; description: string; qty: number; uom: string; rate: number; expectedDate: string };

const label = (i: PickItem) => `${i.code} · ${i.name}`;
const blank = (expectedDate: string): EditorLine => ({ itemId: null, description: "", qty: 1, uom: "Nos", rate: 0, expectedDate });

/** Line editor for a new customer PO. Posts lines as JSON in hidden input "lines". */
export function OrderLineEditor({ items, initial, defaultExpected }: { items: PickItem[]; initial: EditorLine[]; defaultExpected: string }) {
  const listId = useId();
  const [lines, setLines] = useState<EditorLine[]>(initial.length ? initial : [blank(defaultExpected)]);
  const byLabel = useMemo(() => new Map(items.map((i) => [label(i), i])), [items]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const set = (idx: number, patch: Partial<EditorLine>) => setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const pickText = (idx: number, text: string) => {
    const it = byLabel.get(text);
    if (it) set(idx, { itemId: it.id, description: it.name, uom: it.uom, rate: it.rate || lines[idx].rate });
    else set(idx, { itemId: null, description: text });
  };

  const valid = lines.filter((l) => l.description.trim() && l.qty > 0);
  const total = round2(valid.reduce((s, l) => s + l.qty * l.rate, 0));

  return (
    <div className="space-y-3">
      <datalist id={listId}>
        {items.map((i) => <option key={i.id} value={label(i)} />)}
      </datalist>
      <input type="hidden" name="lines" value={JSON.stringify(valid)} />
      <LineItemsTable minWidth={880} caption="Order lines">
        <thead>
          <tr>
            <th className="w-8">#</th>
            <th>Item or description</th>
            <th className={li.num}>Qty</th>
            <th>UOM</th>
            <th className={li.num}>Rate (ex-GST)</th>
            <th>Expected</th>
            <th className={li.num}>Amount</th>
            <th><span className="sr-only">Remove</span></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, idx) => {
            const it = l.itemId ? byId.get(l.itemId) : undefined;
            return (
              <tr key={idx}>
                <td className="pt-2.5 text-caption text-ink-soft tabular-nums">{idx + 1}</td>
                <td className="min-w-72">
                  <input
                    className={li.input} list={listId} value={it ? label(it) : l.description}
                    onChange={(e) => pickText(idx, e.target.value)} placeholder="Type item code or name, or free text"
                    aria-label={`Line ${idx + 1} item`} aria-describedby={it ? undefined : `${listId}-free-${idx}`}
                  />
                  {!it && l.description && <span id={`${listId}-free-${idx}`} className="block px-2 text-caption text-ink-faint">Free-text line, not linked to the item master</span>}
                </td>
                <td className="w-24">
                  <input className={li.numInput} type="number" inputMode="decimal" min={0} step="any" value={Number.isFinite(l.qty) ? l.qty : ""}
                    onChange={(e) => set(idx, { qty: Number(e.target.value) })} aria-label={`Line ${idx + 1} quantity`} />
                </td>
                <td className="w-20">
                  <input className={li.input} value={l.uom} maxLength={20} onChange={(e) => set(idx, { uom: e.target.value })} aria-label={`Line ${idx + 1} unit`} />
                </td>
                <td className="w-32">
                  <input className={li.numInput} type="number" inputMode="decimal" min={0} step="any" value={Number.isFinite(l.rate) ? l.rate : ""}
                    onChange={(e) => set(idx, { rate: Number(e.target.value) })} aria-label={`Line ${idx + 1} rate`} />
                </td>
                <td className="w-40">
                  <input className={li.input} type="date" value={l.expectedDate} onChange={(e) => set(idx, { expectedDate: e.target.value })} aria-label={`Line ${idx + 1} expected date`} />
                </td>
                <td className={`${li.num} w-32 whitespace-nowrap pt-2.5 font-medium text-ink`}>{money(round2((l.qty || 0) * (l.rate || 0)))}</td>
                <td className="w-10">
                  <Button type="button" variant="ghost" size="sm" className="w-8 px-0" onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))}
                    aria-label={`Remove line ${idx + 1}`} title="Remove line" disabled={lines.length === 1}>
                    <Trash2 className="icon-sm" aria-hidden />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={6} className="text-ink-soft">{valid.length} line{valid.length === 1 ? "" : "s"} · Order value (ex-GST)</td>
            <td className={`${li.num} whitespace-nowrap text-ink`} aria-live="polite">{money(total)}</td>
            <td />
          </tr>
        </tfoot>
      </LineItemsTable>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="secondary" onClick={() => setLines((ls) => [...ls, blank(defaultExpected)])}>
          <Plus className="icon-sm" aria-hidden /> Add line
        </Button>
        <p className="text-caption text-ink-faint">Lines with zero quantity or no description are not saved.</p>
      </div>
    </div>
  );
}
