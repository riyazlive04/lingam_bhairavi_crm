"use client";
import { useMemo, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { SubmitButton } from "@/components/submit-button";
import { Field, Input, Select, Textarea, cx } from "@/components/ui";
import { Callout, FormFooter, FormSection, LineItemsTable, MoneySummary, StatusPill, li } from "@/components/patterns";
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
        <Callout tone="info" title={`Bill against purchase order ${po.number}`}>
          Quantities are what is still to be received. Change them to match the supplier&apos;s bill. Posting the bill updates the received quantity on the PO.
        </Callout>
      )}
      <FormSection title="Supplier bill" description="As printed on the vendor's invoice." columns={3}>
        <Field label="Vendor" required className="sm:col-span-2">
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
        <Field label="Project (cost centre)" hint="Leave empty to receive into stock. With a project, material is issued straight to site.">
          <Select name="projectId" defaultValue={initial.projectId ? String(initial.projectId) : ""}>
            <option value="">Into stock</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
          </Select>
        </Field>
        <Field label="Notes" className="sm:col-span-2 lg:col-span-3">
          <Textarea name="notes" defaultValue={initial.notes} className="min-h-12" />
        </Field>
      </FormSection>

      <FormSection title={`Lines (${validLines.length})`} description="Search the item master to add a line. Lines with no quantity are left off the bill." columns={1}>
        <div className="relative">
          <label htmlFor="pf-item-search" className="mb-1 block text-sm font-medium text-ink">Add item</label>
          <div className="relative">
            <Search className="icon-sm pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden />
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
          <p className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-ink-soft">No lines yet. Search above to add items from the item master.</p>
        ) : (
          <LineItemsTable minWidth={980} caption="Purchase invoice lines">
            <thead>
              <tr>
                <th>#</th><th>Item</th><th>Description</th><th className={li.num}>Qty</th><th className={li.num}>Rate (₹)</th><th className={li.num}>GST %</th><th className={li.num}>Amount</th>
                <th><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => {
                const it = itemById.get(l.itemId);
                if (!it) return null;
                const vr = vendorRates[vendorId]?.[String(it.id)];
                const vsLatest = it.latestRate ? ((l.rate - it.latestRate) / it.latestRate) * 100 : null;
                const vsVendor = vr?.rate ? ((l.rate - vr.rate) / vr.rate) * 100 : null;
                const jump = vsLatest != null && Math.abs(vsLatest) >= JUMP_PCT;
                return (
                  <tr key={idx} className={cx(!l.qty && "opacity-60", jump && "[&>td]:bg-warning-soft")}>
                    <td className="pt-2.5 text-ink-soft">{idx + 1}</td>
                    <td className="min-w-64 max-w-80">
                      <div className="font-medium text-ink">{it.name}</div>
                      <div className="font-mono text-caption text-ink-faint">{it.code} · {it.uom}{it.make ? ` · ${it.make}` : ""}</div>
                      {l.poLineId != null && <div className="mt-0.5 text-caption text-info">PO line{l.poInfo ? `: ${l.poInfo}` : ""}</div>}
                      <div className="mt-0.5 text-caption text-ink-soft">
                        This vendor: {vr?.rate != null
                          ? <>{money(vr.rate)} ({fmtDate(vr.date)}){vsVendor != null && Math.abs(vsVendor) >= 0.5 && <b className={vsVendor > 0 ? "text-danger" : "text-success"}> {vsVendor > 0 ? "+" : ""}{vsVendor.toFixed(1)}%</b>}</>
                          : "first purchase"}
                        {" · "}Latest: {it.latestRate != null ? <>{money(it.latestRate)}{it.latestVendor ? ` · ${it.latestVendor}` : ""}{it.latestDate ? ` (${fmtDate(it.latestDate)})` : " (list)"}</> : "-"}
                      </div>
                      {jump && <StatusPill className="mt-1" semantic="warning" label={`${vsLatest! > 0 ? "+" : ""}${vsLatest!.toFixed(1)}% vs latest`} />}
                    </td>
                    <td className="min-w-48">
                      <input className={li.input} value={l.description} maxLength={500} placeholder="Optional" aria-label={`Description for line ${idx + 1}`}
                        onChange={(e) => update(idx, { description: e.target.value })} />
                    </td>
                    <td className="w-28">
                      <input className={li.numInput} type="number" min={0} step="any" inputMode="decimal" value={Number.isFinite(l.qty) ? l.qty : ""}
                        aria-label={`Quantity for line ${idx + 1} in ${it.uom}`} onChange={(e) => update(idx, { qty: Number(e.target.value) })} />
                    </td>
                    <td className="w-32">
                      <input className={li.numInput} type="number" min={0} step="0.01" inputMode="decimal" value={Number.isFinite(l.rate) ? l.rate : ""}
                        aria-label={`Rate for line ${idx + 1}`} onChange={(e) => update(idx, { rate: Number(e.target.value) })} />
                    </td>
                    <td className="w-24">
                      <input className={li.numInput} type="number" min={0} max={28} step="0.01" inputMode="decimal" value={l.gstRate}
                        aria-label={`GST % for line ${idx + 1}`} onChange={(e) => update(idx, { gstRate: Number(e.target.value) })} />
                    </td>
                    <td className={cx(li.num, "pt-2.5 font-medium text-ink")}>{money(round2(l.qty * l.rate))}</td>
                    <td className="w-10">
                      <button type="button" onClick={() => remove(idx)} className="rounded p-1.5 text-ink-soft hover:bg-muted hover:text-danger" aria-label={`Remove ${it.code}`}>
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
            {jumps > 0 && (
              <Callout tone="warning">
                {jumps} line{jumps === 1 ? " differs" : "s differ"} by {JUMP_PCT}% or more from the current latest price. Please double-check before posting.
              </Callout>
            )}
          </div>
          <MoneySummary className="sm:w-80" subtotal={totals.sub} tax={totals.tax} total={totals.total}
            note={`${validLines.length} line${validLines.length === 1 ? "" : "s"} · total qty ${fmtQty(validLines.reduce((s, l) => s + l.qty, 0))}`} />
        </div>
      </FormSection>

      <FormFooter cancelHref={po ? `/purchase-orders/${po.id}` : "/purchases"} note={`Invoice total ${money(totals.total)}`}>
        <SubmitButton name="intent" value="draft" variant="secondary" pendingText="Saving…" disabled={!validLines.length || !vendorId}>Save draft</SubmitButton>
        <SubmitButton name="intent" value="post" pendingText="Posting…" disabled={!validLines.length || !vendorId}
          confirm="Post this invoice? Posting updates latest prices, vendor rates and stock, and cannot be undone.">Save and post</SubmitButton>
      </FormFooter>
    </form>
  );
}
