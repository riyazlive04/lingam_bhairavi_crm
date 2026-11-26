"use client";
/**
 * Review screen of the consultant BOQ import (step 2 of 2): sheet tabs, matched items with latest cost (rule 10),
 * editable quantities and rates, live totals (rule 3), then "Create quotation" / "Save as BOQ template".
 * Desktop: a dense LineItemsTable with a sticky header. Phones: each row becomes a card (Tailwind `max-sm:` grid).
 */
import { memo, startTransition, useActionState, useCallback, useId, useMemo, useState, type ReactNode } from "react";
import { FileSpreadsheet, RotateCcw, Search, X } from "lucide-react";
import { Button, cx, Field, Input, Select } from "@/components/ui";
import {
  Callout, FormFooter, FormPage, FormSection, LineItemsTable, MoneySummary, SectionCard, StatusPill, SummaryRows, li, type StatusSemantic,
} from "@/components/patterns";
import {
  boqTotals, splitMakes, statusForScore, summariseRows, supplyFromCost, type MatchStatus, type RowMatch,
} from "@/lib/boq-import";
import { fmtDate, money, round2 } from "@/lib/format";
import { costAgeDays, isCostStale } from "@/lib/pricing";
import { createFromBoq } from "../actions";
import type { AnalyseResult, CreatePayload, CreateState, ImportCatalogItem, ReviewRowData } from "../_lib/types";
import { ItemSearch } from "./pickers";

type RowState = {
  key: string;
  sheet: number;
  rowNo: number;
  ref: string | null;
  section: string | null;
  description: string;
  note?: string;
  unit: string;
  remarks: string | null;
  sourceRate: number | null;
  itemId: number | null;
  score: number;
  status: MatchStatus;
  reason: string;
  ambiguous: boolean;
  alternatives: RowMatch["alternatives"];
  chosenByUser: boolean;
  include: boolean;
  includeTouched: boolean;
  qty: string;
  /** typed supply / erection rate; null = use the suggested rate */
  supply: string | null;
  erection: string | null;
};

type Entry = { kind: "item"; index: number } | { kind: "section" | "skip"; row: ReviewRowData };
type Filter = "all" | "check" | "unmatched" | "excluded";

const toNum = (s: string | null | undefined) => {
  if (s == null || s.trim() === "") return 0;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};
const numText = (n: number) => (Number.isFinite(n) ? String(round2(n)) : "0");

function initialRows(data: AnalyseResult): { rows: RowState[]; layout: Entry[][] } {
  const rows: RowState[] = [];
  const layout: Entry[][] = data.sheets.map((s, si) => s.rows.map((r): Entry => {
    if (r.kind !== "item") return { kind: r.kind, row: r };
    const m = r.match;
    const qty = r.qty ?? 0;
    rows.push({
      key: `${si}:${r.rowNo}`, sheet: si, rowNo: r.rowNo, ref: r.ref, section: r.section, description: r.description, note: r.note,
      unit: r.unit ?? "", remarks: r.remarks, sourceRate: r.sourceRate,
      itemId: m?.itemId ?? null, score: m?.score ?? 0, status: m?.status ?? "none", reason: m?.reason ?? "", ambiguous: m?.ambiguous ?? false,
      alternatives: m?.alternatives ?? [], chosenByUser: false,
      include: qty > 0, includeTouched: false, qty: qty ? numText(qty) : "0",
      supply: m?.itemId == null && r.sourceRate ? numText(r.sourceRate) : null,
      erection: null,
    });
    return { kind: "item", index: rows.length - 1 };
  }));
  return { rows, layout };
}

type Priced = { it: ImportCatalogItem | undefined; cost: number; suggested: number; supply: number; erection: number; qty: number };

