"use client";
import { useId, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, inputClass } from "@/components/ui";
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
    <div>
      <datalist id={listId}>
        {items.map((i) => <option key={i.id} value={label(i)} />)}
      </datalist>
      <input type="hidden" name="lines" value={JSON.stringify(valid)} />
      <ol className="space-y-3">
        {lines.map((l, idx) => {
          const it = l.itemId ? byId.get(l.itemId) : undefined;
          return (
            <li key={idx} className="rounded-lg border border-line bg-muted/40 p-3">
              <div className="grid gap-3 sm:grid-cols-12">
                <label className="block sm:col-span-5">
                  <span className="mb-1 block text-xs font-medium text-ink-soft">Item / description #{idx + 1}</span>
                  <input
                    className={inputClass} list={listId} value={it ? label(it) : l.description}
                    onChange={(e) => pickText(idx, e.target.value)} placeholder="Type item code or name, or free text"
                    aria-describedby={it ? undefined : `${listId}-free-${idx}`}
                  />
                  {!it && l.description && <span id={`${listId}-free-${idx}`} className="mt-1 block text-xs text-ink-faint">Free-text line (not linked to item master)</span>}
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs font-medium text-ink-soft">Qty</span>
                  <input className={inputClass} type="number" inputMode="decimal" min={0} step="any" value={Number.isFinite(l.qty) ? l.qty : ""}
                    onChange={(e) => set(idx, { qty: Number(e.target.value) })} />
                </label>
                <label className="block sm:col-span-1">
                  <span className="mb-1 block text-xs font-medium text-ink-soft">UOM</span>
                  <input className={inputClass} value={l.uom} maxLength={20} onChange={(e) => set(idx, { uom: e.target.value })} />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs font-medium text-ink-soft">Rate (₹, ex-GST)</span>
                  <input className={inputClass} type="number" inputMode="decimal" min={0} step="any" value={Number.isFinite(l.rate) ? l.rate : ""}
                    onChange={(e) => set(idx, { rate: Number(e.target.value) })} />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1 block text-xs font-medium text-ink-soft">Expected</span>
                  <input className={inputClass} type="date" value={l.expectedDate} onChange={(e) => set(idx, { expectedDate: e.target.value })} />
                </label>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-ink-soft">Amount: <span className="font-medium text-ink tabular-nums">{money(round2((l.qty || 0) * (l.rate || 0)))}</span></span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setLines((ls) => ls.filter((_, i) => i !== idx))} aria-label={`Remove line ${idx + 1}`} disabled={lines.length === 1}>
                  <Trash2 className="h-4 w-4" aria-hidden /> Remove
                </Button>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="secondary" onClick={() => setLines((ls) => [...ls, blank(defaultExpected)])}>
          <Plus className="h-4 w-4" aria-hidden /> Add line
        </Button>
        <div className="text-sm text-ink-soft" aria-live="polite">
          {valid.length} line{valid.length === 1 ? "" : "s"} · Order value (ex-GST): <span className="text-base font-semibold text-ink tabular-nums">{money(total)}</span>
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-faint">Lines with zero quantity or no description are not saved.</p>
    </div>
  );
}
