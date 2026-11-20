/**
 * Orders & delivery domain helpers (customer POs = sales_orders). OWNED BY: Team C (Orders, Delivery & Billing).
 * Implements shared business rule 7 (delivery → deliveredQty, line status, order status).
 */
import { and, asc, eq, inArray, lt, notInArray, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { customers, projects, salesOrderLines, salesOrders } from "@/db/schema";
import { daysBetween, round2, todayIST } from "./format";

/** A Drizzle transaction handle (same query API as DB). */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type DbOrTx = DB | Tx;

export const OPEN_ORDER_STATUSES = ["open", "partial"] as const;
/** Line statuses that still need a delivery. */
export const PENDING_LINE_STATUSES = ["pending", "ordered", "in_transit", "partial"] as const;
/** Statuses a user may set manually on a line (delivered/partial are derived from challans). */
export const MANUAL_LINE_STATUSES = ["pending", "ordered", "in_transit", "cancelled"] as const;

export const LINE_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  ordered: "Ordered from vendor",
  in_transit: "In transit",
  partial: "Partially delivered",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const EPS = 1e-6;

/** Rule 7: line status after a delivery quantity change. Keeps manual statuses (ordered/in_transit) while nothing is delivered. */
export function lineStatusFor(qtyOrdered: number, deliveredQty: number, current: string): string {
  if (current === "cancelled") return "cancelled";
  if (deliveredQty >= qtyOrdered - EPS) return "delivered";
  if (deliveredQty > EPS) return "partial";
  return current === "partial" || current === "delivered" ? "pending" : current;
}

/** Rule 7: order status from its lines. Closed/cancelled orders are never changed automatically. */
export function orderStatusFor(lines: { deliveryStatus: string; deliveredQty: number }[], current: string): string {
  if (current === "closed" || current === "cancelled") return current;
  const active = lines.filter((l) => l.deliveryStatus !== "cancelled");
  if (active.length > 0 && active.every((l) => l.deliveryStatus === "delivered")) return "delivered";
  if (active.some((l) => l.deliveredQty > EPS)) return "partial";
  return "open";
}

/** Recompute and persist the order status from its lines (call inside the same transaction). */
export async function recomputeOrderStatus(db: DbOrTx, orderId: number): Promise<string> {
  const [order] = await db.select({ status: salesOrders.status }).from(salesOrders).where(eq(salesOrders.id, orderId));
  if (!order) throw new Error("Order not found");
  const lines = await db
    .select({ deliveryStatus: salesOrderLines.deliveryStatus, deliveredQty: salesOrderLines.deliveredQty })
    .from(salesOrderLines)
    .where(eq(salesOrderLines.orderId, orderId));
  const next = orderStatusFor(lines.map((l) => ({ ...l, deliveredQty: Number(l.deliveredQty) })), order.status);
  if (next !== order.status) await db.update(salesOrders).set({ status: next }).where(eq(salesOrders.id, orderId));
  return next;
}

/** Recompute the order total from its lines (Σ qty × rate, excluding cancelled lines). */
export async function recomputeOrderTotal(db: DbOrTx, orderId: number): Promise<number> {
  const lines = await db
    .select({ qty: salesOrderLines.qty, rate: salesOrderLines.rate, st: salesOrderLines.deliveryStatus })
    .from(salesOrderLines)
    .where(eq(salesOrderLines.orderId, orderId));
  const total = round2(lines.filter((l) => l.st !== "cancelled").reduce((s, l) => s + Number(l.qty) * Number(l.rate), 0));
  await db.update(salesOrders).set({ total }).where(eq(salesOrders.id, orderId));
  return total;
}

export type PendingLine = {
  lineId: number;
  orderId: number;
  orderNumber: string;
  customerPoNumber: string | null;
  customerId: number;
  customerName: string;
  projectId: number | null;
  projectName: string | null;
  description: string;
  uom: string;
  qty: number;
  deliveredQty: number;
  pendingQty: number;
  /** order rate (ex-GST) */
  rate: number;
  deliveryStatus: string;
  expectedDate: string | null;
  remarks: string | null;
  /** > 0 when expectedDate is in the past; 0 when due today/future; null when no expected date */
  daysOverdue: number | null;
};

/** Every undelivered line across open/partial orders, most overdue first. */
export async function pendingDeliveryLines(
  db: DbOrTx,
  opts: { customerId?: number; projectId?: number; orderId?: number; today?: string } = {},
): Promise<PendingLine[]> {
  const today = opts.today ?? todayIST();
  const rows = await db
    .select({
      lineId: salesOrderLines.id,
      orderId: salesOrders.id,
      orderNumber: salesOrders.number,
      customerPoNumber: salesOrders.customerPoNumber,
      customerId: salesOrders.customerId,
      customerName: customers.name,
      projectId: salesOrders.projectId,
      projectName: projects.name,
      description: salesOrderLines.description,
      uom: salesOrderLines.uom,
      qty: salesOrderLines.qty,
      deliveredQty: salesOrderLines.deliveredQty,
      rate: salesOrderLines.rate,
      deliveryStatus: salesOrderLines.deliveryStatus,
      lineExpected: salesOrderLines.expectedDate,
      orderExpected: salesOrders.expectedDelivery,
      remarks: salesOrderLines.remarks,
    })
    .from(salesOrderLines)
    .innerJoin(salesOrders, eq(salesOrders.id, salesOrderLines.orderId))
    .leftJoin(customers, eq(customers.id, salesOrders.customerId))
    .leftJoin(projects, eq(projects.id, salesOrders.projectId))
    .where(and(
      inArray(salesOrders.status, [...OPEN_ORDER_STATUSES]),
      inArray(salesOrderLines.deliveryStatus, [...PENDING_LINE_STATUSES]),
      lt(salesOrderLines.deliveredQty, salesOrderLines.qty),
      opts.customerId ? eq(salesOrders.customerId, opts.customerId) : undefined,
      opts.projectId ? eq(salesOrders.projectId, opts.projectId) : undefined,
      opts.orderId ? eq(salesOrders.id, opts.orderId) : undefined,
    ))
    .orderBy(asc(salesOrders.id), asc(salesOrderLines.sortOrder));

  const out: PendingLine[] = rows.map((r) => {
    const expectedDate = r.lineExpected ?? r.orderExpected ?? null;
    const qty = Number(r.qty), deliveredQty = Number(r.deliveredQty);
    return {
      lineId: r.lineId, orderId: r.orderId, orderNumber: r.orderNumber, customerPoNumber: r.customerPoNumber,
      customerId: r.customerId, customerName: r.customerName ?? "—", projectId: r.projectId, projectName: r.projectName,
      description: r.description, uom: r.uom, qty, deliveredQty, pendingQty: round2(qty - deliveredQty), rate: Number(r.rate),
      deliveryStatus: r.deliveryStatus, expectedDate, remarks: r.remarks,
      daysOverdue: expectedDate ? Math.max(0, daysBetween(expectedDate, today)) : null,
    };
  });
  // most overdue first; then due soonest; lines without an expected date last
  out.sort((a, b) => {
    const ka = a.expectedDate ? daysBetween(today, a.expectedDate) : Number.MAX_SAFE_INTEGER;
    const kb = b.expectedDate ? daysBetween(today, b.expectedDate) : Number.MAX_SAFE_INTEGER;
    return ka - kb || a.orderId - b.orderId;
  });
  return out;
}

export type OrderProgress = { totalLines: number; deliveredLines: number; pendingLines: number; overdueLines: number };

/** Per-order line progress: delivered X/Y (excluding cancelled lines) and overdue pending lines. */
export async function orderProgress(db: DbOrTx, orderIds: number[], today = todayIST()): Promise<Map<number, OrderProgress>> {
  const map = new Map<number, OrderProgress>();
  if (!orderIds.length) return map;
  const rows = await db
    .select({
      orderId: salesOrderLines.orderId,
      total: sql<number>`count(*)`.mapWith(Number),
      delivered: sql<number>`count(*) filter (where ${salesOrderLines.deliveryStatus} = 'delivered')`.mapWith(Number),
      overdue: sql<number>`count(*) filter (where ${salesOrderLines.deliveryStatus} <> 'delivered'
        and coalesce(${salesOrderLines.expectedDate}, ${salesOrders.expectedDelivery}) < ${today})`.mapWith(Number),
    })
    .from(salesOrderLines)
    .innerJoin(salesOrders, eq(salesOrders.id, salesOrderLines.orderId))
    .where(and(inArray(salesOrderLines.orderId, orderIds), notInArray(salesOrderLines.deliveryStatus, ["cancelled"])))
    .groupBy(salesOrderLines.orderId);
  for (const r of rows) {
    map.set(r.orderId, { totalLines: r.total, deliveredLines: r.delivered, pendingLines: r.total - r.delivered, overdueLines: r.overdue });
  }
  return map;
}
