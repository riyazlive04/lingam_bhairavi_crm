/**
 * Profit & loss reports (business rules 5, 12, 13, 15, 17 and 18). Maintainer: Sirah Digital.
 *
 * Two halves:
 *  1. Pure math helpers (no database): financial-year ranges, month keys, P&L line maths, margins.
 *     Unit tested in tests/unit/reports.test.ts.
 *  2. Report loaders `fn(db, opts)` that run grouped SQL aggregates in parallel and return plain arrays.
 *
 * Money is excl. GST everywhere except customer "outstanding" (which, like Billing, includes GST).
 */
import "server-only";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, ne, notInArray, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import type { DB } from "@/db";
import {
  customers, deliveries, deliveryLines, expenses, items, payments, priceHistory, projects, quotationLines, salesInvoiceLines,
  salesInvoices, salesOrderLines, salesOrders, salesReturnLines, salesReturns, stockMovements,
} from "@/db/schema";
import { projectCostSummary, type ProjectCost } from "./costing";
import { addDays, financialYear, round2, todayIST } from "./format";

// =====================================================================================================
// 1. Pure helpers
// =====================================================================================================

/** Profit as % of revenue, rounded to 2dp. 0 when there is no revenue. */
export function marginOf(profit: number, revenue: number): number {
  const r = Number(revenue) || 0;
  return r ? round2(((Number(profit) || 0) / r) * 100) : 0;
}

/** Σ value / Σ qty, or null when nothing was bought or sold. */
export function weightedAvg(value: number, quantity: number): number | null {
  const q = Number(quantity) || 0;
  return q > 0 ? round2((Number(value) || 0) / q) : null;
}

/** Indian financial year (April to March) date range: "2026-27" → 2026-04-01 .. 2027-03-31. */
export function fyBounds(fy: string): { from: string; to: string } {
  const start = Number(fy.slice(0, 4));
  if (!/^\d{4}-\d{2}$/.test(fy) || !Number.isFinite(start)) throw new Error(`Bad financial year: ${fy}`);
  return { from: `${start}-04-01`, to: `${start + 1}-03-31` };
}

/** True for a well-formed FY label like "2026-27" whose two halves are consecutive years. */
export function isFyLabel(fy: string | undefined | null): fy is string {
  if (!fy || !/^\d{4}-\d{2}$/.test(fy)) return false;
  const start = Number(fy.slice(0, 4));
  return (start + 1) % 100 === Number(fy.slice(5));
}

/** The current FY first, then the `count − 1` before it: ["2026-27", "2025-26", ...]. */
export function financialYearOptions(today: string, count = 5): string[] {
  const start = Number(financialYear(today).slice(0, 4));
  return Array.from({ length: count }, (_, i) => `${start - i}-${String((start - i + 1) % 100).padStart(2, "0")}`);
}

/** Month keys 'YYYY-MM' from the month of `from` to the month of `to`, oldest first. */
export function monthKeys(from: string, to: string): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7));
  const ey = Number(to.slice(0, 4)), em = Number(to.slice(5, 7));
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
    if (out.length > 240) break; // safety net for silly ranges
  }
  return out;
}

/** The 12 months ending with the month of `today`: first of month 11 months back .. today. */
export function last12Months(today: string): { from: string; to: string } {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  const d = new Date(Date.UTC(y, m - 1 - 11, 1));
  return { from: d.toISOString().slice(0, 10), to: today };
}

/** "2026-11" → "Nov 2026" */
export function monthLabel(m: string, short = false): string {
  return new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: short ? "2-digit" : "numeric", timeZone: "UTC" });
}

export type PnlInputs = {
  /** Σ issued invoice subtotals */
  invoiced: number;
  /** Σ posted credit-note subtotals */
  creditNotes: number;
  /** Σ delivery qty × costRate for orders without a project (rule 12) */
  deliveryCost: number;
  /** Σ project material issues (issue_project) */
  projectIssues: number;
  /** Σ materials returned from sites to store (stock `return` with a project) */
  siteReturns: number;
  /** Σ customer returns put back in stock (`sales_return`) */
  restockedReturns: number;
  /** Σ approved expenses */
  expenses: number;
};

export type PnlLine = PnlInputs & {
  sales: number;
  cogs: number;
  grossProfit: number;
  netProfit: number;
  grossMarginPct: number;
  netMarginPct: number;
};

