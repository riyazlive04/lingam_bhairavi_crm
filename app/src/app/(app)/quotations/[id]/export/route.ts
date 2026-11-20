/** GET /quotations/[id]/export → .xlsx in the client's quotation format (exceljs). */
import ExcelJS from "exceljs";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, quotationLines, quotations } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canRead } from "@/lib/rbac";
import { SYSTEMS, type SystemKey } from "@/lib/constants";
import { fmtDate } from "@/lib/format";
import { computeQuoteTotals } from "@/lib/pricing";
import { getCompanySettings, groupBySection, numberToIndianWords, splitSection } from "@/lib/quotations";

export const dynamic = "force-dynamic";

/** Indian digit grouping (1,23,45,678.00) via conditional sections; negatives fall back to standard grouping. */
const INR = '[>=10000000]"₹"##\\,##\\,##\\,##0.00;[>=100000]"₹"##\\,##\\,##0.00;"₹"#,##0.00';
const QTY = "#,##0.##";
const thin = { style: "thin" as const, color: { argb: "FF808080" } };
const border = { top: thin, left: thin, bottom: thin, right: thin };
const RED = "FFB91C1C";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) return new Response("Not signed in", { status: 401 });
  if (!canRead(user.role, "quotations")) return new Response("Forbidden", { status: 403 });
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) return new Response("Not found", { status: 404 });

  const db = await getDb();
  const [q] = await db.select().from(quotations).where(eq(quotations.id, id));
  if (!q) return new Response("Not found", { status: 404 });
  const [[cust], allLines, company] = await Promise.all([
    db.select().from(customers).where(eq(customers.id, q.customerId)),
    db.select().from(quotationLines).where(eq(quotationLines.quotationId, id)).orderBy(asc(quotationLines.sortOrder), asc(quotationLines.id)),
    getCompanySettings(db),
  ]);
  const lines = allLines.filter((l) => l.qty > 0); // rule 3: zero qty never exported
  const totals = computeQuoteTotals(lines, q.discountPct, q.gstPct);

  const wb = new ExcelJS.Workbook();
  wb.creator = company.name;
  wb.created = new Date();
  const title = (q.system && SYSTEMS[q.system as SystemKey]) || "Quotation";
  const ws = wb.addWorksheet("Quotation", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
  });
  ws.columns = [
    { key: "ref", width: 11 }, { key: "desc", width: 62 }, { key: "qty", width: 10 }, { key: "uom", width: 8 },
    { key: "sr", width: 14 }, { key: "sa", width: 16 }, { key: "er", width: 14 }, { key: "ea", width: 16 }, { key: "rem", width: 22 },
  ];

  // ---- letterhead
  let r = 1;
  ws.mergeCells(r, 1, r, 9);
  ws.getCell(r, 1).value = company.name;
  ws.getCell(r, 1).font = { bold: true, size: 16, color: { argb: RED } };
  ws.getCell(r, 1).alignment = { horizontal: "center" };
  r++;
  const sub = [company.address.replace(/\s*\n\s*/g, ", "), company.phone && `Ph: ${company.phone}`, company.email, company.gstin && `GSTIN: ${company.gstin}`].filter(Boolean).join("  |  ");
  ws.mergeCells(r, 1, r, 9);
  ws.getCell(r, 1).value = sub;
  ws.getCell(r, 1).alignment = { horizontal: "center", wrapText: true };
  ws.getCell(r, 1).font = { size: 9 };
  r += 2;

  // ---- customer & quote meta
  const meta: [string, string, string, string][] = [
    ["To", cust?.name ?? "", "Quotation No.", q.number],
    ["Kind attn", cust?.contactPerson ?? "", "Date", fmtDate(q.quoteDate)],
    ["Address", [cust?.address, cust?.city, cust?.state].filter(Boolean).join(", "), "Valid until", fmtDate(q.validUntil)],
    ["Project", q.projectName ?? "", "Site", q.siteLocation ?? ""],
  ];
  if (cust?.gstin || cust?.phone) meta.push(["Phone", cust?.phone ?? "", "Customer GSTIN", cust?.gstin ?? ""]);
  for (const [k1, v1, k2, v2] of meta) {
    ws.getCell(r, 1).value = k1;
    ws.getCell(r, 1).font = { bold: true };
    ws.mergeCells(r, 2, r, 4);
    ws.getCell(r, 2).value = v1;
    ws.getCell(r, 2).alignment = { wrapText: true, vertical: "top" };
    ws.mergeCells(r, 5, r, 6);
    ws.getCell(r, 5).value = k2;
    ws.getCell(r, 5).font = { bold: true };
    ws.mergeCells(r, 7, r, 9);
    ws.getCell(r, 7).value = v2;
    r++;
  }
  r++;

  // ---- table header (client format)
  ws.mergeCells(r, 1, r, 4);
  ws.getCell(r, 1).value = title.toUpperCase();
  ws.mergeCells(r, 5, r, 6);
  ws.getCell(r, 5).value = "SUPPLY";
  ws.mergeCells(r, 7, r, 8);
  ws.getCell(r, 7).value = "ERECTION";
  const h1 = r;
  r++;
  ["BOQ Ref", "Description", "Quantity", "UOM", "RATE", "AMOUNT", "RATE", "AMOUNT", "Remarks"].forEach((v, i) => { ws.getCell(r, i + 1).value = v; });
  const h2 = r;
  for (const hr of [h1, h2]) {
    for (let c = 1; c <= 9; c++) {
      const cell = ws.getCell(hr, c);
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: RED } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = border;
    }
  }
  r++;

  const styleRow = (row: number, opts: { bold?: boolean; fill?: string } = {}) => {
    for (let c = 1; c <= 9; c++) {
      const cell = ws.getCell(row, c);
      cell.border = border;
      cell.alignment = { ...(cell.alignment ?? {}), vertical: "top", wrapText: true };
      if (opts.bold) cell.font = { bold: true };
      if (opts.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.fill } };
    }
  };

  // ---- sections & lines
  const groups = groupBySection(lines);
  for (const g of groups) {
    const { code, title: secTitle } = splitSection(g.section);
    if (g.section) {
      ws.getCell(r, 1).value = code;
      ws.getCell(r, 2).value = secTitle;
      styleRow(r, { bold: true, fill: "FFF3F4F6" });
      r++;
    }
    const first = r;
    for (const l of g.lines) {
      const row = ws.getRow(r);
      row.values = [l.boqRef ?? "", l.description, l.qty, l.uom, l.supplyRate, null, l.erectionRate || null, null, l.remarks ?? ""];
      ws.getCell(r, 6).value = { formula: `C${r}*E${r}`, result: Math.round(l.qty * l.supplyRate * 100) / 100 };
      ws.getCell(r, 8).value = { formula: `C${r}*G${r}`, result: Math.round(l.qty * l.erectionRate * 100) / 100 };
      styleRow(r);
      ws.getCell(r, 3).numFmt = QTY;
      for (const c of [5, 6, 7, 8]) ws.getCell(r, c).numFmt = INR;
      // approximate row height for wrapped description (~70 chars per line at width 62)
      const linesNeeded = Math.max(1, Math.ceil(l.description.length / 70) + (l.description.match(/\n/g)?.length ?? 0));
      row.height = Math.min(409, 15 * linesNeeded);
      r++;
    }
    if (g.section && groups.length > 1) {
      ws.mergeCells(r, 1, r, 5);
      ws.getCell(r, 1).value = `Total: ${secTitle}`;
      ws.getCell(r, 1).alignment = { horizontal: "right" };
      ws.getCell(r, 6).value = { formula: `SUM(F${first}:F${r - 1})`, result: g.lines.reduce((s, l) => s + l.qty * l.supplyRate, 0) };
      ws.getCell(r, 8).value = { formula: `SUM(H${first}:H${r - 1})`, result: g.lines.reduce((s, l) => s + l.qty * l.erectionRate, 0) };
      styleRow(r, { bold: true });
      ws.getCell(r, 1).alignment = { horizontal: "right" };
      ws.getCell(r, 6).numFmt = INR;
      ws.getCell(r, 8).numFmt = INR;
      r++;
    }
  }

  // ---- totals (values, so section subtotal rows are not double counted)
  const totalLine = (label: string, value: number, opts: { bold?: boolean; both?: [number, number] } = {}) => {
    ws.mergeCells(r, 1, r, 5);
    ws.getCell(r, 1).value = label;
    if (opts.both) {
      ws.getCell(r, 6).value = opts.both[0];
      ws.getCell(r, 7).value = null;
      ws.getCell(r, 8).value = opts.both[1];
    } else {
      ws.mergeCells(r, 6, r, 8);
      ws.getCell(r, 6).value = value;
    }
    styleRow(r, { bold: opts.bold });
    ws.getCell(r, 1).alignment = { horizontal: "right", vertical: "middle" };
    ws.getCell(r, 6).numFmt = INR;
    ws.getCell(r, 8).numFmt = INR;
    r++;
  };
  totalLine("TOTAL (Supply / Erection)", 0, { bold: true, both: [totals.supply, totals.erection] });
  totalLine("Total basic value (Supply + Erection)", totals.gross);
  if (totals.discount > 0) {
    totalLine(`Less: Discount @ ${q.discountPct}%`, -totals.discount);
    totalLine("Net taxable value", totals.taxable);
  }
  totalLine(`GST @ ${q.gstPct}%`, totals.tax);
  totalLine("GRAND TOTAL", totals.grand, { bold: true });
  ws.mergeCells(r, 1, r, 9);
  ws.getCell(r, 1).value = `Amount in words: ${numberToIndianWords(totals.grand)}`;
  ws.getCell(r, 1).font = { italic: true };
  ws.getCell(r, 1).border = border;
  r += 2;

  // ---- terms
  const terms = (q.terms || company.quoteTerms).split(/\r?\n/).map((t) => t.trim()).filter(Boolean);
  if (terms.length) {
    ws.getCell(r, 1).value = "TERMS & CONDITIONS";
    ws.getCell(r, 1).font = { bold: true };
    r++;
    terms.forEach((t, i) => {
      ws.mergeCells(r, 1, r, 9);
      ws.getCell(r, 1).value = `${i + 1}. ${t.replace(/^\d+[.)]\s*/, "")}`;
      ws.getCell(r, 1).alignment = { wrapText: true, vertical: "top" };
      ws.getRow(r).height = Math.max(15, 15 * Math.ceil(t.length / 150));
      r++;
    });
  }
  if (company.bankDetails) {
    r++;
    ws.getCell(r, 1).value = "BANK DETAILS";
    ws.getCell(r, 1).font = { bold: true };
    r++;
    ws.mergeCells(r, 1, r, 9);
    ws.getCell(r, 1).value = company.bankDetails;
    ws.getCell(r, 1).alignment = { wrapText: true, vertical: "top" };
    r++;
  }
  r += 2;
  ws.mergeCells(r, 6, r, 9);
  ws.getCell(r, 6).value = `For ${company.name}`;
  ws.getCell(r, 6).font = { bold: true };
  ws.getCell(r, 6).alignment = { horizontal: "right" };
  r += 3;
  ws.mergeCells(r, 6, r, 9);
  ws.getCell(r, 6).value = "Authorised Signatory";
  ws.getCell(r, 6).alignment = { horizontal: "right" };
  ws.pageSetup.printTitlesRow = `${h1}:${h2}`;

  const buf = await wb.xlsx.writeBuffer();
  await audit(db, user.id, "export", "quotation", id, { format: "xlsx" });
  const fname = `${q.number.replace(/[^A-Za-z0-9-]+/g, "_")}.xlsx`;
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fname}"`,
      "Cache-Control": "no-store",
    },
  });
}
