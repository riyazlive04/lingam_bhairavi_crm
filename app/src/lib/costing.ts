/**
 * Project cost centre (business rule 5). Maintainer: Sirah Digital.
 *
 * actualCost = Σ |qty|×rate of stock_movements `issue_project`
 *            − Σ |qty|×rate of stock_movements `return`
 *            + Σ expense_allocations.amount of APPROVED expenses
 * margin     = contractValue − actualCost
 *
 * Also exposes "how much I billed / received / what is standing" per project:
 * invoiced = Σ sales_invoices.subtotal (excl. tax), received = Σ paidAmount (draft & cancelled invoices excluded).
 */
import "server-only";
import { and, eq, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { expenseAllocations, expenses, projects, salesInvoices, stockMovements } from "@/db/schema";
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
  /** approved expense allocations grouped by expense category key */
  expensesByCategory: Record<string, number>;
  /** Σ approved expense allocations */
  expenses: number;
  /** Σ allocations of vouchers still pending approval (NOT included in actualCost) */
  pendingExpenses: number;
  actualCost: number;
  contractValue: number;
  budget: number;
  /** Σ sales invoice subtotal (excl. GST) */
  invoiced: number;
  /** Σ sales invoice paidAmount */
  received: number;
  margin: number;
  /** margin as % of contract value (0 when contract value is 0) */
  marginPct: number;
  /** actualCost as % of budget (0 when budget is 0) */
  budgetUsedPct: number;
};

const EXCLUDED_INVOICE_STATUSES = ["draft", "cancelled"];

/**
 * Cost summary for many projects in 4 grouped queries.
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

  const [stockRows, expenseRows, invoiceRows] = await Promise.all([
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
        inArray(stockMovements.type, ["issue_project", "return"]),
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
        received: sql<number>`coalesce(sum(${salesInvoices.paidAmount}), 0)`.mapWith(Number),
      })
      .from(salesInvoices)
      .where(and(
        isNotNull(salesInvoices.projectId),
        inArray(salesInvoices.projectId, pids),
        notInArray(salesInvoices.status, EXCLUDED_INVOICE_STATUSES),
      ))
      .groupBy(salesInvoices.projectId),
  ]);

  const out = new Map<number, ProjectCost>();
  for (const p of projectRows) {
    out.set(p.id, {
      projectId: p.id, code: p.code, name: p.name, status: p.status, customerId: p.customerId, engineerId: p.engineerId,
      materials: 0, returns: 0, expensesByCategory: {}, expenses: 0, pendingExpenses: 0, actualCost: 0,
      contractValue: Number(p.contractValue) || 0, budget: Number(p.budget) || 0,
      invoiced: 0, received: 0, margin: 0, marginPct: 0, budgetUsedPct: 0,
    });
  }
  for (const r of stockRows) {
    const c = r.projectId != null ? out.get(r.projectId) : undefined;
    if (!c) continue;
    if (r.type === "issue_project") c.materials += Number(r.value);
    else c.returns += Number(r.value);
  }
  for (const r of expenseRows) {
    const c = out.get(r.projectId);
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
    const c = r.projectId != null ? out.get(r.projectId) : undefined;
    if (!c) continue;
    c.invoiced += Number(r.invoiced);
    c.received += Number(r.received);
  }
  for (const c of out.values()) {
    c.materials = round2(c.materials);
    c.returns = round2(c.returns);
    c.expenses = round2(c.expenses);
    c.pendingExpenses = round2(c.pendingExpenses);
    c.invoiced = round2(c.invoiced);
    c.received = round2(c.received);
    c.actualCost = round2(c.materials - c.returns + c.expenses);
    c.margin = round2(c.contractValue - c.actualCost);
    c.marginPct = c.contractValue ? round2((c.margin / c.contractValue) * 100) : 0;
    c.budgetUsedPct = c.budget ? round2((c.actualCost / c.budget) * 100) : 0;
  }
  return [...out.values()];
}

/** Cost summary for one project, or null if it doesn't exist. */
export async function projectCost(db: DB, projectId: number): Promise<ProjectCost | null> {
  const [c] = await projectCostSummary(db, [projectId]);
  return c ?? null;
}
