/** Reads an uploaded BOQ file (.xlsx via exceljs, or .csv) into parsed sheets. Server only. Maintainer: Sirah Digital. */
import "server-only";
import { inflateRawSync } from "node:zlib";
import ExcelJS from "exceljs";
import {
  BOQ_MAX_FILE_BYTES, BOQ_MAX_SHEETS, BOQ_MAX_UNZIPPED_BYTES, fileTypeProblem, parseBoqSheets, parseCsv, workbookBytesProblem, worksheetToGrid,
  type BoqParseResult, type Grid, type WorksheetLike,
} from "@/lib/boq-import";

/** A problem with the file itself; the message is safe to show to the user. */
export class BoqFileError extends Error {}

/**
 * Zip-bomb guard. Walks the central directory and inflates every entry with `maxOutputLength`, so the real
 * uncompressed total (not the size the file claims) must stay within `budget`. Damaged zips return true and are
 * left to exceljs, which rejects them with the friendly "could not open" message.
 */
export function zipInflatesWithin(bytes: Uint8Array, budget: number): boolean {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22, min = Math.max(0, bytes.length - 22 - 0xffff); i >= min; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return true;
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true), left = budget;
  for (let n = 0; n < count; n++) {
    if (p + 46 > bytes.length || dv.getUint32(p, true) !== 0x02014b50) return true;
    const method = dv.getUint16(p + 10, true), compSize = dv.getUint32(p + 20, true), local = dv.getUint32(p + 42, true);
    p += 46 + dv.getUint16(p + 28, true) + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
    if (local + 30 > bytes.length || dv.getUint32(local, true) !== 0x04034b50) return true;
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const data = bytes.subarray(start, Math.min(bytes.length, start + compSize));
    let size: number;
    if (method === 0) size = data.length;
    else if (method === 8) {
      try {
        size = inflateRawSync(data, { maxOutputLength: Math.max(1, left + 1) }).length;
      } catch (e) {
        if (e instanceof RangeError || (e as { code?: string })?.code === "ERR_BUFFER_TOO_LARGE") return false;
        return true; // corrupt stream: exceljs will reject the file
      }
    } else return true;
    left -= size;
    if (left < 0) return false;
  }
  return true;
}

/**
 * Parses BOQ bytes. Formulas are never executed: exceljs only reads the results Excel cached in the file.
 * Hidden sheets are skipped with a warning.
 */
export async function readBoqFile(name: string, bytes: Uint8Array): Promise<BoqParseResult> {
  const typeProblem = fileTypeProblem(name);
  if (typeProblem) throw new BoqFileError(typeProblem);
  if (bytes.length === 0) throw new BoqFileError("The file is empty.");
  if (bytes.length > BOQ_MAX_FILE_BYTES) throw new BoqFileError("The file is larger than 8 MB. Remove pictures or extra sheets and try again.");

  if (/\.csv$/i.test(name)) {
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    } catch {
      throw new BoqFileError("We could not read this CSV file. Save it again as CSV UTF-8 and upload it.");
    }
    const base = name.replace(/\.csv$/i, "").slice(0, 60) || "CSV";
    return parseBoqSheets([{ name: base, grid: parseCsv(text) }]);
  }

  const bytesProblem = workbookBytesProblem(bytes);
  if (bytesProblem) throw new BoqFileError(bytesProblem);
  // declared sizes can lie: inflate each entry with a hard output cap before exceljs inflates it without one
  if (!zipInflatesWithin(bytes, BOQ_MAX_UNZIPPED_BYTES)) {
    throw new BoqFileError("This workbook is too large to import once opened. Delete unused sheets, pictures and empty formatted rows, save it and upload it again.");
  }

  const wb = new ExcelJS.Workbook();
  try {
    // exceljs's load() typing expects a Node Buffer
    await wb.xlsx.load(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength) as unknown as ArrayBuffer);
  } catch {
    throw new BoqFileError("We could not open this workbook. It may be damaged or password protected. Open it in Excel, save it again as .xlsx and upload it.");
  }
  const sheets: { name: string; grid: Grid }[] = [];
  const hidden: string[] = [];
  wb.eachSheet((ws) => {
    if (sheets.length >= BOQ_MAX_SHEETS + 1) return;
    const w = ws as unknown as WorksheetLike;
    if (w.state === "hidden" || w.state === "veryHidden") { hidden.push(ws.name); return; }
    sheets.push({ name: ws.name.slice(0, 60), grid: worksheetToGrid(w) });
  });
  if (!sheets.length) throw new BoqFileError("This workbook has no visible sheets to import.");
  const result = parseBoqSheets(sheets);
  if (hidden.length) result.warnings.push(`Hidden sheet${hidden.length === 1 ? "" : "s"} skipped: ${hidden.join(", ")}.`);
  return result;
}
