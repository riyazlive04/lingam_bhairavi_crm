/**
 * Consultant BOQ import: sheet parsing, size normalisation, catalogue matching and totals. Maintainer: Sirah Digital.
 *
 * Everything here is pure (no server-only or exceljs imports) so the review screen can reuse the pricing helpers
 * and the unit tests can run it directly. Reading the workbook itself (exceljs) lives in
 * `src/app/(app)/boq-import/_lib/workbook.ts`, which turns each worksheet into a plain grid via `worksheetToGrid`.
 *
 * Pipeline: grid (rows x cells) -> detectHeader -> mapped raw rows -> classify (item / section / skip, joins
 * size-only child rows onto their parent description) -> matchRow (score 0..100 against the item catalogue).
 */
import { round2 } from "./format";
import { computeQuoteTotals, type QuoteTotals } from "./pricing";

// ---------------------------------------------------------------- limits
export const BOQ_MAX_FILE_BYTES = 8 * 1024 * 1024;
export const BOQ_MAX_ITEM_ROWS = 2000;
/** Hard cap on scanned rows / columns per sheet and sheets per workbook (protects against huge or padded files). */
export const BOQ_MAX_SCAN_ROWS = 6000;
export const BOQ_MAX_COLS = 40;
export const BOQ_MAX_SHEETS = 30;
/**
 * Zip-bomb guard: exceljs inflates the whole workbook in memory before we can cap rows, so the declared uncompressed
 * size of all zip entries is checked first (a real 8 MB BOQ is far below this).
 */
export const BOQ_MAX_UNZIPPED_BYTES = 120 * 1024 * 1024;
export const BOQ_MAX_ZIP_ENTRIES = 2000;
/** Quotation line descriptions longer than this are cut (the quotation editor accepts up to 4,000 characters). */
export const BOQ_MAX_DESCRIPTION = 4000;
export const MATCH_AUTO = 70;
export const MATCH_CHECK = 40;

// ---------------------------------------------------------------- types
export type GridCell = string | number | null;
/** grid[r][c], zero based. Row number shown to the user = r + 1. */
export type Grid = GridCell[][];
export type RowKind = "item" | "section" | "skip";

/** 1-based column numbers (null = not present on this sheet). */
export type BoqColumns = {
  ref: number | null;
  description: number;
  /** a short title column next to the real description (e.g. "MS PIPE" beside the full specification) */
  title: number | null;
  qty: number | null;
  unit: number | null;
  rate: number | null;
  erectionRate: number | null;
  remarks: number | null;
};

export type BoqRow = {
  rowNo: number;
  ref: string | null;
  section: string | null;
  description: string;
  qty: number | null;
  unit: string | null;
  sourceRate: number | null;
  remarks: string | null;
  kind: RowKind;
  /** why a row was skipped or how it was built, in plain words */
  note?: string;
};

export type BoqSheet = { name: string; headerRow: number | null; columns: BoqColumns | null; rows: BoqRow[] };
export type BoqParseResult = { sheets: BoqSheet[]; warnings: string[] };

// ---------------------------------------------------------------- text helpers
const CONTROL_CHARS = new RegExp("[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200D\u2028\u2029\uFEFF]", "g");

/** Removes control / zero-width characters, normalises line breaks and runs of spaces. Keeps the wording. */
export function cleanText(v: unknown): string {
  if (v == null) return "";
  const s = (typeof v === "string" ? v : String(v)).replace(/\r\n?/g, "\n").replace(/\t/g, " ").replace(CONTROL_CHARS, "");
  return s
    .split("\n")
    .map((l) => l.replace(/[   - 　]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Single-line, length-limited text (refs, units, section labels). */
export function shortText(v: unknown, max: number): string | null {
  const s = cleanText(v).replace(/\s*\n\s*/g, " ");
  return s ? s.slice(0, max) : null;
}

/** Number formatting for formula refs: 1.2000000000000002 -> "1.2". */
function fmtNum(n: number): string {
  return String(Number(n.toFixed(6)));
}

const QTY_UNIT = /^(nos?|numbers?|mtrs?|mts?|m|rmt|r\.?\s*m\.?|rm|lm|rmtr|rmts|metres?|meters?|sets?|kgs?|ltrs?|litres?|sqm|sq\.?\s*m|sq\.?\s*mt|cum|cu\.?\s*m|lots?|ls|pairs?|each|ea|pcs?|pieces?|jobs?|runs?|lengths?|points?|pts?|units?|kits?|bags?|lump\s*sum)$/i;
const QTY_WORD_ONE = /^(ls|l\.s\.?|lump\s*-?\s*sum|lumpsum|lot|job|set)$/i;

/**
 * Reads a quantity or rate that may be typed as text: 12, "12", "1,200", "12 Nos", "Rs. 1,250.50", "1 Lot".
 * Returns null for blanks and words like "-" / "NIL". `unit` is any unit word typed next to the number.
 */
export function parseNumberish(v: GridCell | undefined): { value: number; unit: string | null } | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? { value: v, unit: null } : null;
  const s = cleanText(v).replace(/\s*\n\s*/g, " ");
  if (!s) return null;
  if (QTY_WORD_ONE.test(s)) return { value: 1, unit: s.toUpperCase() === "LOT" ? "Lot" : s };
  const m = /^(?:rs\.?|inr|₹)?\s*(-?\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|-?\d+(?:\.\d+)?|-?\.\d+)\s*(?:\/-)?\s*([a-z][a-z.\s]{0,14})?$/i.exec(s);
  if (!m) return null;
  const value = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  const unit = m[2] ? m[2].trim().replace(/\.$/, "") : null;
  // only quantity units count ("12 Nos", "30 Rmt"); "25NB" or "150 mm" is a size, not a number
  if (unit && !QTY_UNIT.test(unit)) return null;
  return { value, unit: unit || null };
}

function cellStr(v: GridCell | undefined): string {
  if (v == null) return "";
  return typeof v === "number" ? fmtNum(v) : cleanText(v);
}

// ---------------------------------------------------------------- exceljs adapter (structural types, no import)
/** The parts of an exceljs Cell we read. */
export interface CellLike { value: unknown; address: string; isMerged?: boolean; master?: { address: string } }
/** The parts of an exceljs Worksheet we read. */
export interface WorksheetLike {
  name: string;
  state?: string;
  rowCount: number;
  columnCount: number;
  getRow(n: number): { getCell(c: number): CellLike };
}

/**
 * Plain value of an exceljs cell value. Formulas are never evaluated: we read the cached result Excel saved.
 * Rich text is joined, hyperlinks give their text, errors (#REF!) and missing results give null.
 */
export function cellValueToGrid(v: unknown, depth = 0): GridCell {
  if (v == null || depth > 3) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") return cleanText(v) || null;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) {
      return cleanText((o.richText as { text?: unknown }[]).map((r) => (typeof r?.text === "string" ? r.text : "")).join("")) || null;
    }
    if ("formula" in o || "sharedFormula" in o) return cellValueToGrid(o.result, depth + 1);
    if ("error" in o) return null;
    if ("text" in o) return cellValueToGrid(o.text, depth + 1);
    if ("result" in o) return cellValueToGrid(o.result, depth + 1);
  }
  return null;
}

/** Worksheet to grid. Cells covered by a merge (other than its top-left cell) read as empty so text is not repeated. */
export function worksheetToGrid(ws: WorksheetLike): Grid {
  const rows = Math.min(ws.rowCount || 0, BOQ_MAX_SCAN_ROWS);
  const cols = Math.min(Math.max(ws.columnCount || 0, 1), BOQ_MAX_COLS);
  const grid: Grid = [];
  for (let r = 1; r <= rows; r++) {
    const row = ws.getRow(r);
    const out: GridCell[] = [];
    for (let c = 1; c <= cols; c++) {
      const cell = row.getCell(c);
      if (cell.isMerged && cell.master && cell.master.address !== cell.address) out.push(null);
      else out.push(cellValueToGrid(cell.value));
    }
    grid.push(out);
  }
  return grid;
}