/** Rule 18 maths for one period. */
export function pnlLine(i: PnlInputs): PnlLine {
  const r = (n: number) => round2(Number(n) || 0);
  const base: PnlInputs = {
    invoiced: r(i.invoiced), creditNotes: r(i.creditNotes), deliveryCost: r(i.deliveryCost), projectIssues: r(i.projectIssues),
    siteReturns: r(i.siteReturns), restockedReturns: r(i.restockedReturns), expenses: r(i.expenses),
  };
  const sales = round2(base.invoiced - base.creditNotes);
  const cogs = round2(base.deliveryCost + base.projectIssues - base.siteReturns - base.restockedReturns);
  const grossProfit = round2(sales - cogs);
  const netProfit = round2(grossProfit - base.expenses);
  return { ...base, sales, cogs, grossProfit, netProfit, grossMarginPct: marginOf(grossProfit, sales), netMarginPct: marginOf(netProfit, sales) };
}

export const EMPTY_PNL: PnlInputs = { invoiced: 0, creditNotes: 0, deliveryCost: 0, projectIssues: 0, siteReturns: 0, restockedReturns: 0, expenses: 0 };

/** Totals row for a list of P&L lines (margins recomputed on the totals, not averaged). */
export function sumPnl(rows: PnlInputs[]): PnlLine {
  const t = { ...EMPTY_PNL };
  for (const r of rows) for (const k of Object.keys(t) as (keyof PnlInputs)[]) t[k] += Number(r[k]) || 0;
  return pnlLine(t);
}

/** Rule 17 maths for one order. */
export function orderProfit(i: { invoiced: number; creditNotes: number; deliveryCost: number; returnedCost: number }) {
  const revenue = round2((Number(i.invoiced) || 0) - (Number(i.creditNotes) || 0));
  const cost = round2((Number(i.deliveryCost) || 0) - (Number(i.returnedCost) || 0));
  const grossProfit = round2(revenue - cost);
  return { revenue, cost, grossProfit, marginPct: marginOf(grossProfit, revenue) };
}

/** Delivered share of an order, capped per line so over-delivery never shows above 100%. */
export function deliveredPctOf(ordered: number, deliveredCapped: number): number {
  const o = Number(ordered) || 0;
  return o > 0 ? Math.min(100, round2(((Number(deliveredCapped) || 0) / o) * 100)) : 0;
}

/** One "buy vs sell" line: average buying rate vs selling rate for the qty actually used. */
export function buyVsSell(i: { qtyIssued: number; issueValue: number; qtyBack: number; sellRate: number | null }) {
  const qtyIssued = Number(i.qtyIssued) || 0;
  const netQty = round2(Math.max(0, qtyIssued - (Number(i.qtyBack) || 0)));
  const buyRate = weightedAvg(i.issueValue, qtyIssued);
  const sellRate = i.sellRate == null ? null : round2(i.sellRate);
  const marginPerUnit = buyRate != null && sellRate != null ? round2(sellRate - buyRate) : null;
  return {
    netQty, buyRate, sellRate, marginPerUnit,
    marginTotal: marginPerUnit != null ? round2(marginPerUnit * netQty) : null,
    marginPct: marginPerUnit != null && sellRate ? marginOf(marginPerUnit, sellRate) : null,
    belowCost: marginPerUnit != null && marginPerUnit < 0,
  };
}

// =====================================================================================================
// 2. Loaders
// =====================================================================================================

const n = (v: unknown) => Number(v ?? 0) || 0;
const INVOICE_EXCLUDED = ["draft", "cancelled"];
const ym = (col: AnyColumn) => sql<string>`to_char(${col}, 'YYYY-MM')`;

export type PnlMonth = PnlLine & { month: string };
export type PnlReport = { months: PnlMonth[]; total: PnlLine; deliveryLinesWithoutCost: number };

/**
 * Monthly business P&L (rule 18) between two dates (inclusive), one row per calendar month.
 * Sales by invoice / credit-note date, cost of goods by delivery / movement date, expenses by voucher date.
 */
