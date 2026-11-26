"use client";
/**
 * BOQ entry grid (quotation step 2 / edit). All template lines are shown grouped by section with qty inputs;
 * rates are pre-filled from latest cost + markup; only qty > 0 lines are posted (rule 3).
 * Desktop: a dense spreadsheet-style LineItemsTable with a sticky header. Phones: one card per line.
 * Both views edit the same state; the inputs have no `name`, only the hidden JSON payload is posted.
 */
import { Fragment, useMemo, useState } from "react";
import { Link2, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
import { Button, Field, Input, Select, Textarea, cx, inputClass } from "@/components/ui";
import { Callout, ConfirmButton, FormFooter, FormSection, LineItemsTable, MoneySummary, StatusPill, SummaryRows, li } from "@/components/patterns";
import { SubmitButton } from "@/components/submit-button";
import { SYSTEMS } from "@/lib/constants";
import { money, pct, round2 } from "@/lib/format";
import { approvalReasons, computeQuoteTotals, isCostStale, lineMarginPct, linePriceWarning, type ApprovalMode, type CostSource } from "@/lib/pricing";
import { groupBySection, numberToIndianWords } from "@/lib/quotations";
import { CostMeta } from "./cost-meta";
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
  /** rule 10: when and from whom the cost was bought (date/vendor null for list or manual costs) */
  costDate: string | null;
  costVendorName: string | null;
  costSource: CostSource | null;
  /** fast-moving item (7-day stale window) */
  volatile: boolean;
  /** user picked "Use latest price": the server takes a fresh cost snapshot on save */
  repriced?: boolean;
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
const plural = (k: number, one: string, many: string) => (k === 1 ? one : many);

export function QuoteEditor({
  action, header, initialLines, catalog, showCost, minMarginPct, back, canChangeMarkup, today, approvalMode = "below_margin", cancelHref,
}: {
  action: (f: FormData) => Promise<void>;
  header: QuoteHeader;
  initialLines: GridLine[];
  catalog: CatalogItem[];
  showCost: boolean;
  minMarginPct: number;
  back: string;
  canChangeMarkup: boolean;
  /** today (IST, YYYY-MM-DD) for the stale-price check */
  today: string;
  approvalMode?: ApprovalMode;
  /** where Cancel in the sticky footer goes */
  cancelHref?: string;
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
  const approvalNeeded = useMemo(
    () => approvalReasons(lines.map((l) => ({ qty: l.qty, supplyRate: l.supplyRate, erectionRate: l.erectionRate, costRate: l.costRate ?? 0 })),
      { mode: approvalMode, minMarginPct, discountPct: discount, gstPct: gst }),
    [lines, approvalMode, minMarginPct, discount, gst],
  );
  const staleCount = useMemo(
    () => lines.filter((l) => l.qty > 0 && l.costSource === "purchase" && isCostStale(l.costDate, l.volatile, today)).length,
    [lines, today],
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
      costDate: c.costDate, costVendorName: c.costVendorName, costSource: c.costSource, volatile: c.volatile, repriced: true,
    });
  }
  function addItem(c: CatalogItem) {
    setLines((ls) => [...ls, {
      key: newKey(), lineId: null, section: targetSection, boqRef: "", itemId: c.id,
      description: [c.name, c.make ? `(Make: ${c.make})` : ""].filter(Boolean).join(" "), uom: c.uom, qty: 1,
      costRate: c.cost, supplyRate: c.cost != null ? priceFor(c.cost, markup) : c.supply, erectionRate: c.erectionRate, remarks: "", manual: false,
      costDate: c.costDate, costVendorName: c.costVendorName, costSource: c.costSource, volatile: c.volatile, repriced: true,
    }]);
    setOnlyQty(false);
  }
  function addFree() {
    setLines((ls) => [...ls, {
      key: newKey(), lineId: null, section: targetSection, boqRef: "", itemId: null, description: "", uom: "Nos", qty: 1,
      costRate: showCost ? 0 : null, supplyRate: 0, erectionRate: 0, remarks: "", manual: true,
      costDate: null, costVendorName: null, costSource: "manual", volatile: false,
    }]);
    setOnlyQty(false);
  }

  const payload = JSON.stringify(lines.filter((l) => l.qty > 0).map((l) => ({
    lineId: l.lineId, section: l.section || null, boqRef: l.boqRef || null, itemId: l.itemId, description: l.description,
    uom: l.uom || "Nos", qty: l.qty, supplyRate: l.supplyRate, erectionRate: l.erectionRate,
    costRate: l.itemId == null && showCost ? l.costRate ?? 0 : null, remarks: l.remarks || null, repriced: l.repriced ? true : undefined,
  })));
  const colCount = showCost ? 12 : 10;
  const lineLabel = (l: GridLine) => l.boqRef || l.description.slice(0, 40) || "new line";

  /** Small facts under a description: item code, cost source, last sale, warnings, "Use latest price". */
  const lineMeta = (l: GridLine, warn: ReturnType<typeof linePriceWarning>) => {
    const c = l.itemId != null ? catalogById.get(l.itemId) : undefined;
    return (
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-ink-faint">
        {c ? (
          <span className="inline-flex items-center gap-1"><Link2 className="icon-xs" aria-hidden />{c.code}{c.make ? ` · ${c.make}` : ""}</span>
        ) : l.itemId != null ? <span>Item #{l.itemId}</span> : <span className="text-warning">Free text, enter rates</span>}
        {(l.itemId != null || l.costSource === "manual") && (
          <CostMeta cost={showCost ? l.costRate : null} costDate={l.costDate} vendorName={l.costVendorName}
            source={l.costSource} volatile={l.volatile} today={today} />
        )}
        {c?.lastSaleRate != null && <span>Last quoted or sold at {money(c.lastSaleRate)}</span>}
        {c && l.manual && (
          <button type="button" className="font-medium text-brand-700 hover:underline dark:text-brand-300" onClick={() => resetLinePrice(l)}>Use latest price</button>
        )}
        {warn === "below_cost" && <StatusPill semantic="danger" label="Below cost" noDot />}
        {warn === "low_margin" && <StatusPill semantic="warning" label={`Margin under ${minMarginPct}%`} noDot />}
      </div>
    );
  };
  const rowTint = (warn: ReturnType<typeof linePriceWarning>) => cx(warn === "below_cost" && "bg-danger-soft", warn === "low_margin" && "bg-warning-soft");

  const footerNote = (
    <div className="flex items-baseline gap-x-3 gap-y-0.5 max-sm:justify-between sm:flex-col sm:gap-0">
      <span className="font-display text-heading font-bold tabular-nums text-ink">{money(totals.grand)}</span>
      <span className="truncate">
        {withQty} {plural(withQty, "line", "lines")} · incl. GST
        {showCost && totals.supply > 0 && <> · margin <span className={cx(totals.marginPct < minMarginPct && "font-medium text-danger")}>{pct(totals.marginPct)}</span></>}
      </span>
    </div>
  );

  return (
    <form action={action} className="space-y-4">
      {header.id && <input type="hidden" name="id" value={header.id} />}
      <input type="hidden" name="customerId" value={header.customerId} />
      <input type="hidden" name="templateId" value={header.templateId ?? ""} />
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="lines" value={payload} />
      <input type="hidden" name="markupPct" value={markup} />
      <input type="hidden" name="discountPct" value={discount} />
      <input type="hidden" name="gstPct" value={gst} />

      <div className="grid gap-4 xl:grid-cols-2">
        <FormSection title="Customer and project">
          <Field label="Customer" className="sm:col-span-2">
            <Input value={header.customerName} readOnly className="bg-muted font-medium" />
          </Field>
          <Field label="Project name">
            <Input name="projectName" defaultValue={header.projectName} maxLength={200} />
          </Field>
          <Field label="Site location">
            <Input name="siteLocation" defaultValue={header.siteLocation} maxLength={200} />
          </Field>
          <Field label="System">
            <Select name="system" defaultValue={header.system}>
              <option value="">Mixed or not set</option>
              {Object.entries(SYSTEMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="BOQ template">
            <Input value={header.templateName ?? "Blank quotation"} readOnly className="bg-muted text-ink-soft" />
          </Field>
        </FormSection>
        <FormSection title="Dates and pricing" description="Rates follow the latest purchase cost plus the markup.">
          <Field label="Quotation date" required>
            <Input type="date" name="quoteDate" defaultValue={header.quoteDate} required />
          </Field>
          <Field label="Valid until">
            <Input type="date" name="validUntil" defaultValue={header.validUntil} />
          </Field>
          <Field label="Markup %" hint={canChangeMarkup ? "Over the latest purchase cost" : "Set by the quotation"}>
            <Input type="number" inputMode="decimal" min={0} max={500} step="0.5" value={markup} disabled={!canChangeMarkup} className="text-right"
              onChange={(e) => { const m = n(e.target.value); setMarkup(m); applyMarkup(m, false); }} />
          </Field>
          <Field label="Discount %">
            <Input type="number" inputMode="decimal" min={0} max={100} step="0.5" value={discount} className="text-right" onChange={(e) => setDiscount(Math.min(100, n(e.target.value)))} />
          </Field>
          <Field label="GST %">
            <Input type="number" inputMode="decimal" min={0} max={100} step="0.5" value={gst} className="text-right" onChange={(e) => setGst(Math.min(100, n(e.target.value)))} />
          </Field>
        </FormSection>
      </div>

      {warnings.length > 0 && (
        <Callout tone="warning" title={`${warnings.length} ${plural(warnings.length, "line is", "lines are")} priced below cost or under the ${minMarginPct}% minimum margin`}>
          Check the highlighted rows before saving.{approvalNeeded.length > 0 && " An admin will need to approve this quotation before it can be sent."}
        </Callout>
      )}
      {approvalNeeded.length > 0 && warnings.length === 0 && (
        <Callout tone="info" title="Approval needed before sending">
          {approvalNeeded.join("; ")}. After saving, use &ldquo;Request approval&rdquo; on the quotation page.
        </Callout>
      )}
      {staleCount > 0 && (
        <Callout tone="warning" title={`${staleCount} ${plural(staleCount, "line has", "lines have")} an old purchase price`}>
          These are marked &ldquo;Stale&rdquo;. Check with the supplier before sending, or use &ldquo;Use latest price&rdquo; after a new purchase is posted.
        </Callout>
      )}

      {/* ------------------------------------------------------------ bill of quantities */}
      <section className="rounded-2xl border border-line bg-surface shadow-sm" aria-labelledby="boq-title">
        <header className="flex flex-col gap-3 border-b border-line px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h2 id="boq-title" className="text-subheading text-ink">Bill of quantities</h2>
            <p className="mt-0.5 text-caption text-ink-soft" aria-live="polite">
              {withQty} of {lines.length} {plural(lines.length, "line has", "lines have")} a quantity. Only those are saved.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <label className="relative min-w-0 sm:w-64">
              <span className="sr-only">Find in BOQ</span>
              <Search className="icon-sm pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" aria-hidden />
              <Input type="search" placeholder="Find in BOQ" value={find} onChange={(e) => setFind(e.target.value)} className="pl-9" />
            </label>
            <label className="inline-flex h-9.5 items-center gap-2 rounded-lg border border-line px-3 text-sm text-ink">
              <input type="checkbox" checked={onlyQty} onChange={(e) => setOnlyQty(e.target.checked)} />
              Only lines with a quantity
            </label>
            {showCost && canChangeMarkup && (
              <ConfirmButton variant="ghost" confirm={`Re-price every item line at ${markup}%? Hand-typed rates are replaced.`}
                confirmLabel="Yes, re-price all" onConfirm={() => applyMarkup(markup, true)}>
                <RotateCcw className="icon-sm" aria-hidden /> Re-apply markup to all
              </ConfirmButton>
            )}
          </div>
        </header>

        {lines.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-soft">This is a blank quotation. Add items from the item master or free-text lines below.</p>
        ) : visible.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-soft">No lines match.{onlyQty && " Untick “Only lines with a quantity” to see every template line."}</p>
        ) : (
          <>
            {/* 640px and wider: spreadsheet grid with a sticky header */}
            <LineItemsTable minWidth={showCost ? 1160 : 1000} caption="Quotation lines"
              className="max-h-[calc(100dvh-14rem)] rounded-none! border-0! max-sm:hidden">
              <thead>
                <tr>
                  <th className="w-20">BOQ ref</th>
                  <th className="min-w-72">Description</th>
                  <th className={cx(li.num, "w-24")}>Qty</th>
                  <th className="w-16">UOM</th>
                  <th className={cx(li.num, "w-28")}>Supply rate</th>
                  <th className={cx(li.num, "w-28")}>Supply amt</th>
                  <th className={cx(li.num, "w-24")}>Erection rate</th>
                  <th className={cx(li.num, "w-28")}>Erection amt</th>
                  {showCost && <th className={cx(li.num, "w-24")}>Cost rate</th>}
                  {showCost && <th className={cx(li.num, "w-20")}>Margin</th>}
                  <th className="w-44">Remarks</th>
                  <th className="w-10"><span className="sr-only">Remove</span></th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const sub = g.lines.reduce((s, l) => s + (l.qty > 0 ? l.qty * (l.supplyRate + l.erectionRate) : 0), 0);
                  return (
                    <Fragment key={g.section || "_none"}>
                      {g.section && (
                        <tr>
                          <td colSpan={colCount} className="bg-surface-2 py-2! text-sm font-semibold text-ink">
                            {g.section}
                            {sub > 0 && <span className="ml-3 text-caption font-normal text-ink-soft tabular-nums">Section total {money(sub)}</span>}
                          </td>
                        </tr>
                      )}
                      {g.lines.map((l) => {
                        const warn = showCost && l.qty > 0 ? linePriceWarning({ supplyRate: l.supplyRate, costRate: l.costRate }, minMarginPct) : null;
                        const c = l.itemId != null ? catalogById.get(l.itemId) : undefined;
                        const active = l.qty > 0;
                        return (
                          <tr key={l.key} className={cx(rowTint(warn), !active && "text-ink-soft")}>
                            <td>
                              <input aria-label="BOQ ref" className={li.input} value={l.boqRef} maxLength={20} onChange={(e) => update(l.key, { boqRef: e.target.value })} />
                            </td>
                            <td>
                              {l.lineId == null && !c ? (
                                <textarea aria-label="Description" className={cx(li.input, "h-auto min-h-14 py-1.5")} rows={2} value={l.description} placeholder="Description of the work or item"
                                  onChange={(e) => update(l.key, { description: e.target.value })} />
                              ) : (
                                <details className="group px-2 pt-1.5">
                                  <summary className="cursor-pointer list-none rounded" title="Click to edit the description">
                                    <span className={cx("line-clamp-3 whitespace-pre-line", active && "text-ink")}>{l.description || <em>No description</em>}</span>
                                  </summary>
                                  <textarea aria-label="Edit description" className={cx(inputClass, "mt-1 min-h-20")} rows={4} value={l.description}
                                    onChange={(e) => update(l.key, { description: e.target.value })} />
                                </details>
                              )}
                              <div className="px-2">{lineMeta(l, warn)}</div>
                            </td>
                            <td>
                              <input aria-label={`Quantity for ${lineLabel(l)}`} type="number" min={0} step="any" inputMode="decimal"
                                className={cx(li.numInput, active && "font-semibold text-brand-700 dark:text-brand-300")}
                                value={l.qty === 0 ? "" : l.qty} placeholder="0"
                                onChange={(e) => update(l.key, { qty: n(e.target.value) })} />
                            </td>
                            <td>
                              <input aria-label={`Unit for ${lineLabel(l)}`} className={li.input} value={l.uom} maxLength={20} onChange={(e) => update(l.key, { uom: e.target.value })} />
                            </td>
                            <td>
                              <input aria-label={`Supply rate for ${lineLabel(l)}`} type="number" min={0} step="0.01" inputMode="decimal" className={li.numInput}
                                value={l.supplyRate} onChange={(e) => update(l.key, { supplyRate: n(e.target.value), manual: true })} />
                            </td>
                            <td className={cx(li.num, "pt-2.5! whitespace-nowrap")}>{active ? money(l.qty * l.supplyRate) : "-"}</td>
                            <td>
                              <input aria-label={`Erection rate for ${lineLabel(l)}`} type="number" min={0} step="0.01" inputMode="decimal" className={li.numInput}
                                value={l.erectionRate} onChange={(e) => update(l.key, { erectionRate: n(e.target.value) })} />
                            </td>
                            <td className={cx(li.num, "pt-2.5! whitespace-nowrap")}>{active ? money(l.qty * l.erectionRate) : "-"}</td>
                            {showCost && (
                              <td className={li.num}>
                                {l.itemId == null ? (
                                  <input aria-label={`Cost rate for ${lineLabel(l)}`} type="number" min={0} step="0.01" inputMode="decimal" className={li.numInput}
                                    value={l.costRate ?? 0} onChange={(e) => update(l.key, { costRate: n(e.target.value), costSource: "manual", costDate: today })} />
                                ) : <span className="inline-block px-2 pt-1.5 whitespace-nowrap">{money(l.costRate)}</span>}
                              </td>
                            )}
                            {showCost && (
                              <td className={cx(li.num, "pt-2.5!", warn === "below_cost" && "font-medium text-danger", warn === "low_margin" && "font-medium text-warning")}>
                                {l.costRate ? pct(lineMarginPct({ supplyRate: l.supplyRate, costRate: l.costRate })) : "-"}
                              </td>
                            )}
                            <td>
                              <input aria-label={`Remarks for ${lineLabel(l)}`} className={li.input} value={l.remarks} maxLength={1000} onChange={(e) => update(l.key, { remarks: e.target.value })} />
                            </td>
                            <td>
                              <button type="button" aria-label={`Remove ${lineLabel(l)}`} title="Remove line" onClick={() => remove(l.key)}
                                className="grid h-8.5 w-8.5 place-items-center rounded-lg text-ink-faint hover:bg-danger-soft hover:text-danger"><Trash2 className="icon-sm" aria-hidden /></button>
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5} className="text-right">Totals</td>
                  <td className={li.num}>{money(totals.supply)}</td>
                  <td />
                  <td className={li.num}>{money(totals.erection)}</td>
                  {showCost && <td className={li.num}>{money(totals.cost)}</td>}
                  {showCost && <td className={cx(li.num, totals.supply > 0 && totals.marginPct < minMarginPct && "text-danger")}>{totals.supply > 0 ? pct(totals.marginPct) : "-"}</td>}
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </LineItemsTable>

            {/* Phones: one card per line */}
            <div className="divide-y divide-line sm:hidden">
              {groups.map((g) => (
                <div key={g.section || "_none"}>
                  {g.section && <h3 className="sticky top-16 z-[1] bg-surface-2 px-4 py-2 text-sm font-semibold text-ink">{g.section}</h3>}
                  <ul className="divide-y divide-line">
                    {g.lines.map((l) => {
                      const warn = showCost && l.qty > 0 ? linePriceWarning({ supplyRate: l.supplyRate, costRate: l.costRate }, minMarginPct) : null;
                      const c = l.itemId != null ? catalogById.get(l.itemId) : undefined;
                      const active = l.qty > 0;
                      const amount = l.qty * (l.supplyRate + l.erectionRate);
                      return (
                        <li key={l.key} className={cx("space-y-2 px-4 py-3", rowTint(warn))}>
                          <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1 text-sm">
                              {l.lineId == null && !c ? (
                                <textarea aria-label="Description" className={cx(inputClass, "min-h-14")} rows={2} value={l.description} placeholder="Description of the work or item"
                                  onChange={(e) => update(l.key, { description: e.target.value })} />
                              ) : (
                                <p className={cx("line-clamp-3 whitespace-pre-line", active ? "text-ink" : "text-ink-soft")}>
                                  {l.boqRef && <span className="mr-1.5 text-caption text-ink-faint">{l.boqRef}</span>}{l.description || <em>No description</em>}
                                </p>
                              )}
                            </div>
                            <button type="button" aria-label={`Remove ${lineLabel(l)}`} onClick={() => remove(l.key)}
                              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-faint hover:bg-danger-soft hover:text-danger"><Trash2 className="icon-sm" aria-hidden /></button>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <label className="min-w-0">
                              <span className="mb-0.5 block text-caption text-ink-soft">Qty ({l.uom || "Nos"})</span>
                              <input type="number" min={0} step="any" inputMode="decimal" className={cx(inputClass, "h-9.5 text-right tabular-nums", active && "border-brand-500 font-semibold")}
                                value={l.qty === 0 ? "" : l.qty} placeholder="0" onChange={(e) => update(l.key, { qty: n(e.target.value) })} />
                            </label>
                            <label className="min-w-0">
                              <span className="mb-0.5 block text-caption text-ink-soft">Supply rate</span>
                              <input type="number" min={0} step="0.01" inputMode="decimal" className={cx(inputClass, "h-9.5 text-right tabular-nums")}
                                value={l.supplyRate} onChange={(e) => update(l.key, { supplyRate: n(e.target.value), manual: true })} />
                            </label>
                            <label className="min-w-0">
                              <span className="mb-0.5 block text-caption text-ink-soft">Erection rate</span>
                              <input type="number" min={0} step="0.01" inputMode="decimal" className={cx(inputClass, "h-9.5 text-right tabular-nums")}
                                value={l.erectionRate} onChange={(e) => update(l.key, { erectionRate: n(e.target.value) })} />
                            </label>
                            {showCost && l.itemId == null && (
                              <label className="min-w-0">
                                <span className="mb-0.5 block text-caption text-ink-soft">Cost rate</span>
                                <input type="number" min={0} step="0.01" inputMode="decimal" className={cx(inputClass, "h-9.5 text-right tabular-nums")}
                                  value={l.costRate ?? 0} onChange={(e) => update(l.key, { costRate: n(e.target.value), costSource: "manual", costDate: today })} />
                              </label>
                            )}
                          </div>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">{lineMeta(l, warn)}</div>
                            <span className="shrink-0 pt-1 text-sm font-semibold tabular-nums text-ink">{active ? money(amount) : "-"}</span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </>
        )}

        <datalist id="quote-sections">{sections.map((s) => <option key={s} value={s} />)}</datalist>
        <div className="grid gap-3 border-t border-line bg-surface-2 px-4 py-4 sm:px-5 md:grid-cols-[minmax(0,14rem)_1fr_auto] md:items-start">
          <Field label="Add to section" hint={`New lines go to “${targetSection}”`}>
            <Input list="quote-sections" value={addSection} onChange={(e) => setAddSection(e.target.value)} placeholder={targetSection} />
          </Field>
          <Field label="Add an item from the item master">
            <ItemPicker items={catalog} systemFilter={header.system || undefined} onPick={addItem}
              renderMeta={(c) => <>{showCost && c.cost != null ? `cost ${money(c.cost)} · ` : ""}sell {money(c.cost != null ? priceFor(c.cost, markup) : c.supply)}</>} />
          </Field>
          <div className="md:pt-7">
            <Button type="button" variant="secondary" onClick={addFree} className="max-md:w-full"><Plus className="icon-sm" aria-hidden /> Add free-text line</Button>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <FormSection title="Terms and notes" columns={1}>
          <Field label="Terms and conditions" hint="Printed on the quotation. Leave blank to use the company default terms.">
            <Textarea name="terms" defaultValue={header.terms} rows={6} maxLength={8000} />
          </Field>
          <Field label="Internal notes" hint="Not printed">
            <Textarea name="notes" defaultValue={header.notes} rows={3} maxLength={4000} />
          </Field>
        </FormSection>
        <section className="h-fit rounded-2xl border border-line bg-surface shadow-sm lg:sticky lg:top-20" aria-labelledby="totals-title">
          <header className="border-b border-line px-4 py-3 sm:px-5"><h2 id="totals-title" className="text-subheading text-ink">Totals</h2></header>
          <div className="space-y-4 p-4 sm:p-5">
            <MoneySummary
              rows={[
                { label: "Supply total", value: totals.supply },
                { label: "Erection total", value: totals.erection },
                ...(totals.discount > 0 ? [{ label: `Discount (${discount}%)`, value: totals.discount, minus: true }] : []),
              ]}
              taxable={totals.taxable}
              tax={totals.tax} taxLabel={`GST (${gst}%)`}
              total={totals.grand} totalLabel="Grand total"
              words={numberToIndianWords(totals.grand)}
            />
            {showCost && (
              <div className="rounded-xl bg-muted p-3">
                <p className="mb-2 text-overline uppercase text-ink-faint">Internal</p>
                <SummaryRows rows={[
                  ["Material cost", money(totals.cost)],
                  ["Material margin", <span key="m" className={cx(totals.supply > 0 && totals.marginPct < minMarginPct && "text-danger")}>{pct(totals.marginPct)}</span>],
                  ["Gross profit on supply", money(totals.supply * (1 - discount / 100) - totals.cost)],
                ]} />
              </div>
            )}
          </div>
        </section>
      </div>

      <FormFooter cancelHref={cancelHref} note={footerNote}>
        <SubmitButton disabled={withQty === 0} pendingText="Saving…">{header.id ? "Save changes" : "Save quotation"}</SubmitButton>
      </FormFooter>
    </form>
  );
}