/** Rates of one row: rule 2 suggestion from the latest cost unless the user typed a rate. */
function priceRow(r: RowState, byId: ReadonlyMap<number, ImportCatalogItem>, markup: number, showCost: boolean): Priced {
  const it = r.itemId != null ? byId.get(r.itemId) : undefined;
  const cost = it?.cost ?? 0;
  const suggested = it ? (showCost && it.cost != null ? supplyFromCost(it.cost, markup) : it.supplyAtDefault) : 0;
  const supply = r.supply != null ? toNum(r.supply) : suggested;
  const erection = r.erection != null ? toNum(r.erection) : it?.erectionRate ?? 0;
  return { it, cost, suggested, supply, erection, qty: toNum(r.qty) };
}


const STATUS_CHIP: Record<MatchStatus | "chosen" | "free", { semantic: StatusSemantic; label: string }> = {
  matched: { semantic: "success", label: "Matched" },
  check: { semantic: "warning", label: "Check" },
  none: { semantic: "neutral", label: "No match" },
  chosen: { semantic: "info", label: "Chosen" },
  free: { semantic: "neutral", label: "Free text" },
};

/** Phone card layout for a table cell: drop the table cell box and padding below 640px. */
const pc = "max-sm:block max-sm:border-0! max-sm:p-0!";
/** Visible label above an input, phones only (the column header does the job from 640px). */
function PhoneLabel({ children }: { children: ReactNode }) {
  return <span className="mb-0.5 block text-left text-caption text-ink-soft sm:hidden">{children}</span>;
}

