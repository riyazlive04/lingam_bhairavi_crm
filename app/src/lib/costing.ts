/**
 * Project cost centre (business rules 5, 13 and 15). Maintainer: Sirah Digital.
 *
 * actualCost = Σ |qty|×rate of stock_movements `issue_project`
 *            − Σ |qty|×rate of stock_movements `return` (site back to store)
 *            − Σ |qty|×rate of stock_movements `sales_return` (customer returns put back in stock, rule 13)
 *            + Σ expense_allocations.amount of APPROVED expenses
 * margin     = contractValue − actualCost
 *
 * Billing side (excl. GST):
 *   invoicedGross = Σ sales_invoices.subtotal (draft and cancelled excluded)
 *   creditNotes   = Σ posted sales_returns.subtotal for the project
 *   invoiced      = invoicedGross − creditNotes
 * Cash side (incl. GST, rule 15):
 *   received = Σ invoice paidAmount
 *            − credit-note adjustments booked into paidAmount (they are not cash)
 *            − allocations from this project's own advances into its invoices (counted once, below)
 *            + Σ advances received for the project (payments.isAdvance with projectId)
 *   netDue   = Σ invoice (total − paidAmount) − Σ posted credit notes (total − adjustedAmount)
 *            − Σ project advances (amount − allocatedAmount)   (same shape as the rule 13 customer outstanding)
 *
 * A credit note belongs to a project through its own projectId, else through its invoice, else its order.
 */