export async function monthlyPnl(db: DB, opts: { from: string; to: string }): Promise<PnlReport> {
  const { from, to } = opts;
  const [inv, cn, del, mov, exp] = await Promise.all([
    db.select({ m: ym(salesInvoices.invoiceDate), v: sql<number>`coalesce(sum(${salesInvoices.subtotal}),0)`.mapWith(Number) })
      .from(salesInvoices)
      .where(and(notInArray(salesInvoices.status, INVOICE_EXCLUDED), gte(salesInvoices.invoiceDate, from), lte(salesInvoices.invoiceDate, to)))
      .groupBy(sql`1`),
    db.select({ m: ym(salesReturns.date), v: sql<number>`coalesce(sum(${salesReturns.subtotal}),0)`.mapWith(Number) })
      .from(salesReturns)
      .where(and(eq(salesReturns.status, "posted"), gte(salesReturns.date, from), lte(salesReturns.date, to)))
      .groupBy(sql`1`),
    db.select({
      m: ym(deliveries.date),
      v: sql<number>`coalesce(sum(${deliveryLines.qty} * ${deliveryLines.costRate}),0)`.mapWith(Number),
      missing: sql<number>`count(*) filter (where ${deliveryLines.costRate} <= 0 and ${deliveryLines.qty} > 0)`.mapWith(Number),
    })
      .from(deliveryLines)
      .innerJoin(deliveries, eq(deliveries.id, deliveryLines.deliveryId))
      .innerJoin(salesOrders, eq(salesOrders.id, deliveries.orderId))
      .where(and(isNull(salesOrders.projectId), gte(deliveries.date, from), lte(deliveries.date, to)))
      .groupBy(sql`1`),
    db.select({
      m: ym(stockMovements.date),
      type: stockMovements.type,
      v: sql<number>`coalesce(sum(abs(${stockMovements.qty}) * ${stockMovements.rate}),0)`.mapWith(Number),
    })
      .from(stockMovements)
      .where(and(
        gte(stockMovements.date, from), lte(stockMovements.date, to),
        or(
          and(inArray(stockMovements.type, ["issue_project", "return"]), sql`${stockMovements.projectId} is not null`),
          eq(stockMovements.type, "sales_return"),
        ),
      ))
      .groupBy(sql`1`, stockMovements.type),
    db.select({ m: ym(expenses.date), v: sql<number>`coalesce(sum(${expenses.amount}),0)`.mapWith(Number) })
      .from(expenses)
      .where(and(eq(expenses.status, "approved"), gte(expenses.date, from), lte(expenses.date, to)))
      .groupBy(sql`1`),
  ]);

  const keys = monthKeys(from, to);
  const acc = new Map<string, PnlInputs>(keys.map((k) => [k, { ...EMPTY_PNL }]));
  const add = (m: string, k: keyof PnlInputs, v: number) => { const a = acc.get(m); if (a) a[k] += n(v); };
  for (const r of inv) add(r.m, "invoiced", r.v);
  for (const r of cn) add(r.m, "creditNotes", r.v);
  let missing = 0;
  for (const r of del) { add(r.m, "deliveryCost", r.v); missing += n(r.missing); }
  for (const r of mov) add(r.m, r.type === "issue_project" ? "projectIssues" : r.type === "return" ? "siteReturns" : "restockedReturns", r.v);
  for (const r of exp) add(r.m, "expenses", r.v);

  const months = keys.map((m) => ({ month: m, ...pnlLine(acc.get(m)!) }));
  return { months, total: sumPnl(months), deliveryLinesWithoutCost: missing };
}

// ----------------------------------------------------------------------------------- order P&L (rule 17)
export type OrderPnl = {
  orderId: number;
  number: string;
  customerPoNumber: string | null;
  orderDate: string;
  status: string;
  customerId: number;
  customerName: string;
  projectId: number | null;
  projectCode: string | null;
  /** true when the order is not tied to a project (supply only) */
  supplyOnly: boolean;
  orderValue: number;
  invoiced: number;
  creditNotes: number;
  deliveryCost: number;
  returnedCost: number;
  revenue: number;
  cost: number;
  grossProfit: number;
  marginPct: number;
  deliveredPct: number;
  /** delivered lines that were recorded with no cost (cost of goods is understated) */
  linesWithoutCost: number;
};

