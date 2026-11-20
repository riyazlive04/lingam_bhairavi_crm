import "server-only";
import ExcelJS from "exceljs";
import { AGEING_LABELS, sumAgeing, type OpenDoc, type PartyOutstanding } from "@/lib/billing";
import { todayIST } from "@/lib/format";

/** Indian digit grouping (₹1,23,45,678.00) via conditional sections. */
const INR = '[>=10000000]"₹"##\\,##\\,##\\,##0.00;[>=100000]"₹"##\\,##\\,##0.00;"₹"##,##0.00';

function styleHeader(ws: ExcelJS.Worksheet) {
  const h = ws.getRow(1);
  h.font = { bold: true };
  h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F3F6" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

/** Two-sheet workbook: party-wise ageing summary + open documents. */
export async function outstandingWorkbook(kind: "Receivables" | "Payables", parties: PartyOutstanding[], docs: OpenDoc[], companyName: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = companyName;
  wb.created = new Date();
  const partyLabel = kind === "Receivables" ? "Customer" : "Vendor";

  const s = wb.addWorksheet(`${kind} by ${partyLabel.toLowerCase()}`);
  s.columns = [
    { header: partyLabel, key: "name", width: 38 },
    { header: "Invoices", key: "n", width: 10 },
    { header: "Outstanding", key: "out", width: 16, style: { numFmt: INR } },
    { header: "Overdue", key: "od", width: 16, style: { numFmt: INR } },
    ...AGEING_LABELS.map(([k, l]) => ({ header: `${l}${k === "notDue" ? "" : " days"}`, key: k, width: 14, style: { numFmt: INR } })),
    { header: "Max days overdue", key: "maxd", width: 16 },
    { header: "E-mail", key: "email", width: 28 },
    { header: "Phone", key: "phone", width: 16 },
  ];
  for (const p of parties) {
    s.addRow({ name: p.name, n: p.invoiceCount, out: p.outstanding, od: p.overdue, ...p.ageing, maxd: Math.max(0, p.maxDaysOverdue), email: p.email ?? "", phone: p.phone ?? "" });
  }
  const t = sumAgeing(parties);
  const tr = s.addRow({ name: "TOTAL", n: parties.reduce((a, p) => a + p.invoiceCount, 0), out: t.outstanding, od: t.overdue, notDue: t.notDue, d0_30: t.d0_30, d31_60: t.d31_60, d61_90: t.d61_90, d90p: t.d90p });
  tr.font = { bold: true };
  styleHeader(s);

  const d = wb.addWorksheet("Open invoices");
  d.columns = [
    { header: partyLabel, key: "party", width: 36 },
    { header: "Invoice no.", key: "number", width: 22 },
    { header: "Invoice date", key: "invoiceDate", width: 13 },
    { header: "Due date", key: "dueDate", width: 13 },
    { header: "Total", key: "total", width: 15, style: { numFmt: INR } },
    { header: "Paid", key: "paid", width: 15, style: { numFmt: INR } },
    { header: "Outstanding", key: "out", width: 15, style: { numFmt: INR } },
    { header: "Days overdue", key: "days", width: 13 },
  ];
  for (const x of docs) {
    d.addRow({
      party: x.partyName, number: x.number, invoiceDate: new Date(x.invoiceDate + "T00:00:00Z"), dueDate: new Date(x.dueDate + "T00:00:00Z"),
      total: x.total, paid: x.paidAmount, out: x.outstanding, days: Math.max(0, x.daysOverdue),
    });
  }
  d.getColumn("invoiceDate").numFmt = "dd-mmm-yyyy";
  d.getColumn("dueDate").numFmt = "dd-mmm-yyyy";
  styleHeader(d);

  const buf = await wb.xlsx.writeBuffer();
  const filename = `${kind.toLowerCase()}-${todayIST()}.xlsx`;
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
