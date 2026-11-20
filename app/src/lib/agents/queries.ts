/** Read-only queries shared by the Dashboard and the startup digest pop-up. */
import "server-only";
import { and, asc, desc, eq, inArray, lt, lte, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { alerts, customers, expenses, extinguisherAssets, quotations, salesInvoices, salesOrderLines, salesOrders, users } from "@/db/schema";
import type { Role } from "@/lib/constants";
import { addDays } from "@/lib/format";
import { PENDING_LINE_WHERE } from "./operations";
import { alertScope } from "./scope";

const effExpected = sql<string | null>`coalesce(${salesOrderLines.expectedDate}, ${salesOrders.expectedDelivery})::text`;

export async function pendingDeliveryLines(db: DB, limit = 10) {
  return db
    .select({
      lineId: salesOrderLines.id, orderId: salesOrders.id, orderNumber: salesOrders.number, poNumber: salesOrders.customerPoNumber,
      customer: customers.name, description: salesOrderLines.description, qty: salesOrderLines.qty, deliveredQty: salesOrderLines.deliveredQty,
      uom: salesOrderLines.uom, status: salesOrderLines.deliveryStatus, expected: effExpected, orderDate: salesOrders.orderDate,
    })
    .from(salesOrderLines)
    .innerJoin(salesOrders, eq(salesOrders.id, salesOrderLines.orderId))
    .innerJoin(customers, eq(customers.id, salesOrders.customerId))
    .where(PENDING_LINE_WHERE)
    .orderBy(sql`coalesce(${salesOrderLines.expectedDate}, ${salesOrders.expectedDelivery}) asc nulls last`, asc(salesOrders.orderDate), asc(salesOrderLines.sortOrder))
    .limit(limit);
}

export async function pendingDeliveryCounts(db: DB, today: string) {
  const [r] = await db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      overdue: sql<number>`count(*) filter (where coalesce(${salesOrderLines.expectedDate}, ${salesOrders.expectedDelivery}) < ${today}::date)`.mapWith(Number),
      orders: sql<number>`count(distinct ${salesOrders.id})`.mapWith(Number),
    })
    .from(salesOrderLines)
    .innerJoin(salesOrders, eq(salesOrders.id, salesOrderLines.orderId))
    .where(PENDING_LINE_WHERE);
  return { total: r?.total ?? 0, overdue: r?.overdue ?? 0, orders: r?.orders ?? 0 };
}

export async function followUpsDue(db: DB, today: string, limit = 10) {
  return db
    .select({
      id: quotations.id, number: quotations.number, customer: customers.name, phone: customers.phone, grandTotal: quotations.grandTotal,
      nextFollowUpDate: quotations.nextFollowUpDate, status: quotations.status, preparedBy: quotations.preparedBy,
    })
    .from(quotations)
    .innerJoin(customers, eq(customers.id, quotations.customerId))
    .where(and(inArray(quotations.status, ["sent", "negotiation"]), lte(quotations.nextFollowUpDate, today)))
    .orderBy(asc(quotations.nextFollowUpDate))
    .limit(limit);
}

export async function refillsDueByCustomer(db: DB, today: string, days = 10, limit = 10) {
  return db
    .select({
      customerId: customers.id, customer: customers.name, phone: customers.phone,
      units: sql<number>`coalesce(sum(${extinguisherAssets.qty}),0)`.mapWith(Number),
      due: sql<string>`min(${extinguisherAssets.nextDueDate})::text`,
    })
    .from(extinguisherAssets)
    .innerJoin(customers, eq(customers.id, extinguisherAssets.customerId))
    .where(and(eq(extinguisherAssets.status, "active"), lte(extinguisherAssets.nextDueDate, addDays(today, days))))
    .groupBy(customers.id)
    .orderBy(sql`min(${extinguisherAssets.nextDueDate}) asc`)
    .limit(limit);
}

export async function overdueReceivables(db: DB, today: string, limit = 10) {
  return db
    .select({
      id: salesInvoices.id, number: salesInvoices.number, customer: customers.name, dueDate: salesInvoices.dueDate,
      outstanding: sql<number>`${salesInvoices.total} - ${salesInvoices.paidAmount}`.mapWith(Number),
    })
    .from(salesInvoices)
    .innerJoin(customers, eq(customers.id, salesInvoices.customerId))
    .where(and(inArray(salesInvoices.status, ["issued", "partially_paid"]), lt(salesInvoices.dueDate, today), sql`${salesInvoices.total} - ${salesInvoices.paidAmount} > 0.5`))
    .orderBy(asc(salesInvoices.dueDate))
    .limit(limit);
}

export async function pendingExpenses(db: DB, limit = 10) {
  return db
    .select({ id: expenses.id, voucherNo: expenses.voucherNo, date: expenses.date, amount: expenses.amount, category: expenses.category, by: users.name })
    .from(expenses)
    .leftJoin(users, eq(users.id, expenses.userId))
    .where(eq(expenses.status, "pending"))
    .orderBy(asc(expenses.date), asc(expenses.id))
    .limit(limit);
}

export const SEVERITY_ORDER = sql`case ${alerts.severity} when 'critical' then 0 when 'warning' then 1 else 2 end`;

export async function topAlerts(db: DB, user: { id: number; role: Role }, limit = 8) {
  return db
    .select()
    .from(alerts)
    .where(and(eq(alerts.status, "open"), alertScope(user)))
    .orderBy(SEVERITY_ORDER, sql`${alerts.dueDate} asc nulls last`, desc(alerts.createdAt))
    .limit(limit);
}