async function loadOrderPnl(db: DB, where: SQL | undefined): Promise<OrderPnl[]> {
  const orders = await db
    .select({
      id: salesOrders.id, number: salesOrders.number, customerPoNumber: salesOrders.customerPoNumber, orderDate: salesOrders.orderDate,
      status: salesOrders.status, total: salesOrders.total, projectId: salesOrders.projectId, customerId: salesOrders.customerId,
      customerName: customers.name, projectCode: projects.code,
    })
    .from(salesOrders)
    .innerJoin(customers, eq(customers.id, salesOrders.customerId))
    .leftJoin(projects, eq(projects.id, salesOrders.projectId))
    .where(where)
    .orderBy(desc(salesOrders.orderDate), desc(salesOrders.id));
  if (!orders.length) return [];
  const ids = orders.map((o) => o.id);

  const [inv, cn, del, ret, lines] = await Promise.all([
    db.select({ id: salesInvoices.orderId, v: sql<number>`coalesce(sum(${salesInvoices.subtotal}),0)`.mapWith(Number) })
      .from(salesInvoices)
      .where(and(inArray(salesInvoices.orderId, ids), notInArray(salesInvoices.status, INVOICE_EXCLUDED)))
      .groupBy(salesInvoices.orderId),
    db.select({ id: salesReturns.orderId, v: sql<number>`coalesce(sum(${salesReturns.subtotal}),0)`.mapWith(Number) })
      .from(salesReturns)
      .where(and(inArray(salesReturns.orderId, ids), eq(salesReturns.status, "posted")))
      .groupBy(salesReturns.orderId),
    db.select({
      id: deliveries.orderId,
      v: sql<number>`coalesce(sum(${deliveryLines.qty} * ${deliveryLines.costRate}),0)`.mapWith(Number),
      missing: sql<number>`count(*) filter (where ${deliveryLines.costRate} <= 0 and ${deliveryLines.qty} > 0)`.mapWith(Number),
    })
      .from(deliveryLines)
      .innerJoin(deliveries, eq(deliveries.id, deliveryLines.deliveryId))
      .where(inArray(deliveries.orderId, ids))
      .groupBy(deliveries.orderId),
    db.select({ id: salesReturns.orderId, v: sql<number>`coalesce(sum(${salesReturnLines.qty} * ${salesReturnLines.costRate}),0)`.mapWith(Number) })
      .from(salesReturnLines)
      .innerJoin(salesReturns, eq(salesReturns.id, salesReturnLines.returnId))
      .where(and(inArray(salesReturns.orderId, ids), eq(salesReturns.status, "posted"), eq(salesReturnLines.restock, true)))
      .groupBy(salesReturns.orderId),
    db.select({
      id: salesOrderLines.orderId,
      ordered: sql<number>`coalesce(sum(${salesOrderLines.qty}),0)`.mapWith(Number),
      delivered: sql<number>`coalesce(sum(least(${salesOrderLines.deliveredQty} - ${salesOrderLines.returnedQty}, ${salesOrderLines.qty})),0)`.mapWith(Number),
    })
      .from(salesOrderLines)
      .where(and(inArray(salesOrderLines.orderId, ids), ne(salesOrderLines.deliveryStatus, "cancelled")))
      .groupBy(salesOrderLines.orderId),
  ]);
  const byId = <T extends { id: number | null }>(rows: T[]) => new Map(rows.map((r) => [Number(r.id), r]));
  const invM = byId(inv), cnM = byId(cn), delM = byId(del), retM = byId(ret), lineM = byId(lines);

  return orders.map((o) => {
    const parts = {
      invoiced: round2(n(invM.get(o.id)?.v)), creditNotes: round2(n(cnM.get(o.id)?.v)),
      deliveryCost: round2(n(delM.get(o.id)?.v)), returnedCost: round2(n(retM.get(o.id)?.v)),
    };
    const l = lineM.get(o.id);
    return {
      orderId: o.id, number: o.number, customerPoNumber: o.customerPoNumber, orderDate: o.orderDate, status: o.status,
      customerId: o.customerId, customerName: o.customerName, projectId: o.projectId, projectCode: o.projectCode ?? null,
      supplyOnly: o.projectId == null, orderValue: round2(n(o.total)),
      ...parts, ...orderProfit(parts),
      deliveredPct: deliveredPctOf(n(l?.ordered), n(l?.delivered)),
      linesWithoutCost: n(delM.get(o.id)?.missing),
    };
  });
}

export type OrderSort = "margin_asc" | "margin_desc" | "profit_desc" | "revenue_desc" | "date_desc";

/** Every sales order (cancelled excluded) with rule 17 revenue, cost and profit. */
export async function orderProfitability(
  db: DB,
  opts: { from?: string; to?: string; q?: string; kind?: "supply" | "project"; sort?: OrderSort } = {},
): Promise<OrderPnl[]> {
  const conds: SQL[] = [ne(salesOrders.status, "cancelled")];
  if (opts.from) conds.push(gte(salesOrders.orderDate, opts.from));
  if (opts.to) conds.push(lte(salesOrders.orderDate, opts.to));
  if (opts.kind === "supply") conds.push(isNull(salesOrders.projectId));
  if (opts.kind === "project") conds.push(sql`${salesOrders.projectId} is not null`);
  const q = opts.q?.trim();
  if (q) {
    const like = `%${q}%`;
    const c = or(ilike(salesOrders.number, like), ilike(salesOrders.customerPoNumber, like), ilike(customers.name, like));
    if (c) conds.push(c);
  }
  const rows = await loadOrderPnl(db, and(...conds));
  return sortOrders(rows, opts.sort ?? "margin_asc");
}

/** Sort order P&L rows. Orders with no revenue yet sink to the bottom of margin sorts. */
export function sortOrders<T extends { revenue: number; marginPct: number; grossProfit: number; orderDate: string; orderId: number }>(rows: T[], sort: OrderSort): T[] {
  const copy = [...rows];
  const hasRev = (r: T) => (r.revenue ? 0 : 1);
  switch (sort) {
    case "margin_asc": return copy.sort((a, b) => hasRev(a) - hasRev(b) || a.marginPct - b.marginPct || b.orderId - a.orderId);
    case "margin_desc": return copy.sort((a, b) => hasRev(a) - hasRev(b) || b.marginPct - a.marginPct || b.orderId - a.orderId);
    case "profit_desc": return copy.sort((a, b) => b.grossProfit - a.grossProfit || b.orderId - a.orderId);
    case "revenue_desc": return copy.sort((a, b) => b.revenue - a.revenue || b.orderId - a.orderId);
    default: return copy.sort((a, b) => (a.orderDate < b.orderDate ? 1 : a.orderDate > b.orderDate ? -1 : b.orderId - a.orderId));
  }
}