import "server-only";
import { and, eq, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import type { DB } from "@/db";
import {
  expenseAllocations, expenses, paymentAllocations, payments, projects, salesInvoices, salesOrders, salesReturns, stockMovements,
} from "@/db/schema";
import { round2 } from "./format";

export type ProjectCost = {
  projectId: number;
  code: string;
  name: string;
  status: string;
  customerId: number;
  engineerId: number | null;
  /** value of materials issued to the project (purchase-rate based) */
  materials: number;
  /** value of materials returned from the project back to stock */
  returns: number;
  /** cost value of customer returns put back into stock for this project (rule 13) */
  customerReturns: number;
  /** approved expense allocations grouped by expense category key */
  expensesByCategory: Record<string, number>;
  /** Σ approved expense allocations */
  expenses: number;
  /** Σ allocations of vouchers still pending approval (NOT included in actualCost) */
  pendingExpenses: number;
  actualCost: number;
  contractValue: number;
  budget: number;
  /** Σ sales invoice subtotal (excl. GST) before credit notes */
  invoicedGross: number;
  /** Σ posted credit note subtotals (excl. GST) for the project */
  creditNotes: number;
  /** invoicedGross − creditNotes (excl. GST) */
  invoiced: number;
  /** cash received for the project: invoice receipts + advances (credit-note adjustments excluded) */
  received: number;
  /** Σ advances received for the project (already part of received) */
  advances: number;
  /** what the customer still owes on this project, incl. GST, after credit notes and unused advances */
  netDue: number;
  margin: number;
  /** margin as % of contract value (0 when contract value is 0) */
  marginPct: number;
  /** actualCost as % of budget (0 when budget is 0) */
  budgetUsedPct: number;
};

const EXCLUDED_INVOICE_STATUSES = ["draft", "cancelled"];

type Acc = ProjectCost & { paid: number; open: number; cnAdjusted: number; cnOpen: number; advOpen: number; selfAlloc: number };

/**
 * Cost summary for many projects: one lookup plus six grouped aggregates run in parallel.
 * `projectIds` omitted → all projects. Result is ordered by project id.
 */
export async function projectCostSummary(db: DB, projectIds?: number[]): Promise<ProjectCost[]> {
  if (projectIds && projectIds.length === 0) return [];
  const ids = projectIds ? [...new Set(projectIds)] : undefined;

  const projectRows = await db
    .select({
      id: projects.id, code: projects.code, name: projects.name, status: projects.status,
      customerId: projects.customerId, engineerId: projects.engineerId,
      contractValue: projects.contractValue, budget: projects.budget,
    })
    .from(projects)
    .where(ids ? inArray(projects.id, ids) : undefined)
    .orderBy(projects.id);
  if (!projectRows.length) return [];
  const pids = projectRows.map((p) => p.id);

  const cnProject = sql<number>`coalesce(${salesReturns.projectId}, ${salesInvoices.projectId}, ${salesOrders.projectId})`;

  const [stockRows, expenseRows, invoiceRows, creditRows, advanceRows, selfAllocRows] = await Promise.all([
    db
      .select({
        projectId: stockMovements.projectId,
        type: stockMovements.type,
        value: sql<number>`coalesce(sum(abs(${stockMovements.qty}) * ${stockMovements.rate}), 0)`.mapWith(Number),
      })
      .from(stockMovements)
      .where(and(
        isNotNull(stockMovements.projectId),
        inArray(stockMovements.projectId, pids),
        inArray(stockMovements.type, ["issue_project", "return", "sales_return"]),
      ))
      .groupBy(stockMovements.projectId, stockMovements.type),
    db
      .select({
        projectId: expenseAllocations.projectId,
        category: expenses.category,
        status: expenses.status,
        value: sql<number>`coalesce(sum(${expenseAllocations.amount}), 0)`.mapWith(Number),
      })
      .from(expenseAllocations)
      .innerJoin(expenses, eq(expenses.id, expenseAllocations.expenseId))
      .where(and(inArray(expenseAllocations.projectId, pids), inArray(expenses.status, ["approved", "pending"])))
      .groupBy(expenseAllocations.projectId, expenses.category, expenses.status),
    db
      .select({
        projectId: salesInvoices.projectId,
        invoiced: sql<number>`coalesce(sum(${salesInvoices.subtotal}), 0)`.mapWith(Number),
        paid: sql<number>`coalesce(sum(${salesInvoices.paidAmount}), 0)`.mapWith(Number),
        open: sql<number>`coalesce(sum(${salesInvoices.total} - ${salesInvoices.paidAmount}), 0)`.mapWith(Number),
      })
      .from(salesInvoices)
      .where(and(
        isNotNull(salesInvoices.projectId),
        inArray(salesInvoices.projectId, pids),
        notInArray(salesInvoices.status, EXCLUDED_INVOICE_STATUSES),
      ))
      .groupBy(salesInvoices.projectId),
    db
      .select({
        projectId: cnProject,
        subtotal: sql<number>`coalesce(sum(${salesReturns.subtotal}), 0)`.mapWith(Number),
        unadjusted: sql<number>`coalesce(sum(${salesReturns.total} - ${salesReturns.adjustedAmount}), 0)`.mapWith(Number),
        adjusted: sql<number>`coalesce(sum(${salesReturns.adjustedAmount}), 0)`.mapWith(Number),
      })
      .from(salesReturns)
      .leftJoin(salesInvoices, eq(salesInvoices.id, salesReturns.salesInvoiceId))
      .leftJoin(salesOrders, eq(salesOrders.id, salesReturns.orderId))
      .where(and(eq(salesReturns.status, "posted"), inArray(cnProject, pids)))
      .groupBy(cnProject),
    db
      .select({
        projectId: payments.projectId,
        amount: sql<number>`coalesce(sum(${payments.amount}), 0)`.mapWith(Number),
        unallocated: sql<number>`coalesce(sum(${payments.amount} - ${payments.allocatedAmount}), 0)`.mapWith(Number),
      })
      .from(payments)
      .where(and(eq(payments.direction, "in"), eq(payments.isAdvance, true), inArray(payments.projectId, pids)))
      .groupBy(payments.projectId),
    db
      .select({
        projectId: payments.projectId,
        amount: sql<number>`coalesce(sum(${paymentAllocations.amount}), 0)`.mapWith(Number),
      })
      .from(paymentAllocations)
      .innerJoin(payments, eq(payments.id, paymentAllocations.paymentId))
      .innerJoin(salesInvoices, eq(salesInvoices.id, paymentAllocations.salesInvoiceId))
      .where(and(
        eq(payments.isAdvance, true),
        inArray(payments.projectId, pids),
        sql`${salesInvoices.projectId} = ${payments.projectId}`,
        notInArray(salesInvoices.status, EXCLUDED_INVOICE_STATUSES),
      ))
      .groupBy(payments.projectId),
  ]);

  const out = new Map<number, Acc>();
  for (const p of projectRows) {
    out.set(p.id, {
      projectId: p.id, code: p.code, name: p.name, status: p.status, customerId: p.customerId, engineerId: p.engineerId,
      materials: 0, returns: 0, customerReturns: 0, expensesByCategory: {}, expenses: 0, pendingExpenses: 0, actualCost: 0,
      contractValue: Number(p.contractValue) || 0, budget: Number(p.budget) || 0,
      invoicedGross: 0, creditNotes: 0, invoiced: 0, received: 0, advances: 0, netDue: 0,
      margin: 0, marginPct: 0, budgetUsedPct: 0,
      paid: 0, open: 0, cnAdjusted: 0, cnOpen: 0, advOpen: 0, selfAlloc: 0,
    });
  }
  const get = (id: number | null | undefined) => (id != null ? out.get(Number(id)) : undefined);
  for (const r of stockRows) {
    const c = get(r.projectId);
    if (!c) continue;
    if (r.type === "issue_project") c.materials += Number(r.value);
    else if (r.type === "return") c.returns += Number(r.value);
    else c.customerReturns += Number(r.value);
  }
  for (const r of expenseRows) {
    const c = get(r.projectId);
    if (!c) continue;
    const v = Number(r.value);
    if (r.status === "approved") {
      c.expenses += v;
      c.expensesByCategory[r.category] = round2((c.expensesByCategory[r.category] ?? 0) + v);
    } else {
      c.pendingExpenses += v;
    }
  }
  for (const r of invoiceRows) {
    const c = get(r.projectId);
    if (!c) continue;
    c.invoicedGross += Number(r.invoiced);
    c.paid += Number(r.paid);
    c.open += Number(r.open);
  }
  for (const r of creditRows) {
    const c = get(r.projectId);
    if (!c) continue;
    c.creditNotes += Number(r.subtotal);
    c.cnAdjusted += Number(r.adjusted);
    c.cnOpen += Number(r.unadjusted);
  }
  for (const r of advanceRows) {
    const c = get(r.projectId);
    if (!c) continue;
    c.advances += Number(r.amount);
    c.advOpen += Number(r.unallocated);
  }
  for (const r of selfAllocRows) {
    const c = get(r.projectId);
    if (c) c.selfAlloc += Number(r.amount);
  }

  const res: ProjectCost[] = [];
  for (const a of out.values()) {
    const { paid, open, cnAdjusted, cnOpen, advOpen, selfAlloc, ...c } = a;
    c.materials = round2(c.materials);
    c.returns = round2(c.returns);
    c.customerReturns = round2(c.customerReturns);
    c.expenses = round2(c.expenses);
    c.pendingExpenses = round2(c.pendingExpenses);
    c.invoicedGross = round2(c.invoicedGross);
    c.creditNotes = round2(c.creditNotes);
    c.invoiced = round2(c.invoicedGross - c.creditNotes);
    c.advances = round2(c.advances);
    c.received = round2(Math.max(0, paid - cnAdjusted - selfAlloc) + c.advances);
    c.netDue = round2(open - cnOpen - advOpen);
    c.actualCost = round2(c.materials - c.returns - c.customerReturns + c.expenses);
    c.margin = round2(c.contractValue - c.actualCost);
    c.marginPct = c.contractValue ? round2((c.margin / c.contractValue) * 100) : 0;
    c.budgetUsedPct = c.budget ? round2((c.actualCost / c.budget) * 100) : 0;
    res.push(c);
  }
  return res;
}

/** Cost summary for one project, or null if it doesn't exist. */
export async function projectCost(db: DB, projectId: number): Promise<ProjectCost | null> {
  const [c] = await projectCostSummary(db, [projectId]);
  return c ?? null;
}
