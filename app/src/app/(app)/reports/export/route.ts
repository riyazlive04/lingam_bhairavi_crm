import ExcelJS from "exceljs";
import { getDb } from "@/db";
import { getSession } from "@/lib/auth";
import { canRead, canSeeCost } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { todayIST } from "@/lib/format";
import {
  customerProfitability, itemMargins, monthLabel, monthlyPnl, orderProfitability, projectProfitability,
} from "@/lib/reports";
import { REPORT_TABS, parseReportParams, periodLabel, type ReportSP } from "../_lib/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Indian digit grouping (₹1,23,45,678) via conditional sections. */
const INR = '[>=10000000]"₹"##\\,##\\,##\\,##0.00;[>=100000]"₹"##\\,##\\,##0.00;"₹"##,##0.00';
const PCT = '0.0"%"';

type Col = { header: string; width?: number; fmt?: "inr" | "pct" | "qty" };

/** GET /reports/export?tab=pnl|orders|projects|customers|items&fy=... → .xlsx of the same report. */
export async function GET(req: Request) {
  const user = await getSession();
  if (!user) return new Response("Not signed in", { status: 401 });
  if (!canRead(user.role, "reports") || !canSeeCost(user.role)) return new Response("Forbidden", { status: 403 });

  const url = new URL(req.url);
  const sp = Object.fromEntries(url.searchParams.entries()) as ReportSP;
  const today = todayIST();
  const p = parseReportParams(sp, today);
  const db = await getDb();

  const wb = new ExcelJS.Workbook();
  wb.creator = "Linga Bhairavi Enterprise CRM";
  wb.created = new Date();
  const sheet = (name: string, title: string, cols: Col[], rows: (string | number | null)[][], totals?: (string | number | null)[]) => {
    const ws = wb.addWorksheet(name);
    ws.addRow([title]).font = { bold: true, size: 13 };
    ws.addRow([`Generated ${today} by ${user.name}`]).font = { italic: true, color: { argb: "FF6B7280" } };
    ws.addRow([]);
    const h = ws.addRow(cols.map((c) => c.header));
    h.font = { bold: true };
    h.eachCell((cell) => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F3F6" } }; });
    ws.views = [{ state: "frozen", ySplit: 4 }];
    const all = totals ? [...rows, totals] : rows;
    all.forEach((r, ri) => {
      const row = ws.addRow(r.map((v) => v ?? ""));
      cols.forEach((c, i) => {
        if (c.fmt === "inr") row.getCell(i + 1).numFmt = INR;
        if (c.fmt === "pct") row.getCell(i + 1).numFmt = PCT;
        if (c.fmt === "qty") row.getCell(i + 1).numFmt = "#,##0.##";
      });
      if (totals && ri === all.length - 1) row.font = { bold: true };
    });
    cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.width ?? Math.max(12, c.header.length + 3); });
  };

  if (p.tab === "pnl") {
    const r = await monthlyPnl(db, p.range!);
    const cols: Col[] = [
      { header: "Month", width: 12 }, { header: "Invoiced", fmt: "inr", width: 16 }, { header: "Credit notes", fmt: "inr", width: 15 },
      { header: "Sales", fmt: "inr", width: 16 }, { header: "Supply delivery cost", fmt: "inr", width: 18 }, { header: "Project material issues", fmt: "inr", width: 20 },
      { header: "Site returns", fmt: "inr", width: 14 }, { header: "Customer returns restocked", fmt: "inr", width: 22 }, { header: "Cost of goods", fmt: "inr", width: 16 },
      { header: "Gross profit", fmt: "inr", width: 16 }, { header: "Gross margin %", fmt: "pct" }, { header: "Expenses", fmt: "inr", width: 15 },
      { header: "Net profit", fmt: "inr", width: 16 }, { header: "Net margin %", fmt: "pct" },
    ];
    const line = (label: string, m: typeof r.total) => [label, m.invoiced, m.creditNotes, m.sales, m.deliveryCost, m.projectIssues, m.siteReturns, m.restockedReturns,
      m.cogs, m.grossProfit, m.grossMarginPct, m.expenses, m.netProfit, m.netMarginPct];
    sheet("Monthly P&L", `Monthly profit and loss, ${periodLabel(p.fy)}`, cols, r.months.map((m) => line(monthLabel(m.month), m)), line("Total", r.total));
  } else if (p.tab === "orders") {
    const rows = await orderProfitability(db, { from: p.range?.from, to: p.range?.to, q: p.q, kind: p.kind, sort: p.sort });
    sheet("Order profit", `Order profitability, ${periodLabel(p.fy)}`, [
      { header: "Order", width: 22 }, { header: "Date", width: 12 }, { header: "Customer PO", width: 18 }, { header: "Customer", width: 34 },
      { header: "Type", width: 10 }, { header: "Project", width: 12 }, { header: "Status", width: 11 }, { header: "Order value", fmt: "inr", width: 15 },
      { header: "Invoiced", fmt: "inr", width: 15 }, { header: "Credit notes", fmt: "inr", width: 14 }, { header: "Revenue", fmt: "inr", width: 15 },
      { header: "Delivery cost", fmt: "inr", width: 15 }, { header: "Returned cost", fmt: "inr", width: 14 }, { header: "Cost", fmt: "inr", width: 15 },
      { header: "Gross profit", fmt: "inr", width: 15 }, { header: "Margin %", fmt: "pct" }, { header: "Delivered %", fmt: "pct" }, { header: "Lines without cost" },
    ], rows.map((r) => [r.number, r.orderDate, r.customerPoNumber, r.customerName, r.supplyOnly ? "Supply" : "Project", r.projectCode, r.status, r.orderValue,
      r.invoiced, r.creditNotes, r.revenue, r.deliveryCost, r.returnedCost, r.cost, r.grossProfit, r.revenue ? r.marginPct : null, r.deliveredPct, r.linesWithoutCost]));
  } else if (p.tab === "projects") {
    const rows = await projectProfitability(db, { status: p.status });
    sheet("Project profit", "Project profitability", [
      { header: "Code", width: 14 }, { header: "Project", width: 34 }, { header: "Customer", width: 30 }, { header: "Status", width: 11 },
      { header: "Contract value", fmt: "inr", width: 16 }, { header: "Budget", fmt: "inr", width: 15 }, { header: "Actual cost", fmt: "inr", width: 15 },
      { header: "Budget used %", fmt: "pct" }, { header: "Invoiced (net)", fmt: "inr", width: 15 }, { header: "Credit notes", fmt: "inr", width: 14 },
      { header: "Received", fmt: "inr", width: 15 }, { header: "Advances", fmt: "inr", width: 14 }, { header: "Net due", fmt: "inr", width: 15 },
      { header: "Margin", fmt: "inr", width: 15 }, { header: "Margin %", fmt: "pct" },
    ], rows.map((r) => [r.code, r.name, r.customerName, r.status, r.contractValue, r.budget, r.actualCost, r.budget ? r.budgetUsedPct : null, r.invoiced,
      r.creditNotes, r.received, r.advances, r.netDue, r.margin, r.contractValue ? r.marginPct : null]));
  } else if (p.tab === "customers") {
    const rows = await customerProfitability(db, { q: p.q });
    sheet("Customer profit", "Customer profitability", [
      { header: "Customer", width: 36 }, { header: "Invoiced", fmt: "inr", width: 16 }, { header: "Credit notes", fmt: "inr", width: 14 },
      { header: "Revenue", fmt: "inr", width: 16 }, { header: "Cost", fmt: "inr", width: 16 }, { header: "Gross profit", fmt: "inr", width: 16 },
      { header: "Margin %", fmt: "pct" }, { header: "Outstanding (incl. GST)", fmt: "inr", width: 20 }, { header: "Projects" },
    ], rows.map((r) => [r.name, r.invoiced, r.creditNotes, r.revenue, r.cost, r.grossProfit, r.revenue ? r.marginPct : null, r.outstanding, r.projectCount]));
  } else {
    const rows = await itemMargins(db, { q: p.q, system: p.system, today, onlyFlagged: p.flagged });
    sheet("Item margins", "Item margins: buying rate vs selling rate", [
      { header: "Code", width: 16 }, { header: "Item", width: 40 }, { header: "Group", width: 22 }, { header: "UOM", width: 8 },
      { header: "Avg buy 90 days", fmt: "inr", width: 15 }, { header: "Avg buy all time", fmt: "inr", width: 15 }, { header: "Latest cost", fmt: "inr", width: 14 },
      { header: "Avg sell", fmt: "inr", width: 14 }, { header: "Last sale rate", fmt: "inr", width: 14 }, { header: "Qty sold", fmt: "qty" },
      { header: "Margin %", fmt: "pct" }, { header: "Margin at latest cost %", fmt: "pct", width: 20 }, { header: "Last bought", width: 12 },
      { header: "Last sold", width: 12 }, { header: "Selling below cost" },
    ], rows.map((r) => [r.code, r.name, r.groupName, r.uom, r.avgPurchase90, r.avgPurchaseAll, r.latestCost, r.avgSale, r.lastSaleRate, r.qtySold,
      r.marginPct, r.marginAtLatestPct, r.lastPurchaseDate, r.lastSaleDate, r.sellingBelowCost ? "YES" : ""]));
  }

  const buf = await wb.xlsx.writeBuffer();
  await audit(db, user.id, "export", "report", null, { tab: p.tab, fy: p.fy });
  const fname = `LBE-${REPORT_TABS[p.tab].replace(/[^A-Za-z0-9]+/g, "-")}-${p.fy}-${today}.xlsx`;
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fname}"`,
      "Cache-Control": "no-store",
    },
  });
}
