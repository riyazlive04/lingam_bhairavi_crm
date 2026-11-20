import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DB } from "@/db";
import {
  customers, expenseAllocations, expenses, items, payments, projects, purchaseInvoices, quotations, salesInvoices,
  salesOrderLines, salesOrders, stockMovements, users, vendors,
} from "@/db/schema";
import { projectCost } from "@/lib/costing";
import { round2 } from "@/lib/format";

/** Everything needed for the project costing sheet (page + Excel export). */
export async function loadCostingSheet(db: DB, projectId: number) {
  const engineer = alias(users, "engineer");
  const [head] = await db
    .select({ p: projects, customerName: customers.name, engineerName: engineer.name, quotationNumber: quotations.number })
    .from(projects)
    .innerJoin(customers, eq(customers.id, projects.customerId))
    .leftJoin(engineer, eq(engineer.id, projects.engineerId))
    .leftJoin(quotations, eq(quotations.id, projects.quotationId))
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!head) return null;

  const submitter = alias(users, "submitter");
  const [cost, movements, purchaseRows, expenseRows, invoiceRows, orderRows] = await Promise.all([
    projectCost(db, projectId),
    db
      .select({
        id: stockMovements.id, date: stockMovements.date, type: stockMovements.type, qty: stockMovements.qty, rate: stockMovements.rate,
        refType: stockMovements.refType, refId: stockMovements.refId, notes: stockMovements.notes,
        itemCode: items.code, itemName: items.name, uom: items.uom,
      })
      .from(stockMovements)
      .innerJoin(items, eq(items.id, stockMovements.itemId))
      .where(and(eq(stockMovements.projectId, projectId), inArray(stockMovements.type, ["issue_project", "return"])))
      .orderBy(asc(stockMovements.date), asc(stockMovements.id)),
    db
      .select({
        id: purchaseInvoices.id, invoiceNo: purchaseInvoices.invoiceNo, invoiceDate: purchaseInvoices.invoiceDate, status: purchaseInvoices.status,
        subtotal: purchaseInvoices.subtotal, total: purchaseInvoices.total, vendorName: vendors.name,
      })
      .from(purchaseInvoices)
      .innerJoin(vendors, eq(vendors.id, purchaseInvoices.vendorId))
      .where(eq(purchaseInvoices.projectId, projectId))
      .orderBy(desc(purchaseInvoices.invoiceDate)),
    db
      .select({
        allocationId: expenseAllocations.id, amount: expenseAllocations.amount,
        expenseId: expenses.id, voucherNo: expenses.voucherNo, date: expenses.date, category: expenses.category, status: expenses.status,
        description: expenses.description, paidTo: expenses.paidTo, voucherTotal: expenses.amount, userName: submitter.name, userId: expenses.userId,
      })
      .from(expenseAllocations)
      .innerJoin(expenses, eq(expenses.id, expenseAllocations.expenseId))
      .leftJoin(submitter, eq(submitter.id, expenses.userId))
      .where(eq(expenseAllocations.projectId, projectId))
      .orderBy(desc(expenses.date), desc(expenses.id)),
    db
      .select({
        id: salesInvoices.id, number: salesInvoices.number, invoiceDate: salesInvoices.invoiceDate, dueDate: salesInvoices.dueDate,
        subtotal: salesInvoices.subtotal, total: salesInvoices.total, paidAmount: salesInvoices.paidAmount, status: salesInvoices.status,
      })
      .from(salesInvoices)
      .where(eq(salesInvoices.projectId, projectId))
      .orderBy(desc(salesInvoices.invoiceDate)),
    db
      .select({
        id: salesOrders.id, number: salesOrders.number, customerPoNumber: salesOrders.customerPoNumber, orderDate: salesOrders.orderDate,
        status: salesOrders.status, total: salesOrders.total, expectedDelivery: salesOrders.expectedDelivery,
      })
      .from(salesOrders)
      .where(eq(salesOrders.projectId, projectId))
      .orderBy(desc(salesOrders.orderDate)),
  ]);

  const invoiceIds = invoiceRows.map((i) => i.id);
  const orderIds = orderRows.map((o) => o.id);
  const [receiptRows, lineRows] = await Promise.all([
    invoiceIds.length
      ? db
          .select({ id: payments.id, date: payments.date, amount: payments.amount, mode: payments.mode, reference: payments.reference, invoiceNumber: salesInvoices.number })
          .from(payments)
          .innerJoin(salesInvoices, eq(salesInvoices.id, payments.salesInvoiceId))
          .where(and(eq(payments.direction, "in"), inArray(payments.salesInvoiceId, invoiceIds)))
          .orderBy(desc(payments.date))
      : Promise.resolve([]),
    orderIds.length
      ? db
          .select({ orderId: salesOrderLines.orderId, qty: salesOrderLines.qty, deliveredQty: salesOrderLines.deliveredQty, status: salesOrderLines.deliveryStatus })
          .from(salesOrderLines)
          .where(inArray(salesOrderLines.orderId, orderIds))
      : Promise.resolve([]),
  ]);

  const orders = orderRows.map((o) => {
    const lines = lineRows.filter((l) => l.orderId === o.id && l.status !== "cancelled");
    const ordered = lines.reduce((a, l) => a + Number(l.qty), 0);
    const delivered = lines.reduce((a, l) => a + Math.min(Number(l.deliveredQty), Number(l.qty)), 0);
    const pendingLines = lines.filter((l) => Number(l.deliveredQty) < Number(l.qty)).length;
    return { ...o, lineCount: lines.length, pendingLines, deliveredPct: ordered ? round2((delivered / ordered) * 100) : 0 };
  });

  const materials = movements.map((m) => ({ ...m, absQty: Math.abs(Number(m.qty)), value: round2(Math.abs(Number(m.qty)) * Number(m.rate)) }));

  return {
    project: head.p,
    customerName: head.customerName,
    engineerName: head.engineerName,
    quotationNumber: head.quotationNumber,
    cost: cost!,
    issues: materials.filter((m) => m.type === "issue_project"),
    returns: materials.filter((m) => m.type === "return"),
    purchases: purchaseRows,
    expenses: expenseRows,
    invoices: invoiceRows,
    receipts: receiptRows,
    orders,
  };
}

export type CostingSheet = NonNullable<Awaited<ReturnType<typeof loadCostingSheet>>>;