/** Rule 17 P&L for one order, or null when the order doesn't exist. */
export async function orderPnl(db: DB, opts: { orderId: number }): Promise<OrderPnl | null> {
  const [r] = await loadOrderPnl(db, eq(salesOrders.id, opts.orderId));
  return r ?? null;
}

// ----------------------------------------------------------------------------------- project profitability
export type ProjectProfit = ProjectCost & { customerName: string; billedProfit: number; billedMarginPct: number };

/** All projects with contract value, actual cost (rule 5), invoiced, received, margin and budget used. */
export async function projectProfitability(db: DB, opts: { status?: string } = {}): Promise<ProjectProfit[]> {
  const [costs, names] = await Promise.all([
    projectCostSummary(db),
    db.select({ id: projects.id, status: projects.status, customerName: customers.name })
      .from(projects).innerJoin(customers, eq(customers.id, projects.customerId)),
  ]);
  const nm = new Map(names.map((r) => [r.id, r.customerName]));
  return costs
    .filter((c) => !opts.status || c.status === opts.status)
    .map((c) => {
      const billedProfit = round2(c.invoiced - c.actualCost);
      return { ...c, customerName: nm.get(c.projectId) ?? "", billedProfit, billedMarginPct: marginOf(billedProfit, c.invoiced) };
    })
    .sort((a, b) => a.marginPct - b.marginPct || b.projectId - a.projectId);
}

// ----------------------------------------------------------------------------------- customer profitability
export type CustomerProfit = {
  customerId: number;
  name: string;
  invoiced: number;
  creditNotes: number;
  revenue: number;
  /** supply-order delivery cost (net of restocked returns) + project actual cost */
  cost: number;
  grossProfit: number;
  marginPct: number;
  /** incl. GST: open invoices − unadjusted credit notes − unused advances (rule 13) */
  outstanding: number;
  projectCount: number;
};

/**
 * Revenue, cost, margin and outstanding per customer.
 * Cost = delivery cost of their supply-only orders − restocked returns on those + actual cost of their projects (rule 5).
 */
export async function customerProfitability(db: DB, opts: { q?: string } = {}): Promise<CustomerProfit[]> {
  const nonProjectReturn = sql`coalesce(${salesReturns.projectId}, ${salesOrders.projectId}) is null`;
  const [list, inv, cn, adv, del, ret, projectCosts] = await Promise.all([
    db.select({ id: customers.id, name: customers.name }).from(customers)
      .where(opts.q?.trim() ? ilike(customers.name, `%${opts.q.trim()}%`) : undefined),
    db.select({
      id: salesInvoices.customerId,
      v: sql<number>`coalesce(sum(${salesInvoices.subtotal}),0)`.mapWith(Number),
      open: sql<number>`coalesce(sum(${salesInvoices.total} - ${salesInvoices.paidAmount}),0)`.mapWith(Number),
    }).from(salesInvoices).where(notInArray(salesInvoices.status, INVOICE_EXCLUDED)).groupBy(salesInvoices.customerId),
    db.select({
      id: salesReturns.customerId,
      v: sql<number>`coalesce(sum(${salesReturns.subtotal}),0)`.mapWith(Number),
      open: sql<number>`coalesce(sum(${salesReturns.total} - ${salesReturns.adjustedAmount}),0)`.mapWith(Number),
    }).from(salesReturns).where(eq(salesReturns.status, "posted")).groupBy(salesReturns.customerId),
    db.select({ id: payments.customerId, open: sql<number>`coalesce(sum(${payments.amount} - ${payments.allocatedAmount}),0)`.mapWith(Number) })
      .from(payments).where(and(eq(payments.direction, "in"), eq(payments.isAdvance, true))).groupBy(payments.customerId),
    db.select({ id: salesOrders.customerId, v: sql<number>`coalesce(sum(${deliveryLines.qty} * ${deliveryLines.costRate}),0)`.mapWith(Number) })
      .from(deliveryLines)
      .innerJoin(deliveries, eq(deliveries.id, deliveryLines.deliveryId))
      .innerJoin(salesOrders, eq(salesOrders.id, deliveries.orderId))
      .where(isNull(salesOrders.projectId))
      .groupBy(salesOrders.customerId),
    db.select({ id: salesReturns.customerId, v: sql<number>`coalesce(sum(${salesReturnLines.qty} * ${salesReturnLines.costRate}),0)`.mapWith(Number) })
      .from(salesReturnLines)
      .innerJoin(salesReturns, eq(salesReturns.id, salesReturnLines.returnId))
      .leftJoin(salesOrders, eq(salesOrders.id, salesReturns.orderId))
      .where(and(eq(salesReturns.status, "posted"), eq(salesReturnLines.restock, true), nonProjectReturn))
      .groupBy(salesReturns.customerId),
    projectCostSummary(db),
  ]);
  const m = <T extends { id: number | null }>(rows: T[]) => new Map(rows.map((r) => [Number(r.id), r]));
  const invM = m(inv), cnM = m(cn), advM = m(adv), delM = m(del), retM = m(ret);
  const proj = new Map<number, { cost: number; count: number }>();
  for (const p of projectCosts) {
    const e = proj.get(p.customerId) ?? { cost: 0, count: 0 };
    e.cost += p.actualCost;
    e.count += 1;
    proj.set(p.customerId, e);
  }
  const out: CustomerProfit[] = [];
  for (const c of list) {
    const invoiced = round2(n(invM.get(c.id)?.v));
    const creditNotes = round2(n(cnM.get(c.id)?.v));
    const p = proj.get(c.id);
    const cost = round2(n(delM.get(c.id)?.v) - n(retM.get(c.id)?.v) + (p?.cost ?? 0));
    const outstanding = round2(n(invM.get(c.id)?.open) - n(cnM.get(c.id)?.open) - n(advM.get(c.id)?.open));
    if (!invoiced && !creditNotes && !cost && Math.abs(outstanding) < 0.5 && !p) continue;
    const revenue = round2(invoiced - creditNotes);
    const grossProfit = round2(revenue - cost);
    out.push({
      customerId: c.id, name: c.name, invoiced, creditNotes, revenue, cost, grossProfit,
      marginPct: marginOf(grossProfit, revenue), outstanding, projectCount: p?.count ?? 0,
    });
  }
  return out.sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));
}