// ---------------------------------------------------------------- CSV
/** RFC 4180 style CSV (quotes, doubled quotes, line breaks inside quotes). Detects comma, semicolon or tab. */
export function parseCsv(text: string): Grid {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.slice(0, src.indexOf("\n") === -1 ? src.length : src.indexOf("\n"));
  const counts = { ",": 0, ";": 0, "\t": 0 } as Record<string, number>;
  let q = false;
  for (const ch of firstLine) {
    if (ch === '"') q = !q;
    else if (!q && ch in counts) counts[ch]++;
  }
  const [bestDelim, bestCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const delim = bestCount > 0 ? bestDelim : ",";
  const rows: Grid = [];
  let row: GridCell[] = [];
  let field = "";
  let inQ = false;
  const pushField = () => { row.push(cleanText(field) || null); field = ""; };
  const pushRow = () => { pushField(); if (row.length > BOQ_MAX_COLS) row = row.slice(0, BOQ_MAX_COLS); rows.push(row); row = []; };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQ) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += ch;
    } else if (ch === '"' && field.trim() === "") { field = ""; inQ = true; }
    else if (ch === delim) pushField();
    else if (ch === "\n") { pushRow(); if (rows.length >= BOQ_MAX_SCAN_ROWS) return rows; }
    else if (ch !== "\r") field += ch;
  }
  if (field !== "" || row.length) pushRow();
  return rows;
}

// ---------------------------------------------------------------- header detection
const H_REF = /^(s\.?\s*no\.?|sl\.?\s*no\.?|sr\.?\s*no\.?|si\.?\s*no\.?|serial\s*(no\.?|number)?|boq\s*(ref|no|item|sl)\.?(\s*no\.?)?|ref(erence)?\.?(\s*no\.?)?|item\s*(no|code|ref)\.?|no\.?|#)$/i;
const H_DESC = /\b(description|descriptions|item|items|particulars?|specifications?|details|scope\s*of\s*work)\b/i;
const H_QTY = /\b(qty|qnty|qty\.|quantity|quantities|nos)\b/i;
const H_UNIT = /\b(uom|u\.o\.m\.?|unit|units|u\/m)\b/i;
const H_RATE = /\b(rate|rates|unit\s*price|price)\b/i;
const H_AMOUNT = /\b(amount|amt|total|value)\b/i;
const H_REMARKS = /\b(remarks?|notes?|comments?)\b/i;
const H_ERECTION = /\b(erection|installation|install|labour|labor|i\s*&\s*c|e\s*&\s*c|fixing)\b/i;

type HeaderKind = "ref" | "description" | "qty" | "unit" | "rate" | "amount" | "remarks";

function headerKind(raw: GridCell | undefined): HeaderKind | null {
  if (raw == null || typeof raw === "number") return null;
  const s = cleanText(raw).replace(/\s+/g, " ").replace(/[:*]+$/, "").trim();
  if (!s || s.length > 40) return null;
  if (H_REF.test(s)) return "ref";
  if (H_QTY.test(s)) return "qty";
  if (H_RATE.test(s)) return "rate";
  if (H_UNIT.test(s)) return "unit";
  if (H_AMOUNT.test(s)) return "amount";
  if (H_REMARKS.test(s)) return "remarks";
  if (H_DESC.test(s)) return "description";
  return null;
}

/**
 * Finds the header row: the first row within the first 15 that has a description-like header and a
 * quantity-like or unit-like header. Returns the 1-based header row and column map, or null.
 */
export function detectHeader(grid: Grid): { headerRow: number; columns: BoqColumns } | null {
  const limit = Math.min(grid.length, 15);
  for (let r = 0; r < limit; r++) {
    const row = grid[r] ?? [];
    const kinds = row.map((c) => headerKind(c));
    const descIdx = kinds.indexOf("description");
    if (descIdx === -1 || (!kinds.includes("qty") && !kinds.includes("unit"))) continue;
    const first = (k: HeaderKind) => { const i = kinds.indexOf(k); return i === -1 ? null : i + 1; };
    const rateCols = kinds.flatMap((k, i) => (k === "rate" ? [i] : []));
    let rate: number | null = null;
    let erectionRate: number | null = null;
    const above = r > 0 ? grid[r - 1] ?? [] : [];
    for (const i of rateCols) {
      // Rate columns are usually grouped under a merged "SUPPLY" / "ERECTION" banner on the row above.
      const label = `${cellStr(above[i])} ${cellStr(above[i - 1])} ${cellStr(row[i])}`;
      const ownBanner = cellStr(above[i]) || cellStr(row[i]);
      if (H_ERECTION.test(ownBanner) || (!cellStr(above[i]) && H_ERECTION.test(label) && !/supply/i.test(cellStr(above[i - 1])))) {
        if (erectionRate == null) erectionRate = i + 1;
      } else if (rate == null) rate = i + 1;
      else if (erectionRate == null) erectionRate = i + 1;
    }
    // ref is the left-most ref-like column before the description (S.NO / BOQ Ref)
    let ref = first("ref");
    if (ref == null && descIdx > 0 && !kinds[descIdx - 1]) ref = descIdx; // unlabelled column just left of the description
    return {
      headerRow: r + 1,
      columns: { ref, description: descIdx + 1, title: null, qty: first("qty"), unit: first("unit"), rate, erectionRate, remarks: first("remarks") },
    };
  }
  return null;
}

/** Fallback when no header row is found: longest-text column is the description, first mostly-numeric column after it is qty. */
function guessColumns(grid: Grid): BoqColumns | null {
  const sample = grid.slice(0, 300);
  const width = Math.min(BOQ_MAX_COLS, Math.max(0, ...sample.map((r) => r.length)));
  if (!width) return null;
  let best = -1, bestLen = 0;
  for (let c = 0; c < width; c++) {
    let len = 0;
    for (const r of sample) if (typeof r[c] === "string") len += (r[c] as string).length;
    if (len > bestLen) { bestLen = len; best = c; }
  }
  if (best === -1 || bestLen < 40) return null;
  let qty: number | null = null;
  for (let c = best + 1; c < width && qty == null; c++) {
    let nums = 0, filled = 0;
    for (const r of sample) if (r[c] != null) { filled++; if (parseNumberish(r[c])) nums++; }
    if (filled >= 2 && nums / filled >= 0.7) qty = c + 1;
  }
  return { ref: best > 0 ? best : null, description: best + 1, title: null, qty, unit: qty != null && qty < width ? qty + 1 : null, rate: null, erectionRate: null, remarks: null };
}

// ---------------------------------------------------------------- row classification
const TOTAL_RX = /^(sub[\s-]*total|total|grand\s*total|net\s*total|g\.?\s*total|carried\s*(over|forward)|brought\s*forward|b\/f|c\/f)\b|\b(carried\s*(over|forward)\s*to|total\s*carried)\b/i;

export function isTotalText(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && t.length <= 90 && TOTAL_RX.test(t);
}

const ENUM_PREFIX = /^(\(?[a-z]{1,2}\)|\(?[ivx]+\)|\d+[).])\s+/i;
const SIZE_ONLY_RX = [
  // 25NB, 25 mm, 150 mm dia., DN 100, 1", 1 1/2", 3/4 inch, 6 Kg, 9 Ltr, 2.5 sq mm
  /^(?:size\s*[:=]?\s*)?(?:dn\s*|ø\s*|⌀\s*)?(?:\d+(?:\.\d+)?|\d+\s*\/\s*\d+|\d+\s+\d\s*\/\s*\d)\s*(?:mm|nb|dn|"|''|”|inch(?:es)?|cm|mtrs?|m|kgs?|ltrs?|litres?|l|sq\.?\s*mm|sqmm|mm2|mm²)?\.?\s*(?:dia(?:meter)?\.?|nb|ø)?\s*(?:\(\s*\d+\s*(?:mm|nb|"|inch)\s*\))?$/i,
  /^(?:dn|ø|⌀)\s*\d{2,3}$/i,
  // cable sizes: 2C x 1.5 sq mm, 4 core x 2.5 sqmm
  /^\d+(?:\.\d+)?\s*(?:c|core)\s*[x×*]\s*\d+(?:\.\d+)?\s*(?:sq\.?\s*mm|sqmm|sq\.?\s*m|mm2|mm²)?\.?$/i,
  // dimensions: 150 x 100, 100 x 50 mm
  /^\d+(?:\.\d+)?\s*(?:mm)?\s*[x×*]\s*\d+(?:\.\d+)?\s*(?:mm|nb)?\.?$/i,
];

