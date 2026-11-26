"use client";
/**
 * Review screen of the consultant BOQ import: sheet tabs, matched items with latest cost (rule 10), editable
 * quantities and rates, live totals (rule 3), then "Create quotation" / "Save as BOQ template".
 */
import { memo, startTransition, useActionState, useCallback, useId, useMemo, useState } from "react";
import { AlertTriangle, CircleAlert, FileSpreadsheet, RotateCcw, Search, X } from "lucide-react";
import { Badge, Button, Card, cx, Field, Input, Select, Table, Td, Th, type Tone } from "@/components/ui";
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

const STATUS_CHIP: Record<MatchStatus | "chosen" | "free", { tone: Tone; label: string }> = {
  matched: { tone: "green", label: "Matched" },
  check: { tone: "amber", label: "Check" },
  none: { tone: "gray", label: "No match" },
  chosen: { tone: "blue", label: "Chosen" },
  free: { tone: "gray", label: "Free text" },
};

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

  return (
    <div className="space-y-6">
      {/* header: file + quotation details */}
      <Card
        title={<span className="inline-flex items-center gap-2"><FileSpreadsheet className="h-4 w-4 text-ink-faint" aria-hidden />{data.fileName}</span>}
        subtitle={`For ${data.customer.name}. ${summary.items} item rows on ${data.sheets.length} sheet${data.sheets.length === 1 ? "" : "s"}.`}
        actions={<Button type="button" variant="secondary" size="sm" onClick={onReset}><RotateCcw className="h-3.5 w-3.5" aria-hidden />Upload another file</Button>}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Project name" className="lg:col-span-2">
            <Input value={projectName} maxLength={200} onChange={(e) => setProjectName(e.target.value)} />
          </Field>
          <Field label="Site location" className="lg:col-span-1">
            <Input value={siteLocation} maxLength={200} onChange={(e) => setSiteLocation(e.target.value)} />
          </Field>
          {showCost && (
            <Field label="Markup % on cost" hint="Applies to every auto-priced row">
              <Input type="number" inputMode="decimal" min={0} max={500} step="0.5" value={markupText} onChange={(e) => setMarkupText(e.target.value)} />
            </Field>
          )}
          <Field label="GST %">
            <Input type="number" inputMode="decimal" min={0} max={100} step="0.5" value={gstText} onChange={(e) => setGstText(e.target.value)} />
          </Field>
          {makes.length > 0 && (
            <Field label="Preferred make" className="sm:col-span-2 lg:col-span-2" hint="Switches matched rows to this make where the catalogue has it">
              <Select value={preferredMake} onChange={(e) => applyPreferredMake(e.target.value)}>
                <option value="">No preference</option>
                {makes.map((m) => <option key={m} value={m}>{m}</option>)}
              </Select>
            </Field>
          )}
        </div>
        {data.warnings.length > 0 && (
          <ul className="mt-4 space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
            {data.warnings.map((w) => (
              <li key={w} className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{w}</li>
            ))}
          </ul>
        )}
      </Card>

      {/* summary chips + filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2" aria-live="polite">
          <Badge tone="green" dot>{summary.matched} matched</Badge>
          <Badge tone="amber" dot>{summary.check} to check</Badge>
          <Badge tone="red" dot>{summary.unmatched} unmatched</Badge>
          <Badge tone="gray" dot>{summary.excluded} excluded</Badge>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <span>Show</span>
          <Select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className="h-8 w-auto py-1 text-[13px]">
            <option value="all">All rows</option>
            <option value="check">Needs a check</option>
            <option value="unmatched">Unmatched (priced by hand)</option>
            <option value="excluded">Excluded</option>
          </Select>
        </label>
      </div>

      {/* sheet tabs */}
      <div role="tablist" aria-label="Sheets in this BOQ" className="-mb-px flex gap-1 overflow-x-auto border-b border-line">
        {data.sheets.map((s, i) => (
          <button
            key={s.name + i}
            id={`${tabsId}-tab${i}`}
            type="button"
            role="tab"
            aria-selected={i === tab}
            aria-controls={`${tabsId}-panel`}
            onClick={() => { setTab(i); setPickerFor(null); }}
            className={cx(
              "shrink-0 whitespace-nowrap rounded-t-lg border border-b-0 px-3 py-2 text-sm font-medium transition-colors",
              i === tab ? "border-line bg-surface text-ink" : "border-transparent text-ink-soft hover:bg-muted hover:text-ink",
            )}
          >
            {s.name} <span className="ml-1 rounded-full bg-muted px-1.5 text-xs text-ink-soft">{sheetCounts[i]}</span>
          </button>
        ))}
      </div>

      <div id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-tab${tab}`}>
        {sheet?.headerRow != null && (
          <p className="mb-2 text-xs text-ink-soft">Header found on row {sheet.headerRow}. Row numbers below are the Excel row numbers.</p>
        )}
        {visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-10 text-center text-sm text-ink-soft">No rows on this sheet match the filter.</div>
        ) : (
          <Table tall>
            <thead>
              <tr>
                <Th className="w-10"><span className="sr-only">Include</span></Th>
                <Th>Row</Th>
                <Th>Ref</Th>
                <Th>Description</Th>
                <Th className="text-right">Qty</Th>
                <Th>Unit</Th>
                <Th>Matched item</Th>
                {showCost && <Th>Latest cost</Th>}
                <Th className="text-right">Supply rate</Th>
                <Th className="text-right">Erection rate</Th>
                <Th className="text-right">Amount</Th>
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
                <tr key={`${e.kind}-${e.row.rowNo}`}>
                  <Td className={cx(e.kind === "section" ? "font-semibold text-ink" : "text-ink-faint")} colSpan={showCost ? 11 : 10}>
                    <span className="mr-2 font-mono text-xs font-normal text-ink-faint">Row {e.row.rowNo}</span>
                    {e.kind === "section"
                      ? <>{e.row.section ?? e.row.description}</>
                      : <span className="text-xs">Skipped: {e.row.note ?? "not a BOQ item"}. <span className="italic">{e.row.description.replace(/\s*\n\s*/g, " ").slice(0, 110)}{e.row.description.length > 110 ? "…" : ""}</span></span>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      {/* totals and actions */}
      <Card title="Totals" subtitle="Only ticked rows with a quantity above zero are counted">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
            <Total label="Supply" value={money(totals.supply)} />
            <Total label="Erection" value={money(totals.erection)} />
            <Total label={`GST ${gstPct}%`} value={money(totals.tax)} />
            <Total label="Grand total" value={money(totals.grand)} strong />
            {showCost && <Total label="Material cost" value={money(totals.cost)} />}
            {showCost && <Total label="Material margin" value={`${totals.marginPct}%`} />}
            <Total label="Lines in quotation" value={String(totals.lineCount)} />
          </dl>
          <div className="flex flex-col gap-3 lg:w-80">
            {canTemplate && (
              <div className="rounded-lg border border-line p-3">
                <label className="flex items-center gap-2 text-sm font-medium text-ink">
                  <input type="checkbox" checked={saveTemplate} onChange={(e) => setSaveTemplate(e.target.checked)} className="h-4 w-4" />
                  Also save as a BOQ template
                </label>
                <label className="mt-2 block">
                  <span className="sr-only">Template name</span>
                  <Input value={templateName} maxLength={160} onChange={(e) => setTemplateName(e.target.value)} placeholder="Template name" />
                </label>
                <p className="mt-1.5 text-xs text-ink-soft">Keeps the rows, sections and matched items with quantity 0, for the next similar job.</p>
              </div>
            )}
            {errorText && (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{errorText}
              </div>
            )}
            <Button type="button" size="lg" onClick={() => submit("quote")} disabled={creating}>
              {creating ? "Creating…" : "Create quotation"}
            </Button>
            {canTemplate && (
              <Button type="button" variant="secondary" onClick={() => submit("template")} disabled={creating || !templateName.trim()}>
                Save as BOQ template only
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

function Total({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className={cx("tabular-nums text-ink", strong ? "text-lg font-bold" : "font-medium")}>{value}</dd>
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
    <tr className={cx(!row.include && "opacity-60")}>
      <Td>
        <input
          type="checkbox"
          className="mt-1 h-4 w-4"
          checked={row.include}
          aria-label={`Include ${label}`}
          onChange={(e) => onUpdate(index, { include: e.target.checked, includeTouched: true })}
        />
      </Td>
      <Td className="font-mono text-xs text-ink-faint">{row.rowNo}</Td>
      <Td className="whitespace-nowrap font-mono text-xs">{row.ref ?? "-"}</Td>
      <Td>
        <div className="w-[24rem] max-w-[70vw] whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink">{row.description}</div>
        {row.note && <div className="mt-1 text-xs text-ink-faint">{row.note}</div>}
      </Td>
      <Td className="text-right">
        <Input
          type="number" inputMode="decimal" min={0} step="any" className="h-8 w-24 text-right"
          value={row.qty}
          aria-label={`Quantity for ${label}`}
          onChange={(e) => {
            const v = e.target.value;
            onUpdate(index, (r) => ({ qty: v, include: r.includeTouched ? r.include : toNum(v) > 0 }));
          }}
        />
        {zeroQty && !row.include && <div className="mt-1 whitespace-nowrap text-[11px] text-ink-soft">zero qty, excluded</div>}
      </Td>
      <Td>
        <Input className="h-8 w-20" maxLength={20} value={row.unit} placeholder={it?.uom ?? "Nos"} aria-label={`Unit for ${label}`} onChange={(e) => onUpdate(index, { unit: e.target.value })} />
      </Td>
      <Td>
        <div className="w-[17rem]">
          {pickerOpen ? (
            <ItemSearch catalog={catalog} hay={hay} onPick={(id) => onPick(index, id)} onCancel={() => onOpenPicker(null)} />
          ) : (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {it ? (
                    <>
                      <div className="text-[13px] font-medium text-ink">{it.name}</div>
                      <div className="text-xs text-ink-soft">{[it.code, it.size, it.make].filter(Boolean).join(" · ")}</div>
                    </>
                  ) : <div className="text-[13px] text-ink-soft">No catalogue item. Price this line by hand.</div>}
                </div>
                <Badge tone={chip.tone} className="shrink-0">{chip.label}{it && !row.chosenByUser ? ` ${row.score}` : ""}</Badge>
              </div>
              {row.reason && !row.chosenByUser && <div className="mt-1 text-xs text-ink-faint">{row.reason}</div>}
              {quickPicks.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {quickPicks.map((a) => {
                    const alt = byId.get(a.itemId);
                    return alt ? (
                      <button key={a.itemId} type="button" onClick={() => onPick(index, a.itemId)}
                        className="max-w-full truncate rounded-md border border-line px-1.5 py-0.5 text-left text-[11px] text-ink-soft hover:border-line-strong hover:text-ink"
                        title={`Use ${alt.name}`}>
                        {alt.name}{alt.make ? `, ${alt.make}` : ""}
                      </button>
                    ) : null;
                  })}
                </div>
              )}
              <div className="mt-1.5 flex gap-1">
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => onOpenPicker(row.key)} aria-label={`Change item for ${label}`}>
                  <Search className="h-3.5 w-3.5" aria-hidden />{it ? "Change" : "Find item"}
                </Button>
                {it && (
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => onPick(index, null)} aria-label={`Clear item for ${label}`}>
                    <X className="h-3.5 w-3.5" aria-hidden />Clear
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </Td>
      {showCost && (
        <Td>
          {cost ? (
            <div className="w-44 text-xs text-ink-soft">
              {cost.text}
              {cost.stale && (
                <span className="ml-1 inline-block rounded-full bg-amber-50 px-1.5 py-px text-[11px] font-medium text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-950/70 dark:text-amber-300 dark:ring-amber-900">
                  Stale, {cost.age} days
                </span>
              )}
            </div>
          ) : <span className="text-xs text-ink-faint">-</span>}
        </Td>
      )}
      <Td className="text-right">
        <Input
          type="number" inputMode="decimal" min={0} step="any" className="h-8 w-28 text-right"
          value={row.supply ?? numText(priced.suggested)}
          aria-label={`Supply rate for ${label}`}
          onChange={(e) => onUpdate(index, { supply: e.target.value })}
        />
        {row.supply != null && it && (
          <button type="button" className="mt-1 whitespace-nowrap text-[11px] text-brand-700 hover:underline dark:text-brand-300" onClick={() => onUpdate(index, { supply: null })}>
            Use suggested {money(priced.suggested)}
          </button>
        )}
        {row.sourceRate != null && <div className="mt-1 whitespace-nowrap text-[11px] text-ink-faint">Sheet rate {money(row.sourceRate)}</div>}
      </Td>
      <Td className="text-right">
        <Input
          type="number" inputMode="decimal" min={0} step="any" className="h-8 w-24 text-right"
          value={row.erection ?? numText(it?.erectionRate ?? 0)}
          aria-label={`Erection rate for ${label}`}
          onChange={(e) => onUpdate(index, { erection: e.target.value })}
        />
      </Td>
      <Td className="whitespace-nowrap text-right tabular-nums">
        {row.include && priced.qty > 0 ? money(amount) : <span className="text-ink-faint">-</span>}
      </Td>
    </tr>
  );
});