// ----------------------------------------------------------------------------------- item margins
export type ItemMargin = {
  itemId: number;
  code: string;
  name: string;
  system: string;
  groupName: string;
  uom: string;
  /** rule 1: items.lastPurchaseRate, else list price */
  latestCost: number | null;
  avgPurchase90: number | null;
  avgPurchaseAll: number | null;
  qtyPurchased: number;
  avgSale: number | null;
  qtySold: number;
  lastSaleRate: number | null;
  lastPurchaseDate: string | null;
  lastSaleDate: string | null;
  /** (avg sale − avg purchase, all time) / avg sale × 100 */
  marginPct: number | null;
  /** (last sale − latest cost) / last sale × 100 */
  marginAtLatestPct: number | null;
  /** last selling rate is below today's cost */
  sellingBelowCost: boolean;
};

/**
 * "Buy at one rate, sell at another": per item average purchase rate (last 90 days and all time, from price_history
 * kind 'purchase'), average selling rate (kind 'sale'), qty sold and margin. Only items with purchase or sale history.
 */
export async function itemMargins(db: DB, opts: { q?: string; system?: string; today?: string; onlyFlagged?: boolean } = {}): Promise<ItemMargin[]> {
  const today = opts.today ?? todayIST();
  const since90 = addDays(today, -90);
  const conds: SQL[] = [];
  const q = opts.q?.trim();
  if (q) {
    const like = `%${q}%`;
    const c = or(ilike(items.name, like), ilike(items.code, like), ilike(items.groupName, like), ilike(items.make, like));
    if (c) conds.push(c);
  }
  if (opts.system) conds.push(eq(items.system, opts.system));
  const itemFilter = conds.length ? and(...conds) : undefined;
  // keep the aggregates on the same item set (joined, so no huge IN lists)
  const scope = (kind: string) => and(eq(priceHistory.kind, kind), itemFilter);
  const wq = sql`coalesce(nullif(${priceHistory.qty}, 0), 1)`;

  const [list, buy, sell, lastSale] = await Promise.all([
    db.select({
      id: items.id, code: items.code, name: items.name, system: items.system, groupName: items.groupName, uom: items.uom,
      lastPurchaseRate: items.lastPurchaseRate, listPrice: items.listPrice,
    }).from(items).where(itemFilter).orderBy(asc(items.name)),
    db.select({
      id: priceHistory.itemId,
      val: sql<number>`coalesce(sum(${priceHistory.rate} * ${wq}),0)`.mapWith(Number),
      qty: sql<number>`coalesce(sum(${wq}),0)`.mapWith(Number),
      val90: sql<number>`coalesce(sum(${priceHistory.rate} * ${wq}) filter (where ${priceHistory.date} >= ${since90}::date),0)`.mapWith(Number),
      qty90: sql<number>`coalesce(sum(${wq}) filter (where ${priceHistory.date} >= ${since90}::date),0)`.mapWith(Number),
      bought: sql<number>`coalesce(sum(${priceHistory.qty}),0)`.mapWith(Number),
      last: sql<string | null>`max(${priceHistory.date})::text`,
    }).from(priceHistory).innerJoin(items, eq(items.id, priceHistory.itemId)).where(scope("purchase")).groupBy(priceHistory.itemId),
    db.select({
      id: priceHistory.itemId,
      val: sql<number>`coalesce(sum(${priceHistory.rate} * ${wq}),0)`.mapWith(Number),
      qty: sql<number>`coalesce(sum(${wq}),0)`.mapWith(Number),
      sold: sql<number>`coalesce(sum(${priceHistory.qty}),0)`.mapWith(Number),
      last: sql<string | null>`max(${priceHistory.date})::text`,
    }).from(priceHistory).innerJoin(items, eq(items.id, priceHistory.itemId)).where(scope("sale")).groupBy(priceHistory.itemId),
    db.selectDistinctOn([priceHistory.itemId], { id: priceHistory.itemId, rate: priceHistory.rate })
      .from(priceHistory).innerJoin(items, eq(items.id, priceHistory.itemId))
      .where(scope("sale"))
      .orderBy(priceHistory.itemId, desc(priceHistory.date), desc(priceHistory.id)),
  ]);
  const buyM = new Map(buy.map((r) => [r.id, r])), sellM = new Map(sell.map((r) => [r.id, r])), lastM = new Map(lastSale.map((r) => [r.id, n(r.rate)]));

  const out: ItemMargin[] = [];
  for (const it of list) {
    const b = buyM.get(it.id), s = sellM.get(it.id);
    if (!b && !s) continue;
    const latestCost = it.lastPurchaseRate != null ? n(it.lastPurchaseRate) : it.listPrice != null ? n(it.listPrice) : null;
    const avgPurchaseAll = b ? weightedAvg(b.val, b.qty) : null;
    const avgSale = s ? weightedAvg(s.val, s.qty) : null;
    const lastSaleRate = lastM.has(it.id) ? round2(lastM.get(it.id)!) : null;
    const row: ItemMargin = {
      itemId: it.id, code: it.code, name: it.name, system: it.system, groupName: it.groupName, uom: it.uom,
      latestCost: latestCost == null ? null : round2(latestCost),
      avgPurchase90: b ? weightedAvg(b.val90, b.qty90) : null,
      avgPurchaseAll, qtyPurchased: round2(n(b?.bought)),
      avgSale, qtySold: round2(n(s?.sold)), lastSaleRate,
      lastPurchaseDate: b?.last ?? null, lastSaleDate: s?.last ?? null,
      marginPct: avgSale != null && avgPurchaseAll != null ? marginOf(avgSale - avgPurchaseAll, avgSale) : null,
      marginAtLatestPct: lastSaleRate != null && latestCost != null ? marginOf(lastSaleRate - latestCost, lastSaleRate) : null,
      sellingBelowCost: lastSaleRate != null && latestCost != null && latestCost > 0 && lastSaleRate < latestCost - 0.004,
    };
    if (opts.onlyFlagged && !row.sellingBelowCost) continue;
    out.push(row);
  }
  // problems first, then the thinnest margins
  return out.sort((a, b) => Number(b.sellingBelowCost) - Number(a.sellingBelowCost) || (a.marginPct ?? 999) - (b.marginPct ?? 999) || a.name.localeCompare(b.name));
}

