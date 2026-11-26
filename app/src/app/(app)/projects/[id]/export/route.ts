import ExcelJS from "exceljs";
import { getDb } from "@/db";
import { getSession } from "@/lib/auth";
import { canRead } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import { todayIST } from "@/lib/format";
import { projectAccess } from "../../_lib/access";
import { loadCostingSheet } from "../../_lib/sheet";
import { projectBuyVsSell } from "@/lib/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INR = '"₹"#,##,##0.00';
const catLabel = (k: string) => EXPENSE_CATEGORIES[k as keyof typeof EXPENSE_CATEGORIES] ?? k;

/** GET /projects/:id/export → project costing sheet (.xlsx). Management only (contains buying rates & margin). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) return new Response("Not signed in", { status: 401 });
  if (!canRead(user.role, "projects")) return new Response("Forbidden", { status: 403 });
  const { id } = await params;
  const pid = Number(id);
  if (!Number.isInteger(pid) || pid <= 0) return new Response("Not found", { status: 404 });

  const db = await getDb();
  const s = await loadCostingSheet(db, pid);
  if (!s) return new Response("Not found", { status: 404 });
  if (!projectAccess(user, s.project).full) return new Response("Forbidden", { status: 403 });
  const { project: p, cost: c } = s;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Linga Bhairavi Enterprise CRM";
  wb.created = new Date();

  // ---- Summary
  const ws = wb.addWorksheet("Costing sheet", { views: [{ state: "frozen", ySplit: 0 }] });
  ws.columns = [{ width: 42 }, { width: 22 }];
  ws.addRow([`Project costing sheet: ${p.name}`]).font = { bold: true, size: 14 };
  ws.addRow([`${p.code} · ${s.customerName}`]);
  ws.addRow([`Generated ${todayIST()} by ${user.name}`]).font = { italic: true, color: { argb: "FF6B7280" } };
  ws.addRow([]);
  const kv = (label: string, value: string | number | null, bold = false) => {
    const r = ws.addRow([label, value ?? ""]);
    if (typeof value === "number") r.getCell(2).numFmt = INR;
    if (bold) r.font = { bold: true };
    return r;
  };
  kv("Status", p.status);
  kv("Site engineer", s.engineerName ?? "Unassigned");
  kv("Quotation", s.quotationNumber ?? "-");
  kv("Start date", p.startDate ?? "-");
  kv("End date", p.endDate ?? "-");
  ws.addRow([]);
  kv("Contract value (excl. GST)", c.contractValue, true);
  kv("Budget", c.budget);
  ws.addRow([]);
  kv("Materials issued", c.materials);
  kv("Less: materials returned", -c.returns);
  if (c.customerReturns) kv("Less: customer returns put back in stock", -c.customerReturns);
  for (const [k, v] of Object.entries(c.expensesByCategory)) kv(`Expense: ${catLabel(k)}`, v);
  kv("Actual cost", c.actualCost, true);
  kv("Expenses awaiting approval (not counted)", c.pendingExpenses);
  ws.addRow([]);
  kv("Margin", c.margin, true);
  const mp = ws.addRow(["Margin %", c.contractValue ? c.marginPct / 100 : ""]);
  mp.getCell(2).numFmt = "0.0%";
  const bu = ws.addRow(["Budget used %", c.budget ? c.budgetUsedPct / 100 : ""]);
  bu.getCell(2).numFmt = "0.0%";
  ws.addRow([]);
  kv("Invoiced (excl. GST)", c.invoicedGross);
  kv("Less: credit notes (excl. GST)", -c.creditNotes);
  kv("Net invoiced (excl. GST)", c.invoiced, true);
  kv("Received (incl. advances, excl. credit-note adjustments)", c.received);
  kv("Of which advances", c.advances);
  kv("Net due from customer (incl. GST)", c.netDue, true);

  // ---- Detail sheets
  const table = (name: string, headers: string[], rows: (string | number | null)[][], moneyCols: number[], qtyCols: number[] = []) => {
    const sh = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
    const h = sh.addRow(headers);
    h.font = { bold: true };
    h.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F3F6" } }; });
    for (const r of rows) {
      const row = sh.addRow(r.map((v) => v ?? ""));
      for (const ci of moneyCols) row.getCell(ci + 1).numFmt = INR;
      for (const ci of qtyCols) row.getCell(ci + 1).numFmt = "#,##0.##";
    }
    sh.columns.forEach((col, i) => { col.width = Math.min(50, Math.max(12, headers[i].length + 4, ...rows.map((r) => String(r[i] ?? "").length + 2))); });
    return sh;
  };

  table("Materials issued", ["Date", "Item code", "Item", "Qty", "UOM", "Rate", "Value", "Source"],
    s.issues.map((m) => [m.date, m.itemCode, m.itemName, m.absQty, m.uom, Number(m.rate), m.value, m.refType ?? "store issue"]), [5, 6], [3]);
  table("Materials returned", ["Date", "Item code", "Item", "Qty", "UOM", "Rate", "Value"],
    s.returns.map((m) => [m.date, m.itemCode, m.itemName, m.absQty, m.uom, Number(m.rate), m.value]), [5, 6], [3]);
  table("Purchase invoices", ["Invoice no", "Vendor", "Date", "Status", "Subtotal", "Total"],
    s.purchases.map((pi) => [pi.invoiceNo, pi.vendorName, pi.invoiceDate, pi.status, Number(pi.subtotal), Number(pi.total)]), [4, 5]);
  table("Expenses", ["Voucher", "Date", "Category", "Entered by", "Paid to", "Description", "Status", "Voucher total", "Allocated to project"],
    s.expenses.map((e) => [e.voucherNo, e.date, catLabel(e.category), e.userName, e.paidTo, e.description, e.status, Number(e.voucherTotal), Number(e.amount)]), [7, 8]);
  table("Sales invoices", ["Invoice", "Date", "Due", "Status", "Excl. GST", "Total", "Paid"],
    s.invoices.map((i) => [i.number, i.invoiceDate, i.dueDate, i.status, Number(i.subtotal), Number(i.total), Number(i.paidAmount)]), [4, 5, 6]);
  table("Receipts", ["Date", "Invoice", "Mode", "Reference", "Amount"],
    s.receipts.map((r) => [r.date, r.invoiceNumber ?? (r.isAdvance ? "Advance" : ""), r.mode, r.reference, Number(r.amount)]), [4]);
  table("Credit notes", ["Credit note", "Date", "Reason", "Status", "Excl. GST", "Total", "Adjusted"],
    s.creditNotes.map((cn) => [cn.number, cn.date, cn.reason, cn.status, Number(cn.subtotal), Number(cn.total), Number(cn.adjustedAmount)]), [4, 5, 6]);

  const bvs = await projectBuyVsSell(db, { projectId: p.id });
  table("Buy vs sell", ["Item code", "Item", "UOM", "Qty issued", "Qty back", "Net qty", "Avg buying rate", "Selling rate", "Rate from", "Margin per unit", "Margin total", "Margin %", "Below cost"],
    bvs.map((r) => [r.code, r.name, r.uom, r.qtyIssued, r.qtyBack, r.netQty, r.buyRate, r.sellRate, r.sellSource ?? "not sold yet", r.marginPerUnit, r.marginTotal, r.marginPct, r.belowCost ? "YES" : ""]),
    [6, 7, 9, 10], [3, 4, 5]);

  const buf = await wb.xlsx.writeBuffer();
  await audit(db, user.id, "export", "project", p.id, { format: "xlsx" });
  const fname = `${p.code}-costing-${todayIST()}.xlsx`.replace(/[^A-Za-z0-9._-]/g, "_");
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fname}"`,
      "Cache-Control": "no-store",
    },
  });
}
