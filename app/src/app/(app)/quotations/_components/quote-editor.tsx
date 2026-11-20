"use client";
/**
 * BOQ entry grid (quotation step 2 / edit). All template lines are shown grouped by section with qty inputs;
 * rates are pre-filled from latest cost + markup; only qty > 0 lines are posted (rule 3).
 */
import { Fragment, useMemo, useState } from "react";
import { AlertTriangle, Link2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button, Card, Field, Input, Select, Textarea, cx, inputClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { SYSTEMS } from "@/lib/constants";
import { money, pct, round2 } from "@/lib/format";
import { computeQuoteTotals, lineMarginPct, linePriceWarning } from "@/lib/pricing";
import { groupBySection, numberToIndianWords } from "@/lib/quotations";
import { ItemPicker } from "./item-picker";
import type { CatalogItem } from "../_lib/data";

export type GridLine = {
  key: string;
  lineId: number | null;
  section: string;
  boqRef: string;
  itemId: number | null;
  description: string;
  uom: string;
  qty: number;
  /** null when the viewer may not see cost */
  costRate: number | null;
  supplyRate: number;
  erectionRate: number;
  remarks: string;
  /** supply rate typed by hand → not re-priced when markup changes */
  manual: boolean;
};

export type QuoteHeader = {
  id?: number;
  customerId: number;
  customerName: string;
  templateId: number | null;
  templateName?: string | null;
  number?: string;
  projectName: string;
  siteLocation: string;
  system: string;
  quoteDate: string;
  validUntil: string;
  markupPct: number;
  discountPct: number;
  gstPct: number;
  terms: string;
  notes: string;
};

let seq = 0;
const newKey = () => `x${Date.now().toString(36)}${(seq++).toString(36)}`;
const n = (v: string) => {
  const x = Number(v);
  return Number.isFinite(x) && x >= 0 ? x : 0;
};
const priceFor = (cost: number, markup: number) => round2(cost * (1 + markup / 100));

export function QuoteEditor({
  action, header, initialLines, catalog, showCost, minMarginPct, back, canChangeMarkup,
}: {
  action: (f: FormData) => Promise<void>;
  header: QuoteHeader;
  initialLines: GridLine[];
  catalog: CatalogItem[];
  showCost: boolean;
  minMarginPct: number;
  back: string;
  canChangeMarkup: boolean;
}) {
  const [lines, setLines] = useState<GridLine[]>(initialLines);
  const [markup, setMarkup] = useState(header.markupPct);
  const [discount, setDiscount] = useState(header.discountPct);
  const [gst, setGst] = useState(header.gstPct);
  const [onlyQty, setOnlyQty] = useState(false);
  const [find, setFind] = useState("");
  const [addSection, setAddSection] = useState("");
  const catalogById = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);

  const totals = useMemo(
    () => computeQuoteTotals(lines.map((l) => ({ qty: l.qty, supplyRate: l.supplyRate, erectionRate: l.erectionRate, costRate: l.costRate ?? 0 })), discount, gst),
    [lines, discount, gst],
  );
  const warnings = useMemo(
    () => (showCost ? lines.filter((l) => l.qty > 0 && linePriceWarning({ supplyRate: l.supplyRate, costRate: l.costRate }, minMarginPct)) : []),
    [lines, showCost, minMarginPct],
  );
  const sections = useMemo(() => [...new Set(lines.map((l) => l.section).filter(Boolean))], [lines]);
  const visible = useMemo(() => {
    const f = find.trim().toLowerCase();
    return lines.filter((l) => (!onlyQty || l.qty > 0) && (!f || `${l.boqRef} ${l.description} ${l.section}`.toLowerCase().includes(f)));
  }, [lines, onlyQty, find]);
  const groups = useMemo(() => groupBySection(visible), [visible]);
  const withQty = lines.filter((l) => l.qty > 0).length;
  const targetSection = addSection.trim() || (lines.length ? lines[lines.length - 1].section : "Additional Items");

  function update(key: string, patch: Partial<GridLine>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function remove(key: string) {
    setLines((ls) => ls.filter((l) => l.key !== key));
  }
  /** Re-price item lines from cost at the new markup; `all` also overrides hand-typed rates. */
  function applyMarkup(m: number, all: boolean) {
    setLines((ls) => ls.map((l) => {
      if (l.itemId == null || l.costRate == null || (!all && l.manual)) return l;
      return { ...l, supplyRate: priceFor(l.costRate, m), manual: false };
    }));
  }
  function resetLinePrice(l: GridLine) {
    const c = l.itemId != null ? catalogById.get(l.itemId) : undefined;
    if (!c) return;
    const cost = c.cost;
    update(l.key, {
      costRate: cost, supplyRate: cost != null ? priceFor(cost, markup) : c.supply, erectionRate: c.erectionRate, manual: false,
    });
  }
  function addItem(c: CatalogItem) {
    setLines((ls) => [...ls, {
      key: newKey(), lineId: null, section: targetSection, boqRef: "", itemId: c.id,
      description: [c.name, c.make ? `— Make: ${c.make}` : ""].filter(Boolean).join(" "), uom: c.uom, qty: 1,
      costRate: c.cost, supplyRate: c.cost != null ? priceFor(c.cost, markup) : c.supply, erectionRate: c.erectionRate, remarks: "", manual: false,
    }]);
    setOnlyQty(false);
  }
  function addFree() {
    setLines((ls) => [...ls, {
      key: newKey(), lineId: null, section: targetSection, boqRef: "", itemId: null, description: "", uom: "Nos", qty: 1,
      costRate: showCost ? 0 : null, supplyRate: 0, erectionRate: 0, remarks: "", manual: true,
    }]);
    setOnlyQty(false);
  }

  const payload = JSON.stringify(lines.filter((l) => l.qty > 0).map((l) => ({
    lineId: l.lineId, section: l.section || null, boqRef: l.boqRef || null, itemId: l.itemId, description: l.description,
    uom: l.uom || "Nos", qty: l.qty, supplyRate: l.supplyRate, erectionRate: l.erectionRate,
    costRate: l.itemId == null && showCost ? l.costRate ?? 0 : null, remarks: l.remarks || null,
  })));
  const colCount = showCost ? 12 : 10;

  return (
    <form action={action} className="space-y-6 pb-24">
      {header.id && <input type="hidden" name="id" value={header.id} />}
      <input type="hidden" name="customerId" value={header.customerId} />
      <input type="hidden" name="templateId" value={header.templateId ?? ""} />
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="lines" value={payload} />
      <input type="hidden" name="markupPct" value={markup} />
      <input type="hidden" name="discountPct" value={discount} />
      <input type="hidden" name="gstPct" value={gst} />

      <Card title="Quotation details">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <span className="mb-1 block text-sm font-medium text-ink">Customer</span>
            <div className="rounded-lg border border-line bg-muted px-3 py-2 text-sm font-medium text-ink">{header.customerName}</div>
          </div>
          <Field label="Project name" className="sm:col-span-2">
            <Input name="projectName" defaultValue={header.projectName} maxLength={200} />
          </Field>
          <Field label="Site location" className="sm:col-span-2">
            <Input name="siteLocation" defaultValue={header.siteLocation} maxLength={200} />
          </Field>
          <Field label="System">
            <Select name="system" defaultValue={header.system}>
              <option value="">Mixed / not set</option>
              {Object.entries(SYSTEMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <div>
            <span className="mb-1 block text-sm font-medium text-ink">BOQ template</span>
            <div className="truncate rounded-lg border border-line bg-muted px-3 py-2 text-sm text-ink-soft">{header.templateName ?? "Blank quotation"}</div>
          </div>
          <Field label="Quotation date" required>
            <Input type="date" name="quoteDate" defaultValue={header.quoteDate} required />
          </Field>
          <Field label="Valid until">
            <Input type="date" name="validUntil" defaultValue={header.validUntil} />
          </Field>
          <Field label="Markup %" hint={canChangeMarkup ? "Over latest purchase cost" : "Set by the quotation"}>
            <Input type="number" min={0} max={500} step="0.5" value={markup} disabled={!canChangeMarkup} aria-label="Markup percent"
              onChange={(e) => { const m = n(e.target.value); setMarkup(m); applyMarkup(m, false); }} />
          </Field>
          <Field label="Discount %">
            <Input type="number" min={0} max={100} step="0.5" value={discount} onChange={(e) => setDiscount(Math.min(100, n(e.target.value)))} />
          </Field>
          <Field label="GST %">
            <Input type="number" min={0} max={100} step="0.5" value={gst} onChange={(e) => setGst(Math.min(100, n(e.target.value)))} />
          </Field>
        </div>
      </Card>

      {warnings.length > 0 && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {warnings.length} line{warnings.length === 1 ? " is" : "s are"} priced below cost or under the minimum margin of {minMarginPct}%. Check the highlighted rows before saving.
          </span>
        </div>
      )}

      <Card
        title={`Bill of quantities — ${withQty} of ${lines.length} line${lines.length === 1 ? "" : "s"} with quantity`}
        bodyClassName="p-0"
      >
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={onlyQty} onChange={(e) => setOnlyQty(e.target.checked)} />
              Show only lines with qty
            </label>
            {showCost && canChangeMarkup && (
              <Button type="button" variant="ghost" size="sm" onClick={() => { if (window.confirm(`Re-price every item line at ${markup}% markup? Hand-typed supply rates will be replaced.`)) applyMarkup(markup, true); }}>
                <RotateCcw className="h-4 w-4" aria-hidden /> Re-apply markup to all
              </Button>
            )}
          </div>
          <Input type="search" placeholder="Find in BOQ…" value={find} onChange={(e) => setFind(e.target.value)} className="sm:max-w-xs" aria-label="Find in BOQ" />
        </div>

        {lines.length === 0 ? (
          <p className="p-6 text-center text-sm text-ink-soft">Blank quotation — add items from the item master or free-text lines below.</p>
        ) : visible.length === 0 ? (
          <p className="p-6 text-center text-sm text-ink-soft">No lines match. {onlyQty && "Untick “Show only lines with qty” to see all template lines."}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-sm">
              <thead>
                <tr className="bg-muted text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  <th rowSpan={2} className="w-20 px-2 py-2 text-left">BOQ Ref</th>
                  <th rowSpan={2} className="px-2 py-2 text-left">Description</th>
                  <th rowSpan={2} className="w-24 px-2 py-2 text-right">Qty</th>
                  <th rowSpan={2} className="w-16 px-2 py-2 text-left">UOM</th>
                  <th colSpan={2} className="border-l border-line px-2 py-1 text-center">Supply</th>
                  <th colSpan={2} className="border-l border-line px-2 py-1 text-center">Erection</th>
                  {showCost && <th colSpan={2} className="border-l border-line px-2 py-1 text-center">Cost / margin</th>}
                  <th rowSpan={2} className="w-48 border-l border-line px-2 py-2 text-left">Remarks</th>
                  <th rowSpan={2} className="w-10 px-1 py-2"><span className="sr-only">Remove</span></th>
                </tr>
                <tr className="bg-muted text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  <th className="w-28 border-l border-line px-2 py-1 text-right">Rate</th>
                  <th className="w-28 px-2 py-1 text-right">Amount</th>
                  <th className="w-28 border-l border-line px-2 py-1 text-right">Rate</th>
                  <th className="w-28 px-2 py-1 text-right">Amount</th>
                  {showCost && <th className="w-28 border-l border-line px-2 py-1 text-right">Cost rate</th>}
                  {showCost && <th className="w-20 px-2 py-1 text-right">Margin</th>}
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const sub = g.lines.reduce((s, l) => s + (l.qty > 0 ? l.qty * (l.supplyRate + l.erectionRate) : 0), 0);
                  return (
                    <Fragment key={g.section || "_none"}>
                      {g.section && (
                        <tr className="border-t border-line bg-muted/60">
                          <td colSpan={colCount} className="px-2 py-2 text-sm font-semibold text-ink">
                            <span>{g.section}</span>
                            {sub > 0 && <span className="ml-3 text-xs font-normal text-ink-soft tabular-nums">Section total {money(sub)}</span>}
                          </td>
                        </tr>
                      )}
                      {g.lines.map((l) => {
                        const warn = showCost && l.qty > 0 ? linePriceWarning({ supplyRate: l.supplyRate, costRate: l.costRate }, minMarginPct) : null;
                        const c = l.itemId != null ? catalogById.get(l.itemId) : undefined;
                        const active = l.qty > 0;
                        return (
                          <tr key={l.key} className={cx("border-t border-line align-top", !active && "text-ink-soft",
                            warn === "below_cost" && "bg-red-50 dark:bg-red-950/40", warn === "low_margin" && "bg-amber-50 dark:bg-amber-950/40")}>
                            <td className="px-2 py-2">
                              <input aria-label="BOQ ref" className={inputClass + " px-2"} value={l.boqRef} maxLength={20} onChange={(e) => update(l.key, { boqRef: e.target.value })} />
                            </td>
                            <td className="px-2 py-2">
                              {l.lineId == null && !c ? (
                                <textarea aria-label="Description" className={inputClass + " min-h-10"} rows={2} value={l.description} placeholder="Description of the work / item"
                                  onChange={(e) => update(l.key, { description: e.target.value })} />
                              ) : (
                                <details className="group">
                                  <summary className="cursor-pointer list-none">
                                    <span className={cx("line-clamp-3 whitespace-pre-line", active && "text-ink")}>{l.description || <em>No description</em>}</span>
                                  </summary>
                                  <textarea aria-label="Edit description" className={inputClass + " mt-1 min-h-20"} rows={4} value={l.description}
                                    onChange={(e) => update(l.key, { description: e.target.value })} />
                                </details>
                              )}
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-faint">
                                {c ? (
                                  <span className="inline-flex items-center gap-1"><Link2 className="h-3 w-3" aria-hidden />{c.code}{c.make ? ` · ${c.make}` : ""}</span>
                                ) : l.itemId != null ? <span>Item #{l.itemId}</span> : <span className="text-amber-700 dark:text-amber-400">Free text — enter rates</span>}
                                {c?.lastSaleRate != null && <span>Last quoted/sold {money(c.lastSaleRate)}</span>}
                                {c && l.manual && (
                                  <button type="button" className="text-brand-700 hover:underline" onClick={() => resetLinePrice(l)}>Use latest price</button>
                                )}
                                {warn === "below_cost" && <span className="font-medium text-red-700 dark:text-red-400">Below cost!</span>}
                                {warn === "low_margin" && <span className="font-medium text-amber-700 dark:text-amber-400">Margin under {minMarginPct}%</span>}
                              </div>
                            </td>
                            <td className="px-2 py-2">
                              <input aria-label={`Quantity for ${l.boqRef || l.description.slice(0, 40)}`} type="number" min={0} step="any" inputMode="decimal"
                                className={cx(inputClass, "px-2 text-right tabular-nums", active && "border-brand-500 font-semibold")}
                                value={l.qty === 0 ? "" : l.qty} placeholder="0"
                                onChange={(e) => update(l.key, { qty: n(e.target.value) })} />
                            </td>
                            <td className="px-2 py-2">
                              <input aria-label="UOM" className={inputClass + " px-2"} value={l.uom} maxLength={20} onChange={(e) => update(l.key, { uom: e.target.value })} />
                            </td>
                            <td className="border-l border-line px-2 py-2">
                              <input aria-label="Supply rate" type="number" min={0} step="0.01" inputMode="decimal" className={inputClass + " px-2 text-right tabular-nums"}
                                value={l.supplyRate} onChange={(e) => update(l.key, { supplyRate: n(e.target.value), manual: true })} />
                            </td>
                            <td className="px-2 py-2 pt-4 text-right tabular-nums">{active ? money(l.qty * l.supplyRate) : "—"}</td>
                            <td className="border-l border-line px-2 py-2">
                              <input aria-label="Erection rate" type="number" min={0} step="0.01" inputMode="decimal" className={inputClass + " px-2 text-right tabular-nums"}
                                value={l.erectionRate} onChange={(e) => update(l.key, { erectionRate: n(e.target.value) })} />
                            </td>
                            <td className="px-2 py-2 pt-4 text-right tabular-nums">{active ? money(l.qty * l.erectionRate) : "—"}</td>
                            {showCost && (
                              <td className="border-l border-line px-2 py-2 text-right tabular-nums">
                                {l.itemId == null ? (
                                  <input aria-label="Cost rate" type="number" min={0} step="0.01" className={inputClass + " px-2 text-right tabular-nums"}
                                    value={l.costRate ?? 0} onChange={(e) => update(l.key, { costRate: n(e.target.value) })} />
                                ) : <span className="inline-block pt-2">{money(l.costRate)}</span>}
                              </td>
                            )}
                            {showCost && (
                              <td className={cx("px-2 py-2 pt-4 text-right tabular-nums", warn === "below_cost" && "text-red-700 dark:text-red-400", warn === "low_margin" && "text-amber-700 dark:text-amber-400")}>
                                {l.costRate ? pct(lineMarginPct({ supplyRate: l.supplyRate, costRate: l.costRate })) : "—"}
                              </td>
                            )}
                            <td className="border-l border-line px-2 py-2">
                              <input aria-label="Remarks" className={inputClass + " px-2"} value={l.remarks} maxLength={1000} onChange={(e) => update(l.key, { remarks: e.target.value })} />
                            </td>
                            <td className="px-1 py-2">
                              <button type="button" aria-label="Remove line" onClick={() => remove(l.key)}
                                className="rounded p-1.5 text-ink-faint hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"><Trash2 className="h-4 w-4" /></button>
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <datalist id="quote-sections">{sections.map((s) => <option key={s} value={s} />)}</datalist>
        <div className="grid gap-3 border-t border-line p-4 sm:grid-cols-[minmax(0,14rem)_1fr_auto] sm:items-start">
          <Field label="Add to section" hint={`New lines go to “${targetSection}”`}>
            <input className={inputClass} list="quote-sections" value={addSection} onChange={(e) => setAddSection(e.target.value)} placeholder={targetSection} />
          </Field>
          <Field label="Add extra item from item master">
            <ItemPicker items={catalog} systemFilter={header.system || undefined} onPick={addItem}
              renderMeta={(c) => <>{showCost && c.cost != null ? `cost ${money(c.cost)} · ` : ""}sell {money(c.cost != null ? priceFor(c.cost, markup) : c.supply)}</>} />
          </Field>
          <div className="sm:pt-6">
            <Button type="button" variant="secondary" onClick={addFree}><Plus className="h-4 w-4" aria-hidden /> Free-text line</Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Terms & notes">
          <div className="space-y-4">
            <Field label="Terms & conditions" hint="Printed on the quotation; leave blank to use the company default terms">
              <Textarea name="terms" defaultValue={header.terms} rows={6} maxLength={8000} />
            </Field>
            <Field label="Internal notes" hint="Not printed">
              <Textarea name="notes" defaultValue={header.notes} rows={3} maxLength={4000} />
            </Field>
          </div>
        </Card>
        <Card title="Totals">
          <dl className="space-y-2 text-sm">
            <Row label="Supply total" value={money(totals.supply)} />
            <Row label="Erection total" value={money(totals.erection)} />
            {totals.discount > 0 && <Row label={`Discount (${discount}%)`} value={`− ${money(totals.discount)}`} />}
            <Row label="Taxable value" value={money(totals.taxable)} />
            <Row label={`GST (${gst}%)`} value={money(totals.tax)} />
            <div className="border-t border-line pt-2"><Row label="Grand total" value={money(totals.grand)} strong /></div>
            <p className="text-xs italic text-ink-soft">{numberToIndianWords(totals.grand)}</p>
            {showCost && (
              <div className="mt-3 rounded-lg bg-muted p-3">
                <Row label="Material cost" value={money(totals.cost)} />
                <Row label="Material margin" value={<span className={cx(totals.supply > 0 && totals.marginPct < minMarginPct && "text-red-600")}>{pct(totals.marginPct)}</span>} />
                <Row label="Gross profit on supply" value={money(totals.supply * (1 - discount / 100) - totals.cost)} />
              </div>
            )}
          </dl>
        </Card>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 px-4 py-3 shadow-lg backdrop-blur lg:pl-64">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="min-w-0 text-sm">
            <div className="font-semibold tabular-nums text-ink">{money(totals.grand)}</div>
            <div className="truncate text-xs text-ink-soft">{withQty} line{withQty === 1 ? "" : "s"} · incl. GST{showCost && totals.supply > 0 ? ` · margin ${pct(totals.marginPct)}` : ""}</div>
          </div>
          <SubmitButton disabled={withQty === 0} pendingText="Saving…">{header.id ? "Save changes" : "Save quotation"}</SubmitButton>
        </div>
      </div>
    </form>
  );
}

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={cx("text-ink-soft", strong && "font-semibold text-ink")}>{label}</dt>
      <dd className={cx("tabular-nums text-ink", strong && "text-lg font-semibold")}>{value}</dd>
    </div>
  );
}