/** True for text that is only a size ("25NB", "150 mm dia.", "1 1/2\"", "2C x 1.5 sq mm"). */
export function isSizeOnly(text: string): boolean {
  const t = text.trim().replace(ENUM_PREFIX, "").replace(/[.,;:]+$/, "").trim();
  if (!t || t.length > 30) return false;
  return SIZE_ONLY_RX.some((rx) => rx.test(t));
}

const LONG_TEXT = 60;
const isLong = (t: string) => t.length >= LONG_TEXT;

function isSectionLike(ref: string | null, text: string, hasPrevItem: boolean): boolean {
  if (text.length > 100) return false;
  if (ref && /^([A-Z]{1,2}|[IVXLC]+)\.?$/i.test(ref)) return true;
  const letters = text.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 4 && letters === letters.toUpperCase() && text.length <= 90) return true;
  if (/:$/.test(text) && text.length <= 80) return true;
  if (!ref && text.length < 60 && (!hasPrevItem || (/^[A-Z][a-z]/.test(text) && !/\d/.test(text)))) return true;
  return false;
}

type RawRow = {
  rowNo: number;
  ref: string | null;
  description: string;
  qty: number | null;
  unit: string | null;
  rate: number | null;
  erectionRate: number | null;
  remarks: string | null;
};

/** Ref cell text: formula results like 1.2000000000000002 become "1.2"; header repeats ("S.NO") are dropped. */
function refText(v: GridCell | undefined, headerRef: string | null): string | null {
  if (v == null) return null;
  const s = typeof v === "number" ? fmtNum(v) : shortText(v, 40);
  if (!s) return null;
  if (headerRef && s.toLowerCase().replace(/\s+/g, "") === headerRef.toLowerCase().replace(/\s+/g, "")) return null;
  if (H_REF.test(s) && /[a-z]{2}/i.test(s)) return null; // "S.NO" repeated on page breaks
  return s.slice(0, 20);
}

/**
 * Turns mapped raw rows into items, sections and skipped rows.
 * - total rows ("Total", "Grand Total", "Carried over to summary") are skipped
 * - a row that only gives a ref ("A") or a short heading with no quantity becomes the section for the rows below
 * - size-only rows ("25NB") under a long description get that description plus the size; the parent row is skipped
 * - short rows under a long un-numbered description (a preamble) get the preamble in front of their own text
 * - a short un-numbered fragment right after an item ("1 run of cable") is added to that item's description
 */