// ----------------------------------------------------------------------------------- project buy vs sell
export type BuyVsSellRow = ReturnType<typeof buyVsSell> & {
  itemId: number;
  code: string;
  name: string;
  uom: string;
  qtyIssued: number;
  /** returned to store from site + customer returns put back in stock */
  qtyBack: number;
  issueValue: number;
  /** where the selling rate came from */
  sellSource: "invoice" | "order" | "quotation" | null;
};

/**
 * Per item used on a project: qty issued, average buying rate (issue movements), selling rate
 * (project invoices, else the project's order lines, else its quotation supply rate) and margin.
 */
export async function projectBuyVsSell(db: DB, opts: { projectId: number }): Promise<BuyVsSellRow[]> {
  const pid = opts.projectId;
  const [proj] = await db.select({ quotationId: projects.quotationId }).from(projects).where(eq(projects.id, pid)).limit(1);
  if (!proj) return [];
  const [mov, inv, ord, quo] = await Promise.all([
    db.select({
      id: stockMovements.itemId, type: stockMovements.type,
      qty: sql<number>`coalesce(sum(abs(${stockMovements.qty})),0)`.mapWith(Number),
      val: sql<number>`coalesce(sum(abs(${stockMovements.qty}) * ${stockMovements.rate}),0)`.mapWith(Number),
    }).from(stockMovements)
      .where(and(eq(stockMovements.projectId, pid), inArray(stockMovements.type, ["issue_project", "return", "sales_return"])))
      .groupBy(stockMovements.itemId, stockMovements.type),
    db.select({
      id: salesInvoiceLines.itemId,
      qty: sql<number>`coalesce(sum(${salesInvoiceLines.qty}),0)`.mapWith(Number),
      val: sql<number>`coalesce(sum(${salesInvoiceLines.qty} * ${salesInvoiceLines.rate}),0)`.mapWith(Number),
    }).from(salesInvoiceLines).innerJoin(salesInvoices, eq(salesInvoices.id, salesInvoiceLines.invoiceId))
      .where(and(eq(salesInvoices.projectId, pid), notInArray(salesInvoices.status, INVOICE_EXCLUDED), sql`${salesInvoiceLines.itemId} is not null`))
      .groupBy(salesInvoiceLines.itemId),
    db.select({
      id: salesOrderLines.itemId,
      qty: sql<number>`coalesce(sum(${salesOrderLines.qty}),0)`.mapWith(Number),
      val: sql<number>`coalesce(sum(${salesOrderLines.qty} * ${salesOrderLines.rate}),0)`.mapWith(Number),
    }).from(salesOrderLines).innerJoin(salesOrders, eq(salesOrders.id, salesOrderLines.orderId))
      .where(and(eq(salesOrders.projectId, pid), ne(salesOrders.status, "cancelled"), ne(salesOrderLines.deliveryStatus, "cancelled"), sql`${salesOrderLines.itemId} is not null`))
      .groupBy(salesOrderLines.itemId),
    proj.quotationId
      ? db.select({
        id: quotationLines.itemId,
        qty: sql<number>`coalesce(sum(${quotationLines.qty}),0)`.mapWith(Number),
        val: sql<number>`coalesce(sum(${quotationLines.qty} * ${quotationLines.supplyRate}),0)`.mapWith(Number),
      }).from(quotationLines)
        .where(and(eq(quotationLines.quotationId, proj.quotationId), sql`${quotationLines.itemId} is not null`, sql`${quotationLines.qty} > 0`))
        .groupBy(quotationLines.itemId)
      : Promise.resolve([] as { id: number | null; qty: number; val: number }[]),
  ]);

  const used = new Map<number, { qtyIssued: number; issueValue: number; qtyBack: number }>();
  for (const r of mov) {
    const e = used.get(r.id) ?? { qtyIssued: 0, issueValue: 0, qtyBack: 0 };
    if (r.type === "issue_project") { e.qtyIssued += n(r.qty); e.issueValue += n(r.val); } else e.qtyBack += n(r.qty);
    used.set(r.id, e);
  }
  const ids = [...used.entries()].filter(([, e]) => e.qtyIssued > 0).map(([id]) => id);
  if (!ids.length) return [];
  const info = await db.select({ id: items.id, code: items.code, name: items.name, uom: items.uom }).from(items).where(inArray(items.id, ids));
  const rate = (rows: { id: number | null; qty: number; val: number }[]) =>
    new Map(rows.filter((r) => r.id != null).map((r) => [Number(r.id), weightedAvg(r.val, r.qty)]));
  const invR = rate(inv), ordR = rate(ord), quoR = rate(quo);
  const infoM = new Map(info.map((i) => [i.id, i]));

  return ids.map((id) => {
    const e = used.get(id)!;
    const it = infoM.get(id);
    const src: BuyVsSellRow["sellSource"] = invR.get(id) != null ? "invoice" : ordR.get(id) != null ? "order" : quoR.get(id) != null ? "quotation" : null;
    const sellRate = src === "invoice" ? invR.get(id)! : src === "order" ? ordR.get(id)! : src === "quotation" ? quoR.get(id)! : null;
    return {
      itemId: id, code: it?.code ?? "", name: it?.name ?? `Item ${id}`, uom: it?.uom ?? "",
      qtyIssued: round2(e.qtyIssued), qtyBack: round2(e.qtyBack), issueValue: round2(e.issueValue), sellSource: src,
      ...buyVsSell({ qtyIssued: e.qtyIssued, issueValue: e.issueValue, qtyBack: e.qtyBack, sellRate }),
    };
  }).sort((a, b) => Number(b.belowCost) - Number(a.belowCost) || (a.marginPct ?? 999) - (b.marginPct ?? 999) || b.issueValue - a.issueValue);
}
