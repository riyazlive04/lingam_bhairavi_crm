"use client";
import { useMemo, useState } from "react";
import { Search, Trash2, TriangleAlert } from "lucide-react";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { addDays, fmtDate, money, qty as fmtQty, round2 } from "@/lib/format";

export type PFVendor = { id: number; name: string; paymentTermsDays: number };
export type PFProject = { id: number; code: string; name: string };
export type PFItem = {
  id: number; code: string; name: string; size: string | null; make: string | null; uom: string; gstRate: number;
  latestRate: number | null; latestDate: string | null; latestVendor: string | null;
};
export type PFLine = {
  itemId: number; description: string; qty: number; rate: number; gstRate: number;
  /** vendor PO line this bill line receives (rule 16) */
  poLineId?: number | null;
  /** e.g. "PO qty 100, received 40" (display only) */
  poInfo?: string;
};
export type PFInitial = {
  vendorId: number | null; invoiceNo: string; invoiceDate: string; dueDate: string; projectId: number | null; notes: string; lines: PFLine[];
};

const JUMP_PCT = 5;

export function PurchaseForm({ action, vendors, projects, items, vendorRates, initial, editing, po }: {
  action: (fd: FormData) => Promise<void>;
  vendors: PFVendor[];
  projects: PFProject[];
  items: PFItem[];
  /** vendorId → itemId → last rate/date from that vendor */
  vendorRates: Record<string, Record<string, { rate: number | null; date: string | null }>>;
  initial: PFInitial;
  editing?: boolean;
  /** bill raised against this vendor PO: vendor is fixed and lines keep their PO link */
  po?: { id: number; number: string } | null;
}) {
  const [vendorId, setVendorId] = useState<string>(initial.vendorId ? String(initial.vendorId) : "");
  const [invoiceDate, setInvoiceDate] = useState(initial.invoiceDate);
  const [dueDate, setDueDate] = useState(initial.dueDate);
  const [dueTouched, setDueTouched] = useState(editing ?? false);
  const [lines, setLines] = useState<PFLine[]>(initial.lines);
  const [search, setSearch] = useState("");

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const vendor = vendors.find((v) => String(v.id) === vendorId);

  const recomputeDue = (vid: string, date: string) => {
    const v = vendors.find((x) => String(x.id) === vid);
    if (!dueTouched && v && /^\d{4}-\d{2}-\d{2}$/.test(date)) setDueDate(addDays(date, v.paymentTermsDays));
  };

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    const words = q.split(/\s+/);
    return items.filter((i) => {
      const hay = `${i.code} ${i.name} ${i.size ?? ""} ${i.make ?? ""}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    }).slice(0, 15);
  }, [search, items]);

  const addItem = (it: PFItem) => {
    const vr = vendorRates[vendorId]?.[String(it.id)];
    const rate = vr?.rate ?? it.latestRate ?? 0;
    setLines((ls) => [...ls, { itemId: it.id, description: "", qty: 1, rate, gstRate: it.gstRate }]);
    setSearch("");
  };
  const update = (idx: number, patch: Partial<PFLine>) => setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const remove = (idx: number) => setLines((ls) => ls.filter((_, i) => i !== idx));

  const totals = useMemo(() => {
    let sub = 0, tax = 0;
    for (const l of lines) {
      if (!l.qty) continue;
      const amt = round2(l.qty * l.rate);
      sub += amt; tax += (amt * l.gstRate) / 100;
    }
    return { sub: round2(sub), tax: round2(tax), total: round2(sub + tax) };
  }, [lines]);

  const validLines = lines.filter((l) => l.qty > 0);
  const jumps = lines.filter((l) => {
    const it = itemById.get(l.itemId);
    return it?.latestRate && l.rate && Math.abs((l.rate - it.latestRate) / it.latestRate) * 100 >= JUMP_PCT;
  }).length;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="lines" value={JSON.stringify(validLines.map((l) => ({ itemId: l.itemId, description: l.description, qty: l.qty, rate: l.rate, gstRate: l.gstRate, poLineId: l.poLineId ?? null })))} />
      {po && <input type="hidden" name="purchaseOrderId" value={po.id} />}
      {po && (
        <div role="note" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
          Bill against purchase order <strong>{po.number}</strong>. Quantities are what is still to be received; change them to match the supplier&apos;s bill.
          Posting the bill updates the received quantity on the PO.
        </div>
      )}
      <Card title="Invoice">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Vendor" required className="lg:col-span-2">
            {po && <input type="hidden" name="vendorId" value={vendorId} />}
            <Select name={po ? undefined : "vendorId"} required value={vendorId} disabled={!!po} title={po ? "Fixed by the purchase order" : undefined}
              onChange={(e) => { setVendorId(e.target.value); recomputeDue(e.target.value, invoiceDate); }}>
              <option value="" disabled>Choose vendor…</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
          </Field>
          <Field label="Supplier invoice no." required>
            <Input name="invoiceNo" required maxLength={60} defaultValue={initial.invoiceNo} />
          </Field>
          <Field label="Invoice date" required>
            <Input name="invoiceDate" type="date" required value={invoiceDate} onChange={(e) => { setInvoiceDate(e.target.value); recomputeDue(vendorId, e.target.value); }} />
          </Field>
          <Field label="Due date" hint={vendor ? `Default: invoice date + ${vendor.paymentTermsDays} days (vendor terms)` : undefined}>
            <Input name="dueDate" type="date" value={dueDate} min={invoiceDate} onChange={(e) => { setDueDate(e.target.value); setDueTouched(true); }} />
          </Field>
          <Field label="Project (cost center)" hint="Leave empty to receive into stock. With a project, material is issued straight to site.">
            <Select name="projectId" defaultValue={initial.projectId ? String(initial.projectId) : ""}>
              <option value="">Into stock</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
            </Select>
          </Field>
          <Field label="Notes" className="sm:col-span-2 lg:col-span-3">
            <Textarea name="notes" defaultValue={initial.notes} className="min-h-12" />
          </Field>
        </div>
      </Card>

      <Card title={`Lines (${validLines.length})`}>
        <div className="relative mb-4">
          <label htmlFor="pf-item-search" className="mb-1 block text-sm font-medium text-ink">Add item</label>
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden />
            <Input id="pf-item-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Type code, name, size or make (e.g. pipe gi 150)…" className="pl-9"
              autoComplete="off" role="combobox" aria-expanded={matches.length > 0} aria-controls="pf-item-results"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (matches[0]) addItem(matches[0]); } }} />
          </div>
          {matches.length > 0 && (
            <ul id="pf-item-results" role="listbox" className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-lg border border-line bg-surface shadow-lg">
              {matches.map((it) => {
                const vr = vendorRates[vendorId]?.[String(it.id)];
                return (
                  <li key={it.id} role="option" aria-selected={false}>
                    <button type="button" onClick={() => addItem(it)} className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted">
                      <span className="min-w-0"><span className="block truncate text-ink">{it.name}</span>
                        <span className="block font-mono text-xs text-ink-faint">{it.code}{it.make ? ` · ${it.make}` : ""}</span></span>
                      <span className="shrink-0 text-right text-xs text-ink-soft">
                        {vr?.rate != null && <span className="block">This vendor {money(vr.rate)}</span>}
                        <span className="block">Latest {money(it.latestRate)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {search.trim().length >= 2 && matches.length === 0 && <p className="mt-1 text-xs text-ink-soft">No item matches “{search}”. Create it in the Item Master first.</p>}
        </div>

        {lines.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-ink-soft">No lines yet. Search above to add items from the item master.</p>
        ) : (
          <div className="space-y-3">
            {lines.map((l, idx) => {
              const it = itemById.get(l.itemId);
              if (!it) return null;
              const vr = vendorRates[vendorId]?.[String(it.id)];
              const vsLatest = it.latestRate ? ((l.rate - it.latestRate) / it.latestRate) * 100 : null;
              const vsVendor = vr?.rate ? ((l.rate - vr.rate) / vr.rate) * 100 : null;
              const jump = vsLatest != null && Math.abs(vsLatest) >= JUMP_PCT;
              return (
                <div key={idx} className={cx("rounded-lg border p-3", jump ? "border-amber-300 dark:border-amber-800" : "border-line", !l.qty && "opacity-60")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-ink">{it.name}</div>
                      <div className="font-mono text-xs text-ink-faint">{it.code} · {it.uom}{it.make ? ` · ${it.make}` : ""}</div>
                      {l.poLineId != null && <div className="mt-0.5 text-xs text-blue-700 dark:text-blue-300">PO line{l.poInfo ? `: ${l.poInfo}` : ""}</div>}
                    </div>
                    <button type="button" onClick={() => remove(idx)} className="rounded p-1 text-ink-soft hover:bg-muted hover:text-red-600" aria-label={`Remove ${it.code}`}><Trash2 size={16} aria-hidden /></button>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <label className="text-xs text-ink-soft">Qty ({it.uom})
                      <Input type="number" min={0} step="any" value={Number.isFinite(l.qty) ? l.qty : ""} onChange={(e) => update(idx, { qty: Number(e.target.value) })} className="mt-0.5" />
                    </label>
                    <label className="text-xs text-ink-soft">Rate (₹)
                      <Input type="number" min={0} step="0.01" value={Number.isFinite(l.rate) ? l.rate : ""} onChange={(e) => update(idx, { rate: Number(e.target.value) })} className="mt-0.5" />
                    </label>
                    <label className="text-xs text-ink-soft">GST %
                      <Input type="number" min={0} max={28} step="0.01" value={l.gstRate} onChange={(e) => update(idx, { gstRate: Number(e.target.value) })} className="mt-0.5" />
                    </label>
                    <label className="col-span-2 text-xs text-ink-soft">Description (optional)
                      <Input value={l.description} maxLength={500} onChange={(e) => update(idx, { description: e.target.value })} className="mt-0.5" />
                    </label>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-ink-soft">
                      <span>This vendor: {vr?.rate != null ? <>{money(vr.rate)} ({fmtDate(vr.date)}){vsVendor != null && Math.abs(vsVendor) >= 0.5 && <b className={vsVendor > 0 ? "text-red-600" : "text-emerald-600"}> {vsVendor > 0 ? "+" : ""}{vsVendor.toFixed(1)}%</b>}</> : "first purchase"}</span>
                      <span>Latest (any vendor): {it.latestRate != null ? <>{money(it.latestRate)}{it.latestVendor ? ` · ${it.latestVendor}` : ""}{it.latestDate ? ` (${fmtDate(it.latestDate)})` : " (list)"}</> : "-"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {jump && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300"><TriangleAlert size={12} aria-hidden /> {vsLatest! > 0 ? "+" : ""}{vsLatest!.toFixed(1)}% vs latest</span>}
                      <span className="font-medium tabular-nums text-ink">{money(round2(l.qty * l.rate))}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <dl className="mt-4 ml-auto grid max-w-xs grid-cols-2 gap-y-1 text-sm">
          <dt className="text-ink-soft">Subtotal</dt><dd className="text-right tabular-nums">{money(totals.sub)}</dd>
          <dt className="text-ink-soft">GST</dt><dd className="text-right tabular-nums">{money(totals.tax)}</dd>
          <dt className="font-semibold text-ink">Total</dt><dd className="text-right font-semibold tabular-nums">{money(totals.total)}</dd>
          <dt className="text-ink-soft">Lines / qty</dt><dd className="text-right text-ink-soft">{validLines.length} / {fmtQty(validLines.reduce((s, l) => s + l.qty, 0))}</dd>
        </dl>
        {jumps > 0 && <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">{jumps} line{jumps === 1 ? "" : "s"} differ ≥{JUMP_PCT}% from the current latest price. Please double-check before posting.</p>}
      </Card>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap gap-2 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <SubmitButton name="intent" value="draft" variant="secondary" disabled={!validLines.length || !vendorId}>Save as draft</SubmitButton>
        <SubmitButton name="intent" value="post" pendingText="Posting…" disabled={!validLines.length || !vendorId}
          confirm="Post this invoice? Posting updates latest prices, vendor rates and stock, and cannot be undone.">Save &amp; post</SubmitButton>
      </div>
    </form>
  );
}
