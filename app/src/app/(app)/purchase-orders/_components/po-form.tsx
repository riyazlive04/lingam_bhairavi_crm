"use client";
/**
 * Vendor purchase order editor (rule 16). Same line-editor pattern as the purchase invoice form:
 * item search, qty, rate (default = this vendor's last rate, else the latest cost), GST.
 * Lines prefilled from a customer sales order keep their salesOrderLineId.
 */
import { useMemo, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { fmtDate, money, qty as fmtQty, round2 } from "@/lib/format";
import type { PFItem, PFProject } from "../../purchases/_components/purchase-form";

export type POFVendor = { id: number; name: string };
export type POFSalesOrder = { id: number; number: string; customerName: string; projectId: number | null; customerPoNumber: string | null };
export type POFLine = {
  key: string;
  itemId: number;
  description: string;
  qty: number;
  rate: number;
  gstRate: number;
  salesOrderLineId: number | null;
  /** e.g. "SO line: 120 ordered, 20 delivered" (display only) */
  soInfo?: string;
  /** rate typed by hand: not replaced when the vendor changes */
  rateTouched?: boolean;
};
export type POFInitial = {
  vendorId: number | null; poDate: string; expectedDate: string; salesOrderId: number | null; projectId: number | null;
  terms: string; notes: string; lines: POFLine[];
};

type VendorRates = Record<string, Record<string, { rate: number | null; date: string | null }>>;

let seq = 0;
const newKey = () => `p${Date.now().toString(36)}${(seq++).toString(36)}`;
const num = (v: string) => {
  const x = Number(v);
  return Number.isFinite(x) && x >= 0 ? x : 0;
};
/** this vendor's last rate, else the item's latest cost (mirrors defaultBuyRate in lib/purchase-orders) */
function buyRate(vendorRates: VendorRates, vendorId: string, it: PFItem | undefined): number {
  if (!it) return 0;
  const vr = vendorRates[vendorId]?.[String(it.id)]?.rate;
  if (vr != null && vr > 0) return round2(vr);
  return it.latestRate != null ? round2(it.latestRate) : 0;
}

export function PurchaseOrderForm({ action, id, vendors, projects, salesOrders, items, vendorRates, initial }: {
  action: (fd: FormData) => Promise<void>;
  id?: number;
  vendors: POFVendor[];
  projects: PFProject[];
  salesOrders: POFSalesOrder[];
  items: PFItem[];
  vendorRates: VendorRates;
  initial: POFInitial;
}) {
  const [vendorId, setVendorId] = useState(initial.vendorId ? String(initial.vendorId) : "");
  const [poDate, setPoDate] = useState(initial.poDate);
  const [salesOrderId, setSalesOrderId] = useState(initial.salesOrderId ? String(initial.salesOrderId) : "");
  const [projectId, setProjectId] = useState(initial.projectId ? String(initial.projectId) : "");
  const [lines, setLines] = useState<POFLine[]>(() =>
    initial.lines.map((l) => (l.rate > 0 || l.rateTouched ? l : { ...l, rate: buyRate(vendorRates, initial.vendorId ? String(initial.vendorId) : "", items.find((i) => i.id === l.itemId)) })));
  const [search, setSearch] = useState("");
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const soLinked = lines.some((l) => l.salesOrderLineId != null);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    const words = q.split(/\s+/);
    return items.filter((i) => {
      const hay = `${i.code} ${i.name} ${i.size ?? ""} ${i.make ?? ""}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    }).slice(0, 15);
  }, [search, items]);

  function changeVendor(v: string) {
    setVendorId(v);
    setLines((ls) => ls.map((l) => (l.rateTouched ? l : { ...l, rate: buyRate(vendorRates, v, itemById.get(l.itemId)) })));
  }
  function changeSo(v: string) {
    setSalesOrderId(v);
    const so = salesOrders.find((s) => String(s.id) === v);
    if (so?.projectId && !projectId) setProjectId(String(so.projectId));
  }
  const addItem = (it: PFItem) => {
    setLines((ls) => [...ls, { key: newKey(), itemId: it.id, description: "", qty: 1, rate: buyRate(vendorRates, vendorId, it), gstRate: it.gstRate, salesOrderLineId: null }]);
    setSearch("");
  };
  const update = (key: string, patch: Partial<POFLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key));

  const totals = useMemo(() => {
    let sub = 0, tax = 0;
    for (const l of lines) {
      if (!(l.qty > 0)) continue;
      const amt = round2(l.qty * l.rate);
      sub += amt; tax += (amt * l.gstRate) / 100;
    }
    return { sub: round2(sub), tax: round2(tax), total: round2(sub + tax) };
  }, [lines]);
  const valid = lines.filter((l) => l.qty > 0);
  const zeroRate = valid.filter((l) => !(l.rate > 0)).length;
  const payload = JSON.stringify(valid.map((l) => ({
    itemId: l.itemId, description: l.description, qty: l.qty, rate: l.rate, gstRate: l.gstRate, salesOrderLineId: l.salesOrderLineId,
  })));

  return (
    <form action={action} className="space-y-4">
      {id && <input type="hidden" name="id" value={id} />}
      <input type="hidden" name="lines" value={payload} />
      {soLinked && <input type="hidden" name="salesOrderId" value={salesOrderId} />}

      <Card title="Purchase order">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Vendor" required className="lg:col-span-2" hint="Rates default to this vendor's last price, else the latest cost">
            <Select name="vendorId" required value={vendorId} onChange={(e) => changeVendor(e.target.value)}>
              <option value="" disabled>Choose vendor…</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
          </Field>
          <Field label="PO date" required>
            <Input name="poDate" type="date" required value={poDate} onChange={(e) => setPoDate(e.target.value)} />
          </Field>
          <Field label="Expected delivery">
            <Input name="expectedDate" type="date" min={poDate} defaultValue={initial.expectedDate} />
          </Field>
          <Field label="For customer order" hint={soLinked ? "Fixed while lines from this order are on the PO" : "Optional: the customer PO this purchase is for"}>
            <Select name={soLinked ? undefined : "salesOrderId"} value={salesOrderId} disabled={soLinked} onChange={(e) => changeSo(e.target.value)}>
              <option value="">Not linked (for stock)</option>
              {salesOrders.map((s) => <option key={s.id} value={s.id}>{s.number} · {s.customerName}{s.customerPoNumber ? ` (PO ${s.customerPoNumber})` : ""}</option>)}
            </Select>
          </Field>
          <Field label="Project" hint="Optional: site this material is for">
            <Select name="projectId" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">No project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
            </Select>
          </Field>
        </div>
      </Card>

      <Card title={`Lines (${valid.length})`}>
        <div className="relative mb-4">
          <label htmlFor="po-item-search" className="mb-1 block text-sm font-medium text-ink">Add item</label>
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden />
            <Input id="po-item-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Type code, name, size or make (e.g. pipe gi 150)…" className="pl-9"
              autoComplete="off" role="combobox" aria-expanded={matches.length > 0} aria-controls="po-item-results"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (matches[0]) addItem(matches[0]); } }} />
          </div>
          {matches.length > 0 && (
            <ul id="po-item-results" role="listbox" className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-lg border border-line bg-surface shadow-lg">
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
          <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-ink-soft">No lines yet. Search above to add items, or start from a customer order with “Create vendor PO”.</p>
        ) : (
          <div className="space-y-3">
            {lines.map((l) => {
              const it = itemById.get(l.itemId);
              const vr = vendorRates[vendorId]?.[String(l.itemId)];
              return (
                <div key={l.key} className={cx("rounded-lg border border-line p-3", !(l.qty > 0) && "opacity-60")}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-ink">{it?.name ?? `Item #${l.itemId}`}</div>
                      {it && <div className="font-mono text-xs text-ink-faint">{it.code} · {it.uom}{it.make ? ` · ${it.make}` : ""}</div>}
                      {l.salesOrderLineId != null && <div className="mt-0.5 text-xs text-blue-700 dark:text-blue-300">Customer order line{l.soInfo ? `: ${l.soInfo}` : ""}</div>}
                    </div>
                    <button type="button" onClick={() => remove(l.key)} className="rounded p-1 text-ink-soft hover:bg-muted hover:text-red-600" aria-label={`Remove ${it?.code ?? "line"}`}><Trash2 size={16} aria-hidden /></button>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <label className="text-xs text-ink-soft">Qty{it ? ` (${it.uom})` : ""}
                      <Input type="number" min={0} step="any" inputMode="decimal" value={l.qty === 0 ? "" : l.qty} placeholder="0" onChange={(e) => update(l.key, { qty: num(e.target.value) })} className="mt-0.5" />
                    </label>
                    <label className="text-xs text-ink-soft">Rate (₹)
                      <Input type="number" min={0} step="0.01" inputMode="decimal" value={l.rate} onChange={(e) => update(l.key, { rate: num(e.target.value), rateTouched: true })} className="mt-0.5" />
                    </label>
                    <label className="text-xs text-ink-soft">GST %
                      <Input type="number" min={0} max={28} step="0.01" value={l.gstRate} onChange={(e) => update(l.key, { gstRate: Math.min(28, num(e.target.value)) })} className="mt-0.5" />
                    </label>
                    <label className="col-span-2 text-xs text-ink-soft">Description / spec (optional)
                      <Input value={l.description} maxLength={500} onChange={(e) => update(l.key, { description: e.target.value })} className="mt-0.5" />
                    </label>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-ink-soft">
                      <span>This vendor: {vr?.rate != null ? <>{money(vr.rate)} ({fmtDate(vr.date)})</> : "not bought before"}</span>
                      {it && <span>Latest (any vendor): {it.latestRate != null ? <>{money(it.latestRate)}{it.latestVendor ? ` · ${it.latestVendor}` : ""}{it.latestDate ? ` (${fmtDate(it.latestDate)})` : " (list)"}</> : "-"}</span>}
                    </div>
                    <span className="font-medium tabular-nums text-ink">{money(round2(l.qty * l.rate))}</span>
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
          <dt className="text-ink-soft">Lines / qty</dt><dd className="text-right text-ink-soft">{valid.length} / {fmtQty(valid.reduce((s, l) => s + l.qty, 0))}</dd>
        </dl>
        {zeroRate > 0 && <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">{zeroRate} line{zeroRate === 1 ? " has" : "s have"} no rate yet. Enter the agreed price before sending the PO.</p>}
      </Card>

      <Card title="Terms & notes">
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Terms printed on the PO" hint="One term per line">
            <Textarea name="terms" rows={6} maxLength={8000} defaultValue={initial.terms} />
          </Field>
          <Field label="Internal notes" hint="Not printed">
            <Textarea name="notes" rows={6} maxLength={4000} defaultValue={initial.notes} />
          </Field>
        </div>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap gap-2 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <SubmitButton name="intent" value="draft" variant="secondary" disabled={!valid.length || !vendorId}>Save as draft</SubmitButton>
        <SubmitButton name="intent" value="send" pendingText="Saving…" disabled={!valid.length || !vendorId}
          confirm="Save and mark this PO as sent to the vendor? Linked customer order lines will show as ordered.">Save &amp; mark sent</SubmitButton>
      </div>
    </form>
  );
}
