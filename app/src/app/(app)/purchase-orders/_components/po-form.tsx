"use client";
/**
 * Vendor purchase order editor (rule 16). Same line-editor pattern as the purchase invoice form:
 * item search, qty, rate (default = this vendor's last rate, else the latest cost), GST.
 * Lines prefilled from a customer sales order keep their salesOrderLineId.
 */
import { useMemo, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { SubmitButton } from "@/components/submit-button";
import { Field, Input, Select, Textarea, cx } from "@/components/ui";
import { Callout, FormFooter, FormSection, LineItemsTable, MoneySummary, li } from "@/components/patterns";
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

      <FormSection title="Vendor and dates" description="Who you are buying from and when the material is due." columns={3}>
        <Field label="Vendor" required className="sm:col-span-2" hint="Rates default to this vendor's last price, else the latest cost">
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
      </FormSection>

      <FormSection title={`Lines (${valid.length})`} description="Search the item master to add a line. Lines with no quantity are left off the PO." columns={1}>
        <div className="relative">
          <label htmlFor="po-item-search" className="mb-1 block text-sm font-medium text-ink">Add item</label>
          <div className="relative">
            <Search className="icon-sm pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden />
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
                        <span className="block font-mono text-caption text-ink-faint">{it.code}{it.make ? ` · ${it.make}` : ""}</span></span>
                      <span className="shrink-0 text-right text-caption text-ink-soft">
                        {vr?.rate != null && <span className="block">This vendor {money(vr.rate)}</span>}
                        <span className="block">Latest {money(it.latestRate)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {search.trim().length >= 2 && matches.length === 0 && <p className="mt-1 text-caption text-ink-soft">No item matches “{search}”. Create it in the item master first.</p>}
        </div>

        {lines.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-ink-soft">No lines yet. Search above to add items, or start from a customer order with Create vendor PO.</p>
        ) : (
          <LineItemsTable minWidth={960} caption="Purchase order lines">
            <thead>
              <tr>
                <th>#</th><th>Item</th><th>Description or spec</th><th className={li.num}>Qty</th><th className={li.num}>Rate (₹)</th><th className={li.num}>GST %</th><th className={li.num}>Amount</th>
                <th><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const it = itemById.get(l.itemId);
                const vr = vendorRates[vendorId]?.[String(l.itemId)];
                return (
                  <tr key={l.key} className={cx(!(l.qty > 0) && "opacity-60")}>
                    <td className="pt-2.5 text-ink-soft">{i + 1}</td>
                    <td className="min-w-64 max-w-80">
                      <div className="font-medium text-ink">{it?.name ?? `Item #${l.itemId}`}</div>
                      {it && <div className="font-mono text-caption text-ink-faint">{it.code} · {it.uom}{it.make ? ` · ${it.make}` : ""}</div>}
                      {l.salesOrderLineId != null && <div className="mt-0.5 text-caption text-info">Customer order line{l.soInfo ? `: ${l.soInfo}` : ""}</div>}
                      <div className="mt-0.5 text-caption text-ink-soft">
                        This vendor: {vr?.rate != null ? <>{money(vr.rate)} ({fmtDate(vr.date)})</> : "not bought before"}
                        {it && <> · Latest: {it.latestRate != null ? <>{money(it.latestRate)}{it.latestVendor ? ` · ${it.latestVendor}` : ""}{it.latestDate ? ` (${fmtDate(it.latestDate)})` : " (list)"}</> : "-"}</>}
                      </div>
                    </td>
                    <td className="min-w-48">
                      <input className={li.input} value={l.description} maxLength={500} aria-label={`Description for line ${i + 1}`} placeholder="Optional"
                        onChange={(e) => update(l.key, { description: e.target.value })} />
                    </td>
                    <td className="w-28">
                      <input className={li.numInput} type="number" min={0} step="any" inputMode="decimal" value={l.qty === 0 ? "" : l.qty} placeholder="0"
                        aria-label={`Quantity for line ${i + 1}${it ? ` in ${it.uom}` : ""}`} onChange={(e) => update(l.key, { qty: num(e.target.value) })} />
                    </td>
                    <td className="w-32">
                      <input className={li.numInput} type="number" min={0} step="0.01" inputMode="decimal" value={l.rate}
                        aria-label={`Rate for line ${i + 1}`} onChange={(e) => update(l.key, { rate: num(e.target.value), rateTouched: true })} />
                    </td>
                    <td className="w-24">
                      <input className={li.numInput} type="number" min={0} max={28} step="0.01" inputMode="decimal" value={l.gstRate}
                        aria-label={`GST % for line ${i + 1}`} onChange={(e) => update(l.key, { gstRate: Math.min(28, num(e.target.value)) })} />
                    </td>
                    <td className={cx(li.num, "pt-2.5 font-medium text-ink")}>{money(round2(l.qty * l.rate))}</td>
                    <td className="w-10">
                      <button type="button" onClick={() => remove(l.key)} className="rounded p-1.5 text-ink-soft hover:bg-muted hover:text-danger" aria-label={`Remove ${it?.code ?? "line"}`}>
                        <Trash2 className="icon-sm" aria-hidden />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </LineItemsTable>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 sm:max-w-md">
            {zeroRate > 0 && (
              <Callout tone="warning">{zeroRate} line{zeroRate === 1 ? " has" : "s have"} no rate yet. Enter the agreed price before sending the PO.</Callout>
            )}
          </div>
          <MoneySummary className="sm:w-80" subtotal={totals.sub} tax={totals.tax} total={totals.total}
            note={`${valid.length} line${valid.length === 1 ? "" : "s"} · total qty ${fmtQty(valid.reduce((s, l) => s + l.qty, 0))}`} />
        </div>
      </FormSection>

      <FormSection title="Terms and notes">
        <Field label="Terms printed on the PO" hint="One term per line">
          <Textarea name="terms" rows={6} maxLength={8000} defaultValue={initial.terms} />
        </Field>
        <Field label="Internal notes" hint="Not printed">
          <Textarea name="notes" rows={6} maxLength={4000} defaultValue={initial.notes} />
        </Field>
      </FormSection>

      <FormFooter cancelHref={id ? `/purchase-orders/${id}` : "/purchase-orders"} note={`PO total ${money(totals.total)}`}>
        <SubmitButton name="intent" value="draft" variant="secondary" pendingText="Saving…" disabled={!valid.length || !vendorId}>Save draft</SubmitButton>
        <SubmitButton name="intent" value="send" pendingText="Saving…" disabled={!valid.length || !vendorId}
          confirm="Save and mark this PO as sent to the vendor? Linked customer order lines will show as ordered.">Save and mark sent</SubmitButton>
      </FormFooter>
    </form>
  );
}