export function classifyRows(raw: RawRow[]): BoqRow[] {
  const out: BoqRow[] = [];
  let section: string | null = null;
  let parent: { row: BoqRow; hasRef: boolean; children: number } | null = null;
  let lastItem: BoqRow | null = null;
  const closeParent = () => {
    if (parent && parent.children > 0) {
      parent.row.kind = "skip";
      parent.row.note = `Heading text, added to the ${parent.children} row${parent.children === 1 ? "" : "s"} below`;
    }
    parent = null;
  };
  const base = (r: RawRow) => ({ rowNo: r.rowNo, ref: r.ref, section, qty: r.qty, unit: r.unit, sourceRate: r.rate, remarks: r.remarks });

  for (const r of raw) {
    const text = r.description;
    if (!text && !r.ref && r.qty == null) continue; // blank row
    if (isTotalText(text) || (r.ref != null && isTotalText(r.ref))) {
      closeParent();
      lastItem = null;
      out.push({ ...base(r), description: text || r.ref || "", kind: "skip", note: "Total row" });
      continue;
    }
    if (!text) {
      if (r.ref && r.qty == null) {
        closeParent();
        lastItem = null;
        section = r.ref.slice(0, 120);
        out.push({ ...base(r), section, description: r.ref, kind: "section" });
      } else {
        out.push({ ...base(r), description: r.ref ?? "", kind: "skip", note: "No description on this row" });
      }
      continue;
    }
    const hasQty = r.qty != null && r.qty !== 0;
    const p = parent as { row: BoqRow; hasRef: boolean; children: number } | null;
    // 1. size-only child of a long description ("MS PIPE: Supply of..." then "25NB", "32NB")
    if (p && isSizeOnly(text)) {
      p.children++;
      const item: BoqRow = { ...base(r), ref: r.ref ?? p.row.ref, description: `${p.row.description}\n${text}`, kind: "item", note: "Description joined from the heading row above" };
      out.push(item);
      lastItem = item;
      continue;
    }
    // 2. section heading
    if (!hasQty && r.rate == null && isSectionLike(r.ref, text, lastItem != null)) {
      closeParent();
      lastItem = null;
      section = [r.ref, text.replace(/\s*\n\s*/g, " ")].filter(Boolean).join(" ").replace(/:$/, "").slice(0, 120);
      out.push({ ...base(r), section, description: text, kind: "section" });
      continue;
    }
    // 3. short line under an un-numbered preamble ("Supply of addressable panel..." then "A.1 | 2 Loop Panel.")
    if (p && !p.hasRef && !isLong(text)) {
      p.children++;
      const item: BoqRow = { ...base(r), description: `${p.row.description}\n${text}`, kind: "item", note: "Description joined from the heading row above" };
      out.push(item);
      lastItem = item;
      continue;
    }
    // 4. continuation fragment of the previous item
    if (!r.ref && !hasQty && lastItem && !isLong(text) && /^[a-z0-9(&,+]/.test(text)) {
      lastItem.description = `${lastItem.description}\n${text}`;
      continue;
    }
    // 5. plain item
    const item: BoqRow = { ...base(r), description: text, kind: "item" };
    out.push(item);
    lastItem = item;
    if (!hasQty && isLong(text)) {
      closeParent();
      parent = { row: item, hasRef: r.ref != null, children: 0 };
    } else {
      closeParent();
    }
  }
  closeParent();
  return out;
}

/** Share of non-empty cells in a column (after the header) that are long text rather than numbers. */
function columnProfile(grid: Grid, from: number, col: number | null) {
  let text = 0, nums = 0, len = 0, filled = 0;
  if (col == null) return { text, nums, avgLen: 0, filled };
  for (let r = from; r < Math.min(grid.length, from + 400); r++) {
    const v = grid[r]?.[col - 1];
    if (v == null) continue;
    filled++;
    if (parseNumberish(v)) nums++;
    else if (typeof v === "string") { text++; len += v.length; }
  }
  return { text, nums, avgLen: text ? len / text : 0, filled };
}

/** Parses one sheet's grid into BOQ rows. Pure; used for both .xlsx sheets and .csv files. */
export function parseBoqGrid(name: string, grid: Grid, warnings: string[] = []): BoqSheet {
  const found = detectHeader(grid);
  let headerRow: number | null = found?.headerRow ?? null;
  let columns: BoqColumns | null = found?.columns ?? null;
  if (!columns) {
    columns = guessColumns(grid);
    headerRow = null;
    if (!columns) return { name, headerRow: null, columns: null, rows: [] };
    warnings.push(`Sheet "${name}": no header row with Description and Quantity was found, so the columns were guessed. Please check the rows carefully.`);
  }
  const start = headerRow ?? 0; // zero-based index of the first data row
  // Layout fix: some consultants keep a short title under "Description" and the full text under "Quantity".
  const qtyProf = columnProfile(grid, start, columns.qty);
  const descProf = columnProfile(grid, start, columns.description);
  if (columns.qty != null && qtyProf.text >= 3 && qtyProf.text > qtyProf.nums * 2 && qtyProf.avgLen > descProf.avgLen) {
    columns = { ...columns, title: columns.description, description: columns.qty, qty: null };
    warnings.push(`Sheet "${name}": the Quantity column holds the descriptions, so they were read from there and quantities were left empty. Enter the quantities on the review screen.`);
  }
  const headerRefText = headerRow && columns.ref ? cellStr(grid[headerRow - 1]?.[columns.ref - 1]) : null;
  const raw: RawRow[] = [];
  for (let r = start; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const at = (c: number | null) => (c == null ? null : row[c - 1] ?? null);
    let description = cleanText(cellStr(at(columns.description)));
    const title = columns.title ? cleanText(cellStr(at(columns.title))) : "";
    if (!description && title) description = title;
    // repeated header rows on later pages
    if (headerKind(at(columns.description)) === "description" && (columns.qty == null || headerKind(at(columns.qty)) === "qty")) continue;
    const q = parseNumberish(at(columns.qty));
    const unitCell = shortText(at(columns.unit), 20);
    const rate = parseNumberish(at(columns.rate));
    const erection = parseNumberish(at(columns.erectionRate));
    raw.push({
      rowNo: r + 1,
      ref: refText(at(columns.ref), headerRefText),
      description,
      qty: q ? Math.max(0, q.value) : null,
      unit: unitCell && !parseNumberish(unitCell) ? unitCell : q?.unit ? q.unit.slice(0, 20) : null,
      rate: rate && rate.value > 0 ? rate.value : null,
      erectionRate: erection && erection.value > 0 ? erection.value : null,
      remarks: shortText(at(columns.remarks), 1000),
    });
  }
  const rows = classifyRows(raw).map((row) => (row.description.length > BOQ_MAX_DESCRIPTION
    ? { ...row, description: row.description.slice(0, BOQ_MAX_DESCRIPTION - 1) + "…" }
    : row));
  return { name, headerRow, columns, rows };
}

/** Parses several sheets, enforcing the 2,000 item-row cap across the whole file. */
export function parseBoqSheets(sheets: { name: string; grid: Grid }[]): BoqParseResult {
  const warnings: string[] = [];
  const out: BoqSheet[] = [];
  let items = 0;
  for (const s of sheets.slice(0, BOQ_MAX_SHEETS)) {
    const sheet = parseBoqGrid(s.name, s.grid, warnings);
    if (!sheet.rows.some((r) => r.kind === "item")) {
      if (s.grid.some((r) => r.some((c) => c != null))) warnings.push(`Sheet "${s.name}" has no BOQ rows we could read, so it was left out.`);
      continue;
    }
    const kept: BoqRow[] = [];
    for (const r of sheet.rows) {
      if (r.kind === "item") {
        if (items >= BOQ_MAX_ITEM_ROWS) continue;
        items++;
      }
      kept.push(r);
    }
    out.push({ ...sheet, rows: kept });
    if (items >= BOQ_MAX_ITEM_ROWS) {
      warnings.push(`Only the first ${BOQ_MAX_ITEM_ROWS.toLocaleString("en-IN")} item rows were imported. Split very large BOQs into smaller files.`);
      break;
    }
  }
  if (sheets.length > BOQ_MAX_SHEETS) warnings.push(`Only the first ${BOQ_MAX_SHEETS} sheets were read.`);
  return { sheets: out, warnings };
}

// ---------------------------------------------------------------- size normalisation
const NB_SIZES = new Set([15, 20, 25, 32, 40, 50, 65, 80, 90, 100, 125, 150, 200, 250, 300, 350, 400, 450, 500, 600]);
const INCH_NB: Record<string, number> = {
  "0.5": 15, "0.75": 20, "1": 25, "1.25": 32, "1.5": 40, "2": 50, "2.5": 65, "3": 80, "4": 100, "5": 125, "6": 150, "8": 200,
  "10": 250, "12": 300, "14": 350, "16": 400, "18": 450, "20": 500, "24": 600,
};
const n2 = (s: string) => String(Number(Number(s).toFixed(3)));

function inchValue(s: string): number | null {
  const t = s.trim();
  let m = /^(\d+)\s+(\d)\s*\/\s*(\d)$/.exec(t);
  if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  m = /^(\d)\s*\/\s*(\d)$/.exec(t);
  if (m) return Number(m[1]) / Number(m[2]);
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

const mmToken = (v: string) => (NB_SIZES.has(Number(v)) ? `${Number(v)}NB` : `${n2(v)}MM`);

type SizeRule = { rx: RegExp; tok: (m: RegExpExecArray) => string | null };
const SIZE_RULES: SizeRule[] = [
  { rx: /(\d+(?:\.\d+)?)\s*(?:c|core)?\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(?:sq\.?\s*mm|sqmm|sq\.?\s*m|sqm|mm2|mm²|sq)(?![a-z])/gi, tok: (m) => `${n2(m[1])}CX${n2(m[2])}` },
  { rx: /\bdn\s*-?\s*(\d{2,3})(?!\d)/gi, tok: (m) => mmToken(m[1]) },
  { rx: /(\d+(?:\.\d+)?)\s*(?:mm|nb|millimet(?:er|re)s?)(?![a-z])/gi, tok: (m) => mmToken(m[1]) },
  { rx: /(\d+\s+\d\s*\/\s*\d|\d\s*\/\s*\d|\d+(?:\.\d+)?)\s*(?:"|''|”|inch(?:es)?(?![a-z]))/gi, tok: (m) => { const v = inchValue(m[1]); if (v == null) return null; const nb = INCH_NB[n2(String(v))]; return nb ? `${nb}NB` : `${n2(String(v))}IN`; } },
  { rx: /(\d+(?:\.\d+)?)\s*kgs?(?![a-z/])/gi, tok: (m) => `${n2(m[1])}KG` },
  { rx: /(\d+(?:\.\d+)?)\s*lpm(?![a-z])/gi, tok: (m) => `${n2(m[1])}LPM` },
  { rx: /(\d+(?:\.\d+)?)\s*(?:ltrs?|litres?|liters?|l)(?![a-z/])/gi, tok: (m) => `${n2(m[1])}L` },
  { rx: /(\d+)\s*loops?(?![a-z])/gi, tok: (m) => `${Number(m[1])}LOOP` },
  { rx: /(\d+)\s*zones?(?![a-z])/gi, tok: (m) => `${Number(m[1])}ZONE` },
  { rx: /(\d+(?:\.\d+)?)\s*(?:w|watts?)(?![a-z])/gi, tok: (m) => `${n2(m[1])}W` },
  { rx: /(\d+(?:\.\d+)?)\s*(?:cum|cu\.?\s*m(?![a-z])|kl(?![a-z]))/gi, tok: (m) => `${n2(m[1])}CUM` },
];

/**
 * Sizes mentioned in a text, normalised and in reading order (last mention last):
 * "150 mm dia" -> 150NB, 1" -> 25NB, "DN 100" -> 100NB, "2C x 1.5 sq mm" -> 2CX1.5, "6.0 kg" -> 6KG,
 * "9 Ltr" -> 9L, "2 Loop" -> 2LOOP, "6 watt" -> 6W, "63 mm" -> 63MM (not a pipe size).
 */
export function extractSizes(text: string | null | undefined): string[] {
  if (!text) return [];
  let work = text;
  const found: { pos: number; tok: string }[] = [];
  for (const rule of SIZE_RULES) {
    rule.rx.lastIndex = 0;
    let m: RegExpExecArray | null;
    const spans: [number, number][] = [];
    while ((m = rule.rx.exec(work))) {
      const tok = rule.tok(m);
      if (tok) found.push({ pos: m.index, tok });
      spans.push([m.index, m.index + m[0].length]);
      if (m[0].length === 0) rule.rx.lastIndex++;
    }
    for (const [a, b] of spans) work = work.slice(0, a) + " ".repeat(b - a) + work.slice(b);
  }
  found.sort((a, b) => a.pos - b.pos);
  // keep the last mention of each size so "the size at the end" stays last
  const last = new Map<string, number>();
  found.forEach((f, i) => last.set(f.tok, i));
  return found.filter((f, i) => last.get(f.tok) === i).map((f) => f.tok);
}

/** Normalises one size label ("150 mm dia" -> "150NB", "1\"" -> "25NB"); null when no size is recognised. */
export function normaliseSize(text: string | null | undefined): string | null {
  const s = extractSizes(text);
  return s.length ? s[s.length - 1] : null;
}

// ---------------------------------------------------------------- item groups (families)
type Family = { key: string; parent?: string; weight?: 1 | 2; desc: RegExp; item?: RegExp; requires?: RegExp };

/** Ordered list: item-side regexes are tried top to bottom, so specific groups come before generic ones. */
const FAMILIES: Family[] = [
  { key: "pipe_gi", parent: "pipe", desc: /\b(?:g\.\s?i\.?|gi|galvani[sz]ed)\s+(?:[a-z.]+\s+){0,3}pipes?\b|\bpipes?\b[^.\n]{0,30}\(\s*gi\b|\bgi\s+class\b/i, item: /^pipe gi\b/i },
  { key: "pipe_ms", parent: "pipe", desc: /\b(?:m\.\s?s\.?|ms|mild\s+steel|black\s+steel|erw|welded\s+mild\s+steel)\s+(?:[a-z.]+\s+){0,4}pipes?\b/i, item: /^pipe ms\b/i },
  { key: "exhaust_pipe", desc: /exhaust\s+pipe/i, item: /^exhaust pipe/i },
  { key: "elbow", weight: 1, desc: /\belbows?\b/i, item: /^elbow\b/i },
  { key: "reducer", weight: 1, desc: /\breducers?\b/i, item: /^reducer\b/i },
  { key: "butterfly_valve", parent: "valve", desc: /butterfly\s*valves?/i, item: /^butterfly valve$/i },
  { key: "gate_valve", parent: "valve", desc: /(?:sluice|gate)\s*(?:\/\s*(?:gate|sluice)\s*)?valves?|\bsluice\b/i, item: /^gate valve/i },
  { key: "ball_valve", parent: "valve", desc: /ball\s*valves?/i, item: /^ball valve/i },
  { key: "nrv", parent: "valve", desc: /non[\s-]*return|\bnrv\b|check\s*valves?|dual\s*plate/i, item: /^nrv$/i },
  { key: "y_strainer", desc: /\by[\s-]*(?:type\s*)?strainers?/i, item: /^y\s*strainer$/i },
  { key: "bellows", desc: /bellows|expansion\s*joints?|vibration\s*eliminators?/i, item: /^bellows/i },
  { key: "foot_valve", parent: "valve", desc: /foot\s*valves?/i, item: /^foot valve/i },
  { key: "air_release", desc: /air\s*release/i, item: /^air release/i },
  { key: "pressure_release", desc: /pressure\s*(?:release|relief)\s*valves?/i, item: /^pressure release/i },
  { key: "icv", desc: /installation\s*control|alarm\s*valves?/i, item: /^installation control valve/i },
  { key: "orifice", desc: /orifice/i, item: /^orifice/i },
  { key: "itac", desc: /inspect\w*\s*(?:&|and)\s*test\w*\s*assembl|test\s*assembl|inspector'?s?\s*test/i, item: /^inspecting & testing assembly/i },
  { key: "flow_switch", desc: /flow\s*(?:switch\w*|indicat\w*)/i, item: /^flow switch/i },
  { key: "pressure_switch", desc: /pressure\s*switch/i, item: /^pressure switch/i },
  { key: "pressure_gauge", desc: /pressure\s*gauges?|dial\s*type[^.]{0,40}gauge/i, item: /^pressure gauge/i },
  { key: "hydrant_valve", desc: /hydrant\s*valves?|landing\s*valves?/i, item: /hydrant valve$/i },
  { key: "fbi", desc: /fire\s*brigade\s*inlet|\bfbi\b/i, item: /fbi valve/i },
  { key: "hose_reel", desc: /hose\s*reels?/i, item: /^hose reel/i },
  { key: "hose_box", desc: /hose\s*(?:box|cabinet)/i, item: /^hose box/i },
  { key: "hose_pipe", desc: /\b(?:rrl|rubber\s*lined)\b[^.]{0,30}\bhose|\bhose\s*pipe|\bhose\b(?!\s*(?:reel|box|cabinet|clamp|nipple))/i, item: /^rrl hose/i },
  { key: "branch_pipe", desc: /branch\s*pipe/i, item: /^branch pipe/i },
  { key: "rosette", desc: /ros+et+e?\s*plate|roser\s*plate/i, item: /^roser plate|rosette/i },
  { key: "sprinkler_drop", parent: "sprinkler", desc: /flexible\s*(?:sprinkler\s*)?drop|braided\s*flexible|ss\s*braided/i, item: /flexible sprinkler drop/i },
  { key: "sprinkler_pendent", parent: "sprinkler", desc: /pend[ae]nt|pentant/i, requires: /sprinkler/i, item: /^pendant sprinkler/i },
  { key: "sprinkler_upright", parent: "sprinkler", desc: /upright/i, requires: /sprinkler/i, item: /^upright sprinkler/i },
  { key: "sprinkler_sidewall", parent: "sprinkler", desc: /side\s*wall|wall\s*sprinkler/i, requires: /sprinkler/i, item: /^wall sprinkler/i },
  { key: "sprinkler", desc: /sprinklers?\s*heads?|sprinklers?\b/i },
  { key: "jockey_pump", parent: "pump", desc: /jockey|jacky/i, item: /^jacky pump/i },
  { key: "diesel_engine", parent: "pump", desc: /diesel\s*engine/i, item: /^diesel engine$/i },
  { key: "fire_pump", parent: "pump", desc: /(?:electric(?:al)?\s*(?:motor\s*)?driven|main)\s*(?:fire\s*)?(?:sprinkler\s*&?\s*hydrant\s*)?pumps?|booster\s*pumps?|fire\s*pumps?/i, item: /^fire pump$/i },
  { key: "electrical_panel", desc: /fire\s*fighting\s*panel|electrical\s*panel|starter\s*panel|\bmcc\b|pump\s*(?:control\s*)?panel/i, item: /^electrical panel/i },
  { key: "pressure_vessel", desc: /pressure\s*vessel|hydro[\s-]*pneumatic|cylindrical\s*pressure/i, item: /^pressure vessel/i },
  { key: "water_tank", desc: /water\s*tanks?|zincalume|glass\s*fused/i, item: /^water tank/i },
  { key: "diesel_tank", desc: /diesel\s*tank|fuel\s*tank/i, item: /^diesel tank/i },
  { key: "battery", desc: /batter(?:y|ies)/i, item: /^battery/i },
  // cables
  { key: "fire_survival_cable", parent: "cable", desc: /fire\s*survival|lszh|low\s*smoke\s*zero\s*halogen/i, item: /^fire survival cable/i },
  { key: "frls_cable", parent: "cable", desc: /\bfrls\b/i, item: /^frls cable/i },
  { key: "power_cable", parent: "cable", desc: /xlpe|\b(?:al|aluminium|aluminum)\b[^.]{0,30}cables?|power\s*cables?/i, item: /^power cable/i },
  { key: "lan_cable", parent: "cable", desc: /\butp\b|\bcat\s*-?\s*6\b|lan\s*cable/i, item: /^lan cable/i },
  { key: "control_cable", parent: "cable", desc: /control\s*cables?|copper\s*conductor\s*armoured|cu\s*armoured/i, item: /^\d\s*c\s*cable$/i },
  { key: "cable", weight: 1, desc: /\bcables?\b/i },
  { key: "cable_tray", desc: /cable\s*trays?/i, item: /^cable tray/i },
  { key: "earthing", desc: /earthing/i, item: /^earthing/i },
  { key: "conduit", desc: /\bconduits?\b/i, item: /^gi conduit/i },
  { key: "wrapping", desc: /wrapping|anti[\s-]*corrosi/i, item: /^wrapping/i },
  { key: "structural_steel", weight: 1, desc: /structural\s*steel|mild\s*steel\s*supports?|\bms\s*supports?/i, item: /^structural steel/i },
  { key: "pipe_support", weight: 1, desc: /pipe\s*supports?|\bhangers?\b/i, item: /^pipe support/i },
  { key: "thread_rod", weight: 1, desc: /thread(?:ed)?\s*(?:tie\s*)?rods?|tie\s*rods?/i, item: /^thread rod/i },
  { key: "fire_bucket", desc: /(?:sand|fire)\s*buckets?/i, item: /^fire bucket/i },
  // fire alarm
  { key: "repeater_panel", desc: /repeater/i, item: /^repeater panel/i },
  { key: "fa_panel", desc: /fire\s*alarm\s*(?:control\s*)?panel|(?:alarm|detection)\s*control\s*panel|\bfacp\b|\bloops?\s*panel|\bloops?\b[^.]{0,40}\bpanel|\bpanel\b[^.]{0,40}\bloops?\b/i, item: /^fire alarm panel/i },
  { key: "network_module", desc: /network\s*(?:module|card)/i, item: /^network module/i },
  { key: "monitor_module", desc: /monitor\s*modules?|input\s*modules?/i, item: /^monitor module/i },
  { key: "control_module", desc: /control\s*(?:relay\s*)?modules?|relay\s*modules?|output\s*modules?/i, item: /^control module/i },
  { key: "isolator", desc: /isolator\s*(?:module|base)?|short\s*circuit\s*isolat/i, item: /^isolator module/i },
  { key: "response_indicator", desc: /response\s*indicators?/i, item: /^response indicator/i },
  { key: "detector_base", desc: /(?:detector|sensor|mounting|common\s*mount)\w*\s*bases?/i, item: /^detector base/i },
  { key: "multi_detector", parent: "detector", desc: /multi[\s-]*(?:sensor|criteria|detector)|optical[^.]{0,30}heat|photo[^.]{0,10}thermal/i, item: /^multi detector/i },
  { key: "beam_detector", parent: "detector", desc: /beam\s*(?:type\s*)?(?:smoke\s*)?detectors?|\bbeam\b/i, item: /^beam detector/i },
  { key: "gas_detector", parent: "detector", desc: /gas\s*(?:leak\s*)?detectors?|\blpg\b/i, item: /^gas detector/i },
  { key: "smoke_detector", parent: "detector", desc: /smoke\s*(?:detectors?|sensors?)|optical\s*(?:smoke\s*)?(?:detectors?|sensors?)|photo[\s-]*electric/i, item: /^smoke detector/i },
  { key: "heat_detector", parent: "detector", desc: /heat\s*(?:detectors?|sensors?)|rate[\s-]*of[\s-]*rise|thermal\s*detectors?/i, item: /^heat detector/i },
  { key: "mcp", desc: /manual\s*call\s*points?|\bmcp\b|break\s*glass|call\s*points?|pull\s*station/i, item: /^manual call point/i },
  { key: "hooter", desc: /hooters?|sounders?|strobes?/i, item: /^hooter/i },
  { key: "gang_bell", desc: /gang\s*bell|fire\s*bell|alarm\s*bell/i, item: /^gang bell/i },
  { key: "psu", desc: /power\s*supply\s*(?:booster|unit)|booster\s*unit|\bpsu\b/i, item: /^power supply booster/i },
  // PA
  { key: "vec", desc: /voice\s*evacuation\s*(?:controller|system|control)|digital\s*voice|\bvec\b|\bpava\b/i, item: /^voice evacuation controller/i },
  { key: "amplifier", desc: /amplifiers?/i, item: /^power amplifier/i },
  { key: "ceiling_speaker", parent: "speaker", desc: /ceiling\s*(?:mounted\s*)?(?:type\s*)?(?:voice\s*evacuation\s*)?speakers?/i, item: /^ceiling speaker/i },
  { key: "wall_speaker", parent: "speaker", desc: /(?:wall|horn)\s*(?:mounted\s*)?(?:type\s*)?(?:voice\s*evacuation\s*)?speakers?|horn\s*speakers?/i, item: /^horn speaker/i },
  { key: "speaker", weight: 1, desc: /speakers?/i },
  // extinguishers (refill variants are derived below)
  { key: "ext_clean", parent: "extinguisher", desc: /clean\s*agent|\bhfc\b|hfc[\s-]?\d+|\bfe[\s-]?36\b|\bhcfc\b|halotron/i, requires: /extingu/i, item: /^clean agent (?:extinguisher|refilling)/i },
  { key: "ext_co2", parent: "extinguisher", desc: /\bco2\b|carbon[\s-]*di[\s-]*oxide|carbon\s*dioxide/i, requires: /extingu/i, item: /^co2 (?:extinguisher|refilling)/i },
  { key: "ext_foam", parent: "extinguisher", desc: /\bfoam\b|\bafff\b/i, requires: /extingu/i, item: /^foam (?:extinguisher|refilling)/i },
  { key: "ext_abc", parent: "extinguisher", desc: /\babc\b|dry\s*(?:chemical\s*)?powder|\bdcp\b|\bmap\s*\d+/i, requires: /extingu/i, item: /^abc (?:extinguisher|refilling)/i },
];
const FAMILY_BY_KEY = new Map(FAMILIES.map((f) => [f.key, f]));

const REFILL_RX = /refill/i;
const SERVICE_RX = /\b(removing|removal|dismantl\w*|shifting|relocat\w*|reusing|re-?using|re-?commission\w*|recomis+ion\w*|servicing|repair\w*)\b/i;

export type DescFamily = { key: string; pos: number; weight: number };

/** Item groups mentioned in a description, in reading order with weak groups pushed back (first = primary). */
export function detectFamilies(text: string): DescFamily[] {
  const out: DescFamily[] = [];
  const refill = REFILL_RX.test(text);
  for (const f of FAMILIES) {
    if (f.requires && !f.requires.test(text)) continue;
    const m = f.desc.exec(text);
    if (!m) continue;
    const key = f.parent === "extinguisher" && refill ? `${f.key}_refill` : f.key;
    out.push({ key, pos: m.index, weight: f.weight ?? 2 });
  }
  // Weak groups (fittings, supports, "cable") lead only when they open the line; otherwise strong groups come first.
  const eff = (f: DescFamily) => (f.weight === 1 && f.pos >= 60 ? f.pos + 100000 : f.pos);
  return out.sort((x, y) => eff(x) - eff(y) || y.weight - x.weight);
}

/** Family key of a catalogue item from its group name and name. */
export function itemFamily(groupName: string, name: string): string | null {
  for (const f of FAMILIES) {
    if (!f.item) continue;
    if (f.item.test(groupName) || f.item.test(name)) {
      if (f.parent === "extinguisher" && (REFILL_RX.test(groupName) || REFILL_RX.test(name))) return `${f.key}_refill`;
      return f.key;
    }
  }
  return null;
}

const familyParent = (key: string) => FAMILY_BY_KEY.get(key.replace(/_refill$/, ""))?.parent ?? null;

// ---------------------------------------------------------------- makes
/** Makes commonly specified in Indian fire-protection BOQs (catalogue makes are added at match time). */
export const KNOWN_MAKES = [
  "Ravel", "Honeywell", "Morley", "System Sensor", "Notifier", "Edwards", "Glyptic", "ASES", "Safex", "Chakraa", "Ceasefire",
  "Kanex", "Minimax", "Newage", "Kirloskar", "Mather", "Tyco", "Viking", "HD Fire", "Polycab", "Ambika", "Orbit", "Ahuja",
  "Bosch", "Apollo", "Agni", "Jindal", "Zenith", "Exide", "Amaron", "Siemens", "Esser", "Gent", "Hochiki", "Kidde", "Firex",
  "Potter", "Reliable", "Lauretta", "Havells", "Finolex", "KEI", "Grundfos", "Xylem", "Unik", "Tata",
];

function makeRegex(make: string): RegExp {
  const esc = make.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  // short all-caps makes (LAP, KEI, ASES) must appear in capitals so ordinary words do not match
  return new RegExp(`(?<![A-Za-z])${esc}(?![A-Za-z])`, make.length <= 4 && make === make.toUpperCase() ? "" : "i");
}

/** Item make field "Honeywell/Morley/System Sensor UL" -> ["honeywell", "morley", "system sensor"]. */
export function splitMakes(make: string | null | undefined): string[] {
  if (!make) return [];
  return make.split(/[/,]|\bor\b/i).map((m) => m.replace(/\bUL\b/g, "").trim().toLowerCase()).filter(Boolean);
}

export function detectMakes(text: string, makes: readonly string[]): string[] {
  const out = new Set<string>();
  for (const m of makes) if (m.trim().length >= 3 && makeRegex(m.trim()).test(text)) out.add(m.trim().toLowerCase());
  return [...out];
}

// ---------------------------------------------------------------- scoring
const STOP = new Set([
  "the", "and", "with", "for", "of", "to", "in", "on", "as", "per", "all", "including", "include", "required", "complete",
  "supply", "supplying", "installation", "installing", "install", "testing", "test", "commissioning", "commission", "fixing",
  "providing", "laying", "type", "nos", "set", "approved", "make", "standard", "suitable", "necessary", "etc", "from", "shall",
  "be", "is", "are", "by", "or", "at", "this", "that", "any", "other", "following", "sizes", "size", "dia", "mm", "nb",
]);

const SYNONYMS: Record<string, string> = {
  pendent: "pendant", pentant: "pendant", sprinklers: "sprinkler", valves: "valve", pipes: "pipe", detectors: "detector",
  cables: "cable", extinguishers: "extinguisher", extingushers: "extinguisher", jacky: "jockey", sensor: "detector", sensors: "detector",
  cabinet: "box", strainers: "strainer", speakers: "speaker", modules: "module", hooters: "hooter", panels: "panel",
};

function tokens(text: string): Set<string> {
  const s = new Set<string>();
  for (const raw of text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)) {
    const w = SYNONYMS[raw] ?? raw;
    if (w.length >= 3 && !STOP.has(w) && !/^\d/.test(w)) s.add(w);
  }
  return s;
}

/** The catalogue fields used for matching (a subset of the items table). */
export type MatchItem = { id: number; name: string; groupName: string; size: string | null; make: string | null; system?: string | null };

/** Pre-computed matching features of one catalogue item. */
export type PreparedItem = {
  id: number;
  family: string | null;
  parent: string | null;
  sizes: string[];
  makes: string[];
  ul: boolean;
  addressable: boolean;
  conventional: boolean;
  groupPhrase: string;
  words: Set<string>;
};

export function prepareItem(it: MatchItem): PreparedItem {
  const family = itemFamily(it.groupName, it.name);
  const sizes = extractSizes(it.size ?? "");
  if (!sizes.length && it.size && /^\d+(?:\.\d+)?$/.test(it.size.trim())) sizes.push(mmToken(it.size.trim()));
  const nameSizes = sizes.length ? sizes : extractSizes(it.name);
  const makes = splitMakes(it.make);
  const words = tokens(`${it.groupName} ${it.name}`);
  for (const m of makes) for (const w of m.split(/\s+/)) words.delete(w);
  return {
    id: it.id,
    family,
    parent: family ? familyParent(family) : null,
    sizes: nameSizes,
    makes,
    ul: /\bUL\b/.test(it.make ?? "") || /\bUL\b/.test(it.name),
    addressable: /addressable/i.test(`${it.groupName} ${it.name}`),
    conventional: /conventional/i.test(`${it.groupName} ${it.name}`),
    groupPhrase: it.groupName.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
    words,
  };
}

/** Pre-computed features of a BOQ description. */
export type PreparedDesc = {
  text: string;
  families: DescFamily[];
  sizes: string[];
  makes: string[];
  ul: boolean;
  addressable: boolean;
  conventional: boolean;
  service: boolean;
  words: Set<string>;
  lower: string;
};

export function prepareDescription(text: string, makes: readonly string[] = KNOWN_MAKES): PreparedDesc {
  return {
    text,
    families: detectFamilies(text),
    sizes: extractSizes(text),
    makes: detectMakes(text, makes),
    ul: /\bUL\b|\bUL[\s-]*(listed|approved)/.test(text),
    addressable: /addressable/i.test(text),
    conventional: /conventional/i.test(text),
    service: SERVICE_RX.test(text.slice(0, 80)),
    words: tokens(text),
    lower: ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `,
  };
}

/**
 * Score 0..100 of a catalogue item for a description.
 * Group: primary group 55, a sub-type of a generic primary (sprinkler -> upright) 45, another mentioned group 30,
 * sibling sub-type (ABC vs CO2) 15, group name written in the text 45. Size: matches the last size 30, another size 15,
 * wrong size -20. Make: named and matching +10, named and different -10. Word overlap up to +15.
 * (Removal / reuse / recommissioning lines are capped at 45 by matchDescription after ranking.)
 */
export function scoreItem(d: PreparedDesc, it: PreparedItem): number {
  let s = 0;
  let group = 0;
  let main = false; // the item is the main thing the line is about (not an accessory mentioned in passing)
  const primary = d.families[0];
  if (it.family && primary) {
    if (it.family === primary.key) { group = 55; main = true; }
    else if (familyParent(it.family) === primary.key) { group = d.families.some((f) => f.key === it.family) ? 55 : 45; main = true; }
    else if (d.families.some((f) => f.key === it.family)) group = 30;
    else if (it.parent && it.parent === familyParent(primary.key)) group = 10;
  }
  // items outside the known groups: their group name written in the text ("Gasket", "U Clamp")
  if (!it.family && it.groupPhrase.length >= 4 && d.lower.includes(` ${it.groupPhrase} `)) {
    group = primary ? 20 : it.groupPhrase.includes(" ") ? 45 : 35;
    main = !primary;
  }
  s += group;
  if (group === 0) return Math.min(25, overlap(d, it)); // no shared group: only weak word overlap
  // size (an accessory mentioned in passing gets half the size bonus)
  const w = main ? 1 : 0.5;
  if (it.sizes.length && d.sizes.length) {
    const last = d.sizes[d.sizes.length - 1];
    if (it.sizes.includes(last)) s += 30 * w;
    else if (it.sizes.some((x) => d.sizes.includes(x))) s += 15 * w;
    else s -= 20;
  } else if (!it.sizes.length && !d.sizes.length) s += 10 * w;
  else if (!it.sizes.length) s += 5 * w;
  // make
  if (d.makes.length && it.makes.length) s += it.makes.some((m) => d.makes.includes(m)) ? 10 : -10;
  if (it.ul !== d.ul && it.makes.length) s -= 3;
  if (d.addressable && it.conventional) s -= 10;
  if (d.addressable && it.addressable) s += 8;
  if (d.conventional && it.addressable) s -= 10;
  s += overlap(d, it);
  return Math.max(0, Math.min(100, Math.round(s)));
}

function overlap(d: PreparedDesc, it: PreparedItem): number {
  if (!it.words.size) return 0;
  let hit = 0;
  for (const w of it.words) if (d.words.has(w)) hit++;
  return Math.round((15 * hit) / it.words.size);
}

export type MatchStatus = "matched" | "check" | "none";
export type RowMatch = {
  itemId: number | null;
  score: number;
  status: MatchStatus;
  /** plain-language reason shown under the confidence chip */
  reason: string;
  /** best few candidates (including the chosen one) for quick picks */
  alternatives: { itemId: number; score: number }[];
  /** several items fit equally well (usually different makes) */
  ambiguous: boolean;
};

export const statusForScore = (score: number): MatchStatus => (score >= MATCH_AUTO ? "matched" : score >= MATCH_CHECK ? "check" : "none");

/** Lower-case, single-spaced description key used for "quoted before" lookups. */
export function historyKey(description: string): string {
  return cleanText(description).toLowerCase().replace(/\s+/g, " ").trim().slice(0, 2000);
}

/**
 * Best catalogue item for a description. `history` maps historyKey(description) -> itemId of a line quoted before;
 * an exact match there wins with score 95.
 */
export function matchDescription(
  text: string,
  catalogue: readonly PreparedItem[],
  opts: { history?: ReadonlyMap<string, number>; makes?: readonly string[] } = {},
): RowMatch {
  const d = prepareDescription(text, opts.makes ?? KNOWN_MAKES);
  const scored: { itemId: number; score: number }[] = [];
  for (const it of catalogue) {
    const score = scoreItem(d, it);
    if (score > 0) scored.push({ itemId: it.id, score });
  }
  scored.sort((a, b) => b.score - a.score || a.itemId - b.itemId);
  const alternatives = scored.slice(0, 10);
  const hist = opts.history?.get(historyKey(text));
  if (hist != null && catalogue.some((c) => c.id === hist)) {
    const alts = [{ itemId: hist, score: 95 }, ...alternatives.filter((a) => a.itemId !== hist)].slice(0, 10);
    return { itemId: hist, score: 95, status: "matched", reason: "Same description was quoted before", alternatives: alts, ambiguous: false };
  }
  if (d.service) for (const a of alternatives) a.score = Math.min(a.score, 45);
  const top = scored[0];
  if (top && d.service) top.score = Math.min(top.score, 45);
  if (!top || top.score < MATCH_CHECK) {
    return { itemId: null, score: top?.score ?? 0, status: "none", reason: d.service ? "Looks like a service or removal line, price it by hand" : "No close item in the catalogue", alternatives, ambiguous: false };
  }
  const ties = scored.filter((x) => x.score >= top.score - 2).length;
  let score = top.score;
  let reason = score >= MATCH_AUTO ? "Group and size match" : "Partly matches, please check";
  const ambiguous = ties > 1 && score >= MATCH_CHECK;
  if (ambiguous && score >= MATCH_AUTO) {
    score = MATCH_AUTO - 1;
    reason = `${ties} items fit equally well (often different makes), pick one`;
  } else if (d.service) reason = "Removal or reuse work, check the rate";
  else if (score < MATCH_AUTO && d.sizes.length && top.score < MATCH_AUTO) reason = "Check the size and type";
  return { itemId: top.itemId, score, status: statusForScore(score), reason, alternatives, ambiguous };
}

// ---------------------------------------------------------------- pricing on the review screen (rules 2 and 3)
/** Rule 2: suggested supply rate = round2(cost x (1 + markup/100)). */
export function supplyFromCost(cost: number, markupPct: number): number {
  const c = Number(cost) || 0;
  const m = Number.isFinite(Number(markupPct)) ? Number(markupPct) : 0;
  return round2(c * (1 + m / 100));
}

export type ReviewLine = { include: boolean; qty: number; supplyRate: number; erectionRate: number; costRate: number };

/** Rule 3 totals over the ticked lines with a quantity above zero (no discount on import). */
export function boqTotals(lines: readonly ReviewLine[], gstPct: number): QuoteTotals {
  return computeQuoteTotals(lines.filter((l) => l.include && l.qty > 0), 0, gstPct);
}

export type MatchSummary = { matched: number; check: number; unmatched: number; excluded: number; items: number };

/** Summary chips: matched / to check / unmatched / excluded across item rows. Excluded rows are counted only once. */
export function summariseRows(rows: readonly { include: boolean; status: MatchStatus; itemId: number | null }[]): MatchSummary {
  const s: MatchSummary = { matched: 0, check: 0, unmatched: 0, excluded: 0, items: rows.length };
  for (const r of rows) {
    if (!r.include) s.excluded++;
    else if (r.itemId == null) s.unmatched++;
    else if (r.status === "matched") s.matched++;
    else s.check++;
  }
  return s;
}

/** Most common system among chosen items (for the quotation header and template). */
export function dominantSystem(systems: readonly (string | null | undefined)[]): string | null {
  const c = new Map<string, number>();
  for (const s of systems) if (s) c.set(s, (c.get(s) ?? 0) + 1);
  let best: string | null = null, n = 0;
  for (const [k, v] of c) if (v > n) { best = k; n = v; }
  return best;
}

/** File name checks shared by the upload form and the server action. Returns an error message or null. */
export function fileTypeProblem(name: string): string | null {
  const ext = (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? "").toLowerCase();
  if (ext === "xlsx" || ext === "csv") return null;
  if (ext === "xlsm" || ext === "xltm" || ext === "xlam") return "Macro-enabled workbooks are not accepted. In Excel use File, Save As, choose \"Excel Workbook (.xlsx)\" and upload that file.";
  if (ext === "xls") return "This is an old Excel 97-2003 file. Open it in Excel, save it as .xlsx and upload it again.";
  if (ext === "xlsb") return "Binary workbooks (.xlsb) are not supported. Save it as .xlsx and upload it again.";
  if (ext === "ods") return "OpenDocument sheets are not supported. Save it as .xlsx and upload it again.";
  return "Please upload an Excel workbook (.xlsx) or a CSV file.";
}

/** Byte-level checks: password-protected / old .xls (OLE), not a zip, or contains a VBA project. */
export function workbookBytesProblem(bytes: Uint8Array): string | null {
  if (bytes.length < 4) return "The file is empty.";
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    return "This workbook is password protected (or saved in the old .xls format). Remove the password in Excel (File, Info, Protect Workbook), save as .xlsx and upload it again.";
  }
  if (!(bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04)) {
    return "This file is not a valid .xlsx workbook. Open it in Excel, save it again as .xlsx and upload it.";
  }
  // Zip entry names are stored as plain text, so a VBA project is visible without unzipping.
  if (new TextDecoder("latin1").decode(bytes).includes("vbaProject.bin")) {
    return "This workbook contains macros, which we do not accept. Save it as a plain Excel Workbook (.xlsx) and upload it again.";
  }
  const unzipped = zipUncompressedSize(bytes);
  if (unzipped != null && (unzipped.entries > BOQ_MAX_ZIP_ENTRIES || unzipped.bytes > BOQ_MAX_UNZIPPED_BYTES)) {
    return "This workbook is too large to import once opened. Delete unused sheets, pictures and empty formatted rows, save it and upload it again.";
  }
  return null;
}

/**
 * Sum of the uncompressed sizes declared in the zip central directory, without inflating anything.
 * Returns null when no central directory is found (exceljs then rejects the file as damaged).
 * Zip64 markers (0xFFFFFFFF) count as "too big".
 */
export function zipUncompressedSize(bytes: Uint8Array): { entries: number; bytes: number } | null {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const min = Math.max(0, bytes.length - 22 - 0xffff);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= min; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const count = dv.getUint16(eocd + 10, true);
  const cdOffset = dv.getUint32(eocd + 16, true);
  if (count === 0xffff || cdOffset === 0xffffffff) return { entries: Infinity, bytes: Infinity };
  let p = cdOffset, total = 0, n = 0;
  while (n < count && p + 46 <= bytes.length && dv.getUint32(p, true) === 0x02014b50) {
    const size = dv.getUint32(p + 24, true);
    if (size === 0xffffffff) return { entries: n + 1, bytes: Infinity };
    total += size;
    n++;
    p += 46 + dv.getUint16(p + 28, true) + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
  }
  return { entries: Math.max(n, count), bytes: total };
}