export function BoqReview({ data, catalog, showCost, defaultMarkup, defaultGst, today, canTemplate, onReset }: {
  data: AnalyseResult;
  catalog: ImportCatalogItem[];
  showCost: boolean;
  defaultMarkup: number;
  defaultGst: number;
  today: string;
  canTemplate: boolean;
  onReset: () => void;
}) {
  const init = useMemo(() => initialRows(data), [data]);
  const [rows, setRows] = useState<RowState[]>(init.rows);
  const [tab, setTab] = useState(0);
  const [filter, setFilter] = useState<Filter>("all");
  const [markupText, setMarkupText] = useState(String(defaultMarkup));
  const [gstText, setGstText] = useState(String(defaultGst));
  const [projectName, setProjectName] = useState(data.projectName);
  const [siteLocation, setSiteLocation] = useState(data.siteLocation);
  const [preferredMake, setPreferredMake] = useState("");
  const [saveTemplate, setSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState(() => data.fileName.replace(/\.(xlsx|csv)$/i, "").slice(0, 160));
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [createState, createAction, creating] = useActionState(createFromBoq, { status: "idle" } as CreateState);
  const [clientError, setClientError] = useState<string | null>(null);
  const tabsId = useId();

  const markup = Math.min(500, toNum(markupText));
  const gstPct = Math.min(100, toNum(gstText));
  const byId = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);
  const hay = useMemo(() => catalog.map((c) => `${c.code} ${c.name} ${c.groupName} ${c.size ?? ""} ${c.make ?? ""}`.toLowerCase()), [catalog]);
  const makes = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of catalog) for (const part of (c.make ?? "").split("/")) {
      const t = part.replace(/\bUL\b/g, "").trim();
      if (t) m.set(t.toLowerCase(), t);
    }
    return [...m.values()].sort((a, b) => a.localeCompare(b));
  }, [catalog]);

  const priced = useCallback((r: RowState) => priceRow(r, byId, markup, showCost), [byId, markup, showCost]);

  const totals = useMemo(() => boqTotals(rows.map((r) => {
    const p = priced(r);
    return { include: r.include, qty: p.qty, supplyRate: p.supply, erectionRate: p.erection, costRate: p.cost };
  }), gstPct), [rows, priced, gstPct]);
  const summary = useMemo(() => summariseRows(rows), [rows]);

  const update = useCallback((index: number, patch: Partial<RowState> | ((r: RowState) => Partial<RowState>)) => {
    setRows((prev) => {
      const next = prev.slice();
      const cur = next[index];
      next[index] = { ...cur, ...(typeof patch === "function" ? patch(cur) : patch) };
      return next;
    });
  }, []);

  const pickItem = useCallback((index: number, itemId: number | null) => {
    update(index, (r) => {
      if (itemId == null) {
        // keep the current rates as a starting point for pricing by hand
        const p = priceRow(r, byId, markup, showCost);
        return { itemId: null, chosenByUser: true, status: "none", reason: "Priced by hand", ambiguous: false, supply: numText(p.supply), erection: numText(p.erection) };
      }
      const alt = r.alternatives.find((a) => a.itemId === itemId);
      return {
        itemId, chosenByUser: true, status: "matched", ambiguous: false, score: alt?.score ?? r.score,
        reason: "Chosen by you", supply: null, erection: null,
        unit: r.unit || byId.get(itemId)?.uom || "",
      };
    });
    setPickerFor(null);
  }, [update, byId, markup, showCost]);

  function applyPreferredMake(make: string) {
    setPreferredMake(make);
    if (!make) return;
    const want = make.toLowerCase();
    setRows((prev) => prev.map((r) => {
      if (r.chosenByUser || r.itemId == null) return r;
      const cur = byId.get(r.itemId);
      if (!cur?.make || splitMakes(cur.make).includes(want)) return r;
      const best = r.alternatives.find((a) => {
        const it = byId.get(a.itemId);
        return it != null && splitMakes(it.make).includes(want);
      });
      const curScore = r.alternatives.find((a) => a.itemId === r.itemId)?.score ?? r.score;
      if (!best || best.score < curScore - 5) return r;
      return { ...r, itemId: best.itemId, score: best.score, status: statusForScore(best.score), ambiguous: false, reason: `Preferred make ${make}`, supply: null, erection: null };
    }));
  }

  function buildPayload(intent: "quote" | "template"): CreatePayload {
    return {
      intent, customerId: data.customer.id, projectName, siteLocation, fileName: data.fileName, markupPct: markup, gstPct,
      saveTemplate: intent === "quote" && saveTemplate, templateName: templateName.trim(), rowCount: rows.length,
      // a quote on its own only needs the rows that go on it; a template keeps the zero-quantity rows too
      lines: rows.filter((r) => intent === "template" || saveTemplate || (r.include && toNum(r.qty) > 0)).map((r) => {
        const p = priced(r);
        return {
          sheet: data.sheets[r.sheet]?.name ?? "", rowNo: r.rowNo, section: r.section, boqRef: r.ref, itemId: r.itemId,
          description: r.description, qty: p.qty, uom: r.unit || p.it?.uom || "Nos", supplyRate: round2(p.supply), erectionRate: round2(p.erection),
          remarks: r.remarks, include: r.include,
        };
      }),
    };
  }

  function submit(intent: "quote" | "template") {
    setClientError(null);
    if (intent === "quote" && !rows.some((r) => r.include && toNum(r.qty) > 0)) {
      setClientError("Tick at least one row with a quantity above zero. Rows with zero quantity are not added to a quotation.");
      return;
    }
    if ((intent === "template" || saveTemplate) && !templateName.trim()) {
      setClientError("Give the BOQ template a name.");
      return;
    }
    const fd = new FormData();
    fd.set("payload", JSON.stringify(buildPayload(intent)));
    startTransition(() => createAction(fd));
  }

  const sheet = data.sheets[tab];
  const entries = init.layout[tab] ?? [];
  const visible = entries.filter((e) => {
    if (filter === "all") return true;
    if (e.kind !== "item") return false;
    const r = rows[e.index];
    if (filter === "excluded") return !r.include;
    if (filter === "unmatched") return r.include && r.itemId == null;
    return r.include && r.itemId != null && r.status !== "matched";
  });
  const sheetCounts = useMemo(() => data.sheets.map((_, si) => rows.filter((r) => r.sheet === si).length), [rows, data.sheets]);
  const errorText = clientError ?? (createState.status === "error" ? createState.message : null);


  const filters: { id: Filter; label: string; count: number; attention?: boolean }[] = [
    { id: "all", label: "All rows", count: summary.items },
    { id: "check", label: "Needs a check", count: summary.check, attention: summary.check > 0 },
    { id: "unmatched", label: "Priced by hand", count: summary.unmatched },
    { id: "excluded", label: "Excluded", count: summary.excluded },
  ];
  const colCount = showCost ? 11 : 10;
  const multiSheet = data.sheets.length > 1;
  const footerNote = (
    <div className="flex items-baseline gap-x-3 max-sm:justify-between sm:flex-col">
      <span className="font-display text-heading font-bold tabular-nums text-ink">{money(totals.grand)}</span>
      <span>{totals.lineCount} line{totals.lineCount === 1 ? "" : "s"} in the quotation · incl. GST{showCost && totals.supply > 0 ? ` · margin ${totals.marginPct}%` : ""}</span>
    </div>
  );

  return (
    <FormPage
      width="wide"
      eyebrow="Step 2 of 2"
      title="Check the matches"
      subtitle={`${data.fileName} for ${data.customer.name}. ${summary.items} item rows on ${data.sheets.length} sheet${data.sheets.length === 1 ? "" : "s"}.`}
      back={{ href: "/quotations", label: "Quotations" }}
    >
      <div className="space-y-4">
        <FormSection
          title="Quotation details"
          columns={3}
          aside={<Button type="button" variant="secondary" size="sm" onClick={onReset}><RotateCcw className="icon-sm" aria-hidden /> Upload another file</Button>}
        >
          <Field label="Project name">
            <Input value={projectName} maxLength={200} onChange={(e) => setProjectName(e.target.value)} />
          </Field>
          <Field label="Site location">
            <Input value={siteLocation} maxLength={200} onChange={(e) => setSiteLocation(e.target.value)} />
          </Field>
          {makes.length > 0 && (
            <Field label="Preferred make" hint="Switches matched rows to this make where the catalogue has it">
              <Select value={preferredMake} onChange={(e) => applyPreferredMake(e.target.value)}>
                <option value="">No preference</option>
                {makes.map((m) => <option key={m} value={m}>{m}</option>)}
              </Select>
            </Field>
          )}
          {showCost && (
            <Field label="Markup % on cost" hint="Applies to every auto-priced row">
              <Input type="number" inputMode="decimal" min={0} max={500} step="0.5" value={markupText} className="text-right" onChange={(e) => setMarkupText(e.target.value)} />
            </Field>
          )}
          <Field label="GST %">
            <Input type="number" inputMode="decimal" min={0} max={100} step="0.5" value={gstText} className="text-right" onChange={(e) => setGstText(e.target.value)} />
          </Field>
        </FormSection>

        {data.warnings.length > 0 && (
          <Callout tone="warning" title={`${data.warnings.length} thing${data.warnings.length === 1 ? "" : "s"} to know about this file`}>
            <ul className="list-disc space-y-0.5 pl-5">{data.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          </Callout>
        )}

        <section className="rounded-2xl border border-line bg-surface shadow-sm" aria-labelledby="boq-rows-title">
          <header className="space-y-3 border-b border-line px-4 py-3 sm:px-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <FileSpreadsheet className="icon-sm text-ink-faint" aria-hidden />
                <h2 id="boq-rows-title" className="truncate text-subheading text-ink">BOQ rows</h2>
              </div>
              <p className="flex flex-wrap items-center gap-1.5" aria-live="polite">
                <StatusPill semantic="success" label={`${summary.matched} matched`} />
                <StatusPill semantic="warning" label={`${summary.check} to check`} />
                <StatusPill semantic="danger" label={`${summary.unmatched} unmatched`} />
                <StatusPill semantic="neutral" label={`${summary.excluded} excluded`} />
              </p>
            </div>
            <ClientPills label="Show rows" items={filters} active={filter} onChange={setFilter} />
          </header>

          {multiSheet && (
            <div role="tablist" aria-label="Sheets in this BOQ" className="flex gap-1 overflow-x-auto border-b border-line px-2 sm:px-3">
              {data.sheets.map((s, i) => {
                const on = i === tab;
                return (
                  <button
                    key={s.name + i}
                    id={`${tabsId}-tab${i}`}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    aria-controls={`${tabsId}-panel`}
                    onClick={() => { setTab(i); setPickerFor(null); }}
                    className={cx(
                      "-mb-px inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors",
                      on ? "border-brand-600 text-brand-700 dark:text-brand-300" : "border-transparent text-ink-soft hover:border-line-strong hover:text-ink",
                    )}
                  >
                    {s.name}
                    <span className={cx("rounded-full px-1.5 text-[11px] leading-[18px] tabular-nums",
                      on ? "bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-200" : "bg-muted text-ink-soft")}>{sheetCounts[i]}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div id={`${tabsId}-panel`} role={multiSheet ? "tabpanel" : undefined} aria-labelledby={multiSheet ? `${tabsId}-tab${tab}` : undefined}>
            {sheet?.headerRow != null && (
              <p className="px-4 pt-3 text-caption text-ink-soft sm:px-5">Header found on row {sheet.headerRow}. Row numbers below are the Excel row numbers.</p>
            )}
            {visible.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-soft">No rows on this sheet match this filter. Choose &ldquo;All rows&rdquo; to see everything.</p>
            ) : (
              <LineItemsTable
                caption="BOQ rows"
                className={cx(
                  "mt-2 max-h-[calc(100dvh-14rem)] rounded-none! border-x-0! border-b-0!",
                  // Phones: each row becomes a card.
                  "max-sm:max-h-none max-sm:[&_table]:block max-sm:[&_table]:min-w-0! max-sm:[&_tbody]:block max-sm:[&_thead]:hidden",
                )}
              >
                <thead>
                  <tr>
                    <th className="w-10"><span className="sr-only">Include</span></th>
                    <th className="w-12">Row</th>
                    <th className="w-16">Ref</th>
                    <th>Description</th>
                    <th className={cx(li.num, "w-24")}>Qty</th>
                    <th className="w-20">Unit</th>
                    <th>Matched item</th>
                    {showCost && <th>Latest cost</th>}
                    <th className={cx(li.num, "w-28")}>Supply rate</th>
                    <th className={cx(li.num, "w-24")}>Erection rate</th>
                    <th className={cx(li.num, "w-28")}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((e) => e.kind === "item" ? (
                    <ItemRow
                      key={rows[e.index].key}
                      index={e.index}
                      row={rows[e.index]}
                      markup={markup}
                      showCost={showCost}
                      today={today}
                      catalog={catalog}
                      hay={hay}
                      byId={byId}
                      pickerOpen={pickerFor === rows[e.index].key}
                      onOpenPicker={setPickerFor}
                      onPick={pickItem}
                      onUpdate={update}
                    />
                  ) : (
                    <tr key={`${e.kind}-${e.row.rowNo}`} className="max-sm:block">
                      <td colSpan={colCount} className={cx("max-sm:block max-sm:px-4!", e.kind === "section" ? "bg-surface-2 py-2! font-semibold text-ink" : "text-ink-faint")}>
                        <span className="mr-2 text-caption font-normal tabular-nums text-ink-faint">Row {e.row.rowNo}</span>
                        {e.kind === "section"
                          ? <>{e.row.section ?? e.row.description}</>
                          : <span className="text-caption">Skipped: {e.row.note ?? "not a BOQ item"}. <span className="italic">{e.row.description.replace(/\s*\n\s*/g, " ").slice(0, 110)}{e.row.description.length > 110 ? "…" : ""}</span></span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </LineItemsTable>
            )}
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
          {canTemplate ? (
            <SectionCard title="Save for the next similar job" className="h-fit">
              <label className="flex items-center gap-2 text-sm font-medium text-ink">
                <input type="checkbox" checked={saveTemplate} onChange={(e) => setSaveTemplate(e.target.checked)} className="icon-sm" />
                Also save as a BOQ template
              </label>
              <Field label="Template name" className="mt-3" hint="Keeps the rows, sections and matched items with quantity 0.">
                <Input value={templateName} maxLength={160} onChange={(e) => setTemplateName(e.target.value)} />
              </Field>
            </SectionCard>
          ) : <div className="max-lg:hidden" />}
          <SectionCard title="Totals" description="Only ticked rows with a quantity above zero are counted." className="h-fit">
            <MoneySummary
              rows={[{ label: "Supply", value: totals.supply }, { label: "Erection", value: totals.erection }]}
              tax={totals.tax} taxLabel={`GST (${gstPct}%)`}
              total={totals.grand} totalLabel="Grand total"
            />
            {showCost && (
              <div className="mt-4 rounded-xl bg-muted p-3">
                <p className="mb-2 text-overline uppercase text-ink-faint">Internal</p>
                <SummaryRows rows={[["Material cost", money(totals.cost)], ["Material margin", `${totals.marginPct}%`], ["Lines in quotation", totals.lineCount]]} />
              </div>
            )}
          </SectionCard>
        </div>

        {errorText && <Callout tone="danger" title="Nothing was created yet">{errorText}</Callout>}

        <FormFooter note={footerNote}>
          {canTemplate && (
            <Button type="button" variant="secondary" onClick={() => submit("template")} disabled={creating || !templateName.trim()}>
              Save as template only
            </Button>
          )}
          <Button type="button" onClick={() => submit("quote")} disabled={creating}>
            {creating ? "Creating…" : "Create quotation"}
          </Button>
        </FormFooter>
      </div>
    </FormPage>
  );
}

/** Client-side segmented filter, styled like FilterPills (which is link based). */
function ClientPills<T extends string>({ items, active, onChange, label }: {
  items: { id: T; label: string; count: number; attention?: boolean }[]; active: T; onChange: (id: T) => void; label: string;
}) {
  return (
    <div role="group" aria-label={label} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {items.map((it) => {
        const on = it.id === active;
        return (
          <button
            key={it.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(it.id)}
            className={cx(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors",
              on ? "border-brand-600 bg-brand-600 text-white shadow-xs"
                : it.attention ? "border-warning-line bg-warning-soft text-warning hover:border-warning"
                  : "border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink",
            )}
          >
            {it.label}
            <span className={cx("rounded-full px-1.5 text-[11px] leading-[18px] tabular-nums", on ? "bg-white/20 text-white" : "bg-muted text-ink-soft")}>{it.count}</span>
          </button>
        );
      })}
    </div>
  );
}

function costText(it: ImportCatalogItem, today: string) {
  const parts = [money(it.cost)];
  if (it.costSource === "purchase") {
    parts.push(it.costDate ? fmtDate(it.costDate) : "date not recorded");
    if (it.costVendorName) parts.push(it.costVendorName);
  } else parts.push("List price, not yet purchased");
  const stale = it.costSource === "purchase" && isCostStale(it.costDate, it.volatile, today);
  return { text: parts.join(" · "), stale, age: stale ? costAgeDays(it.costDate, today) : null };
}


const ItemRow = memo(function ItemRow({
  index, row, markup, showCost, today, catalog, hay, byId, pickerOpen, onOpenPicker, onPick, onUpdate,
}: {
  index: number;
  row: RowState;
  markup: number;
  showCost: boolean;
  today: string;
  catalog: readonly ImportCatalogItem[];
  hay: readonly string[];
  byId: Map<number, ImportCatalogItem>;
  pickerOpen: boolean;
  onOpenPicker: (key: string | null) => void;
  onPick: (index: number, itemId: number | null) => void;
  onUpdate: (index: number, patch: Partial<RowState> | ((r: RowState) => Partial<RowState>)) => void;
}) {
  const priced = priceRow(row, byId, markup, showCost);
  const { it } = priced;
  const zeroQty = priced.qty === 0;
  const chip = it == null ? (row.chosenByUser ? STATUS_CHIP.free : STATUS_CHIP.none) : row.chosenByUser ? STATUS_CHIP.chosen : STATUS_CHIP[row.status];
  const label = row.ref ? `row ${row.ref}` : `Excel row ${row.rowNo}`;
  const quickPicks = row.chosenByUser || row.status === "matched" ? [] : row.alternatives.filter((a) => a.itemId !== row.itemId && byId.has(a.itemId)).slice(0, 3);
  const cost = it && showCost && it.cost != null ? costText(it, today) : null;
  const amount = priced.qty * (priced.supply + priced.erection);
  return (
    <tr className={cx(
      "max-sm:grid max-sm:grid-cols-2 max-sm:gap-x-3 max-sm:gap-y-2 max-sm:border-b max-sm:border-line max-sm:px-4 max-sm:py-3",
      !row.include && "opacity-60",
    )}>
      <td className={cx(pc, "max-sm:col-span-2")}>
        <label className="flex items-center gap-2 pt-1.5 max-sm:pt-0">
          <input
            type="checkbox"
            className="icon-sm"
            checked={row.include}
            aria-label={`Include ${label}`}
            onChange={(e) => onUpdate(index, { include: e.target.checked, includeTouched: true })}
          />
          <span className="text-caption text-ink-soft sm:hidden" aria-hidden>Include · Excel row {row.rowNo}{row.ref ? ` · Ref ${row.ref}` : ""}</span>
        </label>
      </td>
      <td className="pt-2.5! text-caption tabular-nums text-ink-faint max-sm:hidden">{row.rowNo}</td>
      <td className="pt-2.5! whitespace-nowrap text-caption max-sm:hidden">{row.ref ?? "-"}</td>
      <td className={cx(pc, "max-sm:col-span-2")}>
        <div className="w-[24rem] whitespace-pre-wrap break-words pt-1 text-[13px] leading-relaxed text-ink max-sm:w-auto">{row.description}</div>
        {row.note && <div className="mt-1 text-caption text-ink-faint">{row.note}</div>}
      </td>
      <td className={cx(pc, li.num, "max-sm:order-1")}>
        <label className="block">
          <PhoneLabel>Qty</PhoneLabel>
          <input
            type="number" inputMode="decimal" min={0} step="any"
            className={cx(li.numInput, "w-24 max-sm:w-full max-sm:border-line", !zeroQty && row.include && "font-semibold text-brand-700 dark:text-brand-300")}
            value={row.qty}
            aria-label={`Quantity for ${label}`}
            onChange={(e) => {
              const v = e.target.value;
              onUpdate(index, (r) => ({ qty: v, include: r.includeTouched ? r.include : toNum(v) > 0 }));
            }}
          />
        </label>
        {zeroQty && !row.include && <div className="mt-1 whitespace-nowrap px-2 text-[11px] text-ink-soft max-sm:text-left">Zero quantity, excluded</div>}
      </td>
      <td className={cx(pc, "max-sm:order-1")}>
        <label className="block">
          <PhoneLabel>Unit</PhoneLabel>
          <input className={cx(li.input, "w-20 max-sm:w-full max-sm:border-line")} maxLength={20} value={row.unit} placeholder={it?.uom ?? "Nos"} aria-label={`Unit for ${label}`} onChange={(e) => onUpdate(index, { unit: e.target.value })} />
        </label>
      </td>
      <td className={cx(pc, "max-sm:col-span-2")}>
        <div className="w-[17rem] pt-1 max-sm:w-auto max-sm:rounded-xl max-sm:bg-surface-2 max-sm:p-2.5">
          {pickerOpen ? (
            <ItemSearch catalog={catalog} hay={hay} onPick={(id) => onPick(index, id)} onCancel={() => onOpenPicker(null)} />
          ) : (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {it ? (
                    <>
                      <div className="text-[13px] font-medium text-ink">{it.name}</div>
                      <div className="text-caption text-ink-soft">{[it.code, it.size, it.make].filter(Boolean).join(" · ")}</div>
                    </>
                  ) : <div className="text-[13px] text-ink-soft">No catalogue item. Price this line by hand.</div>}
                </div>
                <StatusPill semantic={chip.semantic} label={`${chip.label}${it && !row.chosenByUser ? ` ${row.score}` : ""}`} className="shrink-0" />
              </div>
              {row.reason && !row.chosenByUser && <div className="mt-1 text-caption text-ink-faint">{row.reason}</div>}
              {cost && (
                <div className="mt-1 text-caption text-ink-soft sm:hidden">
                  Latest cost {cost.text}
                  {cost.stale && <span className="ml-1 inline-block"><StatusPill semantic="warning" label={`Stale, ${cost.age} days`} noDot /></span>}
                </div>
              )}
              {quickPicks.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {quickPicks.map((a) => {
                    const alt = byId.get(a.itemId);
                    return alt ? (
                      <button key={a.itemId} type="button" onClick={() => onPick(index, a.itemId)}
                        className="max-w-full truncate rounded-md border border-line bg-surface px-1.5 py-0.5 text-left text-[11px] text-ink-soft hover:border-line-strong hover:text-ink max-sm:py-1.5"
                        title={`Use ${alt.name}`}>
                        {alt.name}{alt.make ? `, ${alt.make}` : ""}
                      </button>
                    ) : null;
                  })}
                </div>
              )}
              <div className="mt-1.5 flex gap-1">
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 max-sm:h-9" onClick={() => onOpenPicker(row.key)} aria-label={`Change item for ${label}`}>
                  <Search className="icon-xs" aria-hidden />{it ? "Change" : "Find item"}
                </Button>
                {it && (
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2 max-sm:h-9" onClick={() => onPick(index, null)} aria-label={`Clear item for ${label}`}>
                    <X className="icon-xs" aria-hidden />Clear
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </td>
      {showCost && (
        <td className="max-sm:hidden">
          {cost ? (
            <div className="w-44 pt-1.5 text-caption text-ink-soft">
              {cost.text}
              {cost.stale && <span className="ml-1 inline-block"><StatusPill semantic="warning" label={`Stale, ${cost.age} days`} noDot /></span>}
            </div>
          ) : <span className="inline-block pt-1.5 text-caption text-ink-faint">-</span>}
        </td>
      )}
      <td className={cx(pc, li.num, "max-sm:order-1")}>
        <label className="block">
          <PhoneLabel>Supply rate</PhoneLabel>
          <input
            type="number" inputMode="decimal" min={0} step="any" className={cx(li.numInput, "w-28 max-sm:w-full max-sm:border-line")}
            value={row.supply ?? numText(priced.suggested)}
            aria-label={`Supply rate for ${label}`}
            onChange={(e) => onUpdate(index, { supply: e.target.value })}
          />
        </label>
        {row.supply != null && it && (
          <button type="button" className="mt-1 whitespace-nowrap px-2 text-[11px] font-medium text-brand-700 hover:underline dark:text-brand-300" onClick={() => onUpdate(index, { supply: null })}>
            Use suggested {money(priced.suggested)}
          </button>
        )}
        {row.sourceRate != null && <div className="mt-1 whitespace-nowrap px-2 text-[11px] text-ink-faint max-sm:text-left">Sheet rate {money(row.sourceRate)}</div>}
      </td>
      <td className={cx(pc, li.num, "max-sm:order-1")}>
        <label className="block">
          <PhoneLabel>Erection rate</PhoneLabel>
          <input
            type="number" inputMode="decimal" min={0} step="any" className={cx(li.numInput, "w-24 max-sm:w-full max-sm:border-line")}
            value={row.erection ?? numText(it?.erectionRate ?? 0)}
            aria-label={`Erection rate for ${label}`}
            onChange={(e) => onUpdate(index, { erection: e.target.value })}
          />
        </label>
      </td>
      <td className={cx(pc, li.num, "pt-2.5! whitespace-nowrap font-medium max-sm:order-1 max-sm:col-span-2 max-sm:flex max-sm:justify-between")}>
        <span className="text-caption font-normal text-ink-soft sm:hidden">Amount</span>
        {row.include && priced.qty > 0 ? money(amount) : <span className="text-ink-faint">-</span>}
      </td>
    </tr>
  );
});
