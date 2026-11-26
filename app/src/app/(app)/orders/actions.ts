"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, type DB } from "@/db";
import { customers, deliveries, deliveryLines, items, projects, salesInvoices, salesOrderLines, salesOrders } from "@/db/schema";
import { requireWrite } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { round2, todayIST } from "@/lib/format";
import { nextNumber } from "@/lib/sequence";
import { MANUAL_LINE_STATUSES, OPEN_ORDER_STATUSES, lineStatusFor, netDeliveredQty, pendingQtyOf, recomputeOrderStatus, recomputeOrderTotal } from "@/lib/orders";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");
const optDate = z.preprocess((v) => (v === "" || v == null ? undefined : v), isoDate.optional());
const optText = (max: number) => z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : undefined), z.string().max(max).optional());
const optId = z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().int().positive().optional());

/** User-facing error message (zod issues → first message; known errors pass through). */
function errMsg(e: unknown): string {
  if (e instanceof z.ZodError) return e.issues[0]?.message ?? "Invalid input";
  if (e instanceof UserError) return e.message;
  console.error(e);
  return "Something went wrong. Please try again.";
}
class UserError extends Error {}

/** Store has orders:write for deliveries/line status only. Creating, closing, cancelling or reopening orders is commercial (admin/sales). */
function assertCommercial(role: string) {
  if (role !== "admin" && role !== "sales") throw new UserError("Only Sales or the Owner can create, close, cancel or reopen orders");
}

const withMsg = (path: string, key: "ok" | "err", msg: string) => `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg)}`;

// ---------------------------------------------------------------- create order
const lineSchema = z.object({
  itemId: z.number().int().positive().nullable(),
  description: z.string().trim().min(1, "Every line needs a description").max(2000),
  qty: z.number().positive("Quantity must be greater than 0"),
  uom: z.string().trim().max(20).default("Nos").transform((s) => s || "Nos"),
  rate: z.number().min(0, "Rate cannot be negative"),
  expectedDate: z.preprocess((v) => (v === "" || v == null ? null : v), isoDate.nullable()),
});
const orderSchema = z.object({
  customerId: z.coerce.number().int().positive("Select a customer"),
  customerPoNumber: optText(80),
  customerPoDate: optDate,
  orderDate: isoDate,
  projectId: optId,
  quotationId: optId,
  expectedDelivery: optDate,
  notes: optText(4000),
});

export async function createOrder(form: FormData) {
  const user = await requireWrite("orders");
  let target: string;
  try {
    assertCommercial(user.role);
    const h = orderSchema.parse(Object.fromEntries(form));
    const lines = z.array(lineSchema).min(1, "Add at least one line with quantity").parse(JSON.parse(String(form.get("lines") ?? "[]")));
    const db = await getDb();
    const [cust] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, h.customerId));
    if (!cust) throw new UserError("Customer not found");
    if (h.projectId) {
      const [p] = await db.select({ customerId: projects.customerId }).from(projects).where(eq(projects.id, h.projectId));
      if (!p) throw new UserError("Project not found");
    }
    const total = round2(lines.reduce((s, l) => s + l.qty * l.rate, 0));
    const created = await db.transaction(async (tx) => {
      const number = await nextNumber(tx as unknown as DB, "sales_order", h.orderDate);
      const [o] = await tx.insert(salesOrders).values({
        number, customerId: h.customerId, customerPoNumber: h.customerPoNumber, customerPoDate: h.customerPoDate,
        quotationId: h.quotationId, projectId: h.projectId, status: "open", orderDate: h.orderDate,
        expectedDelivery: h.expectedDelivery, total, notes: h.notes, createdBy: user.id,
      }).returning({ id: salesOrders.id, number: salesOrders.number });
      await tx.insert(salesOrderLines).values(lines.map((l, i) => ({
        orderId: o.id, sortOrder: i + 1, itemId: l.itemId, description: l.description, qty: l.qty, uom: l.uom,
        rate: round2(l.rate), deliveryStatus: "pending", expectedDate: l.expectedDate ?? h.expectedDelivery ?? null,
      })));
      return o;
    });
    await audit(db, user.id, "create", "sales_order", created.id, { number: created.number, lines: lines.length, total, quotationId: h.quotationId });
    revalidatePath("/orders");
    target = withMsg(`/orders/${created.id}`, "ok", `Order ${created.number} created`);
  } catch (e) {
    target = withMsg("/orders/new" + (form.get("quotationId") ? `?quotationId=${encodeURIComponent(String(form.get("quotationId")))}` : ""), "err", errMsg(e));
  }
  redirect(target);
}

// ---------------------------------------------------------------- per-line quick update
const lineUpdateSchema = z.object({
  orderId: z.coerce.number().int().positive(),
  lineId: z.coerce.number().int().positive(),
  status: z.enum(MANUAL_LINE_STATUSES),
  expectedDate: optDate,
  remarks: z.preprocess((v) => (typeof v === "string" ? v.trim() : ""), z.string().max(1000)),
});

export async function updateOrderLine(form: FormData) {
  const user = await requireWrite("orders");
  const orderId = Number(form.get("orderId"));
  let target: string;
  try {
    const d = lineUpdateSchema.parse(Object.fromEntries(form));
    if (d.status === "in_transit" && !d.expectedDate) throw new UserError("Enter the expected arrival date for an in-transit item");
    const db = await getDb();
    const result = await db.transaction(async (tx) => {
      const [o] = await tx.select({ status: salesOrders.status }).from(salesOrders).where(eq(salesOrders.id, d.orderId));
      if (!o) throw new UserError("Order not found");
      if (!(OPEN_ORDER_STATUSES as readonly string[]).includes(o.status)) throw new UserError(`Order is ${o.status}; lines can no longer be changed`);
      const [l] = await tx.select().from(salesOrderLines).where(and(eq(salesOrderLines.id, d.lineId), eq(salesOrderLines.orderId, d.orderId)));
      if (!l) throw new UserError("Line not found");
      if (l.deliveryStatus === "delivered") throw new UserError("This line is already fully delivered");
      const delivered = netDeliveredQty(l.deliveredQty, l.returnedQty);
      // "pending" on a part-delivered line stays "partial" (rule 7); ordered/in_transit describe the remaining qty
      const status = d.status === "pending" && delivered > 0 ? "partial" : d.status;
      await tx.update(salesOrderLines).set({ deliveryStatus: status, expectedDate: d.expectedDate ?? null, remarks: d.remarks || null })
        .where(eq(salesOrderLines.id, d.lineId));
      if (status === "cancelled" || l.deliveryStatus === "cancelled") await recomputeOrderTotal(tx, d.orderId);
      const orderStatus = await recomputeOrderStatus(tx, d.orderId);
      return { from: l.deliveryStatus, to: status, orderStatus };
    });
    await audit(db, user.id, "update", "sales_order_line", d.lineId, { orderId: d.orderId, ...result, expectedDate: d.expectedDate, remarks: d.remarks });
    revalidatePath(`/orders/${d.orderId}`);
    revalidatePath("/orders");
    target = withMsg(`/orders/${d.orderId}`, "ok", "Line updated");
  } catch (e) {
    target = withMsg(orderId ? `/orders/${orderId}` : "/orders", "err", errMsg(e));
  }
  redirect(target);
}

// ---------------------------------------------------------------- record delivery (challan), rule 7
const deliverySchema = z.object({
  orderId: z.coerce.number().int().positive(),
  date: isoDate,
  vehicleNo: optText(30),
  receivedBy: optText(120),
  notes: optText(2000),
});

export async function recordDelivery(form: FormData) {
  const user = await requireWrite("orders");
  const orderId = Number(form.get("orderId"));
  let target: string;
  try {
    const h = deliverySchema.parse(Object.fromEntries(form));
    if (h.date > todayIST(1)) throw new UserError("Delivery date cannot be in the future");
    const qtys: { lineId: number; qty: number }[] = [];
    for (const [k, v] of form.entries()) {
      const m = /^qty_(\d+)$/.exec(k);
      if (!m || String(v).trim() === "") continue;
      const q = z.coerce.number().min(0, "Delivered quantity cannot be negative").parse(v);
      if (q > 0) qtys.push({ lineId: Number(m[1]), qty: q });
    }
    if (!qtys.length) throw new UserError("Enter the delivered quantity for at least one line");
    const db = await getDb();
    const res = await db.transaction(async (tx) => {
      const [o] = await tx.select({ status: salesOrders.status, number: salesOrders.number }).from(salesOrders).where(eq(salesOrders.id, h.orderId));
      if (!o) throw new UserError("Order not found");
      if (!(OPEN_ORDER_STATUSES as readonly string[]).includes(o.status)) throw new UserError(`Order is ${o.status}; deliveries cannot be recorded`);
      const lines = await tx.select().from(salesOrderLines)
        .where(and(eq(salesOrderLines.orderId, h.orderId), inArray(salesOrderLines.id, qtys.map((q) => q.lineId))));
      const byId = new Map(lines.map((l) => [l.id, l]));
      for (const q of qtys) {
        const l = byId.get(q.lineId);
        if (!l) throw new UserError("A line does not belong to this order");
        if (l.deliveryStatus === "cancelled") throw new UserError(`"${l.description}" is cancelled`);
        const pending = pendingQtyOf(l);
        if (q.qty > pending + 1e-6) throw new UserError(`"${l.description.slice(0, 60)}": only ${pending} ${l.uom} pending (entered ${q.qty})`);
      }
      const number = await nextNumber(tx as unknown as DB, "delivery", h.date);
      const [dl] = await tx.insert(deliveries).values({
        number, orderId: h.orderId, date: h.date, vehicleNo: h.vehicleNo, receivedBy: h.receivedBy, notes: h.notes, createdBy: user.id,
      }).returning({ id: deliveries.id });
      // rule 12: snapshot the latest cost (rule 1) of each item at the moment of delivery, for order P&L
      const itemIds = [...new Set(lines.map((l) => l.itemId).filter((v): v is number => v != null))];
      const costs = itemIds.length
        ? await tx.select({ id: items.id, lastPurchaseRate: items.lastPurchaseRate, listPrice: items.listPrice }).from(items).where(inArray(items.id, itemIds))
        : [];
      const costOf = new Map(costs.map((c) => [c.id, round2(Number(c.lastPurchaseRate ?? c.listPrice ?? 0))]));
      await tx.insert(deliveryLines).values(qtys.map((q) => {
        const itemId = byId.get(q.lineId)!.itemId;
        return { deliveryId: dl.id, orderLineId: q.lineId, qty: q.qty, costRate: itemId ? costOf.get(itemId) ?? 0 : 0 };
      }));
      for (const q of qtys) {
        const l = byId.get(q.lineId)!;
        const delivered = round2(Number(l.deliveredQty) + q.qty);
        await tx.update(salesOrderLines)
          .set({ deliveredQty: delivered, deliveryStatus: lineStatusFor(Number(l.qty), netDeliveredQty(delivered, l.returnedQty), l.deliveryStatus) })
          .where(eq(salesOrderLines.id, q.lineId));
      }
      const orderStatus = await recomputeOrderStatus(tx, h.orderId);
      return { id: dl.id, number, orderStatus };
    });
    await audit(db, user.id, "create", "delivery", res.id, { number: res.number, orderId: h.orderId, lines: qtys, orderStatus: res.orderStatus });
    revalidatePath(`/orders/${h.orderId}`);
    revalidatePath("/orders");
    target = withMsg(`/orders/${h.orderId}`, "ok", `Delivery challan ${res.number} recorded${res.orderStatus === "delivered" ? ". The order is fully delivered" : ""}`);
  } catch (e) {
    target = withMsg(orderId ? `/orders/${orderId}` : "/orders", "err", errMsg(e));
  }
  redirect(target);
}

// ---------------------------------------------------------------- close / cancel / reopen
const statusSchema = z.object({ orderId: z.coerce.number().int().positive(), op: z.enum(["close", "cancel", "reopen"]) });

export async function changeOrderStatus(form: FormData) {
  const user = await requireWrite("orders");
  const orderId = Number(form.get("orderId"));
  let target: string;
  try {
    assertCommercial(user.role);
    const d = statusSchema.parse(Object.fromEntries(form));
    const db = await getDb();
    const res = await db.transaction(async (tx) => {
      const [o] = await tx.select({ status: salesOrders.status }).from(salesOrders).where(eq(salesOrders.id, d.orderId));
      if (!o) throw new UserError("Order not found");
      if (d.op === "cancel") {
        if (o.status === "cancelled") throw new UserError("Order is already cancelled");
        const [{ n }] = await tx.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(deliveries).where(eq(deliveries.orderId, d.orderId));
        if (n > 0) throw new UserError("This order already has deliveries. Close it instead of cancelling");
        const [{ inv }] = await tx.select({ inv: sql<number>`count(*)`.mapWith(Number) }).from(salesInvoices)
          .where(and(eq(salesInvoices.orderId, d.orderId), sql`${salesInvoices.status} <> 'cancelled'`));
        if (inv > 0) throw new UserError("This order has invoices. Cancel them first");
        await tx.update(salesOrders).set({ status: "cancelled" }).where(eq(salesOrders.id, d.orderId));
        return { from: o.status, to: "cancelled" };
      }
      if (d.op === "close") {
        if (o.status === "closed" || o.status === "cancelled") throw new UserError(`Order is already ${o.status}`);
        await tx.update(salesOrders).set({ status: "closed" }).where(eq(salesOrders.id, d.orderId));
        return { from: o.status, to: "closed" };
      }
      if (o.status !== "closed" && o.status !== "cancelled") throw new UserError("Only closed or cancelled orders can be reopened");
      await tx.update(salesOrders).set({ status: "open" }).where(eq(salesOrders.id, d.orderId));
      const to = await recomputeOrderStatus(tx, d.orderId);
      return { from: o.status, to };
    });
    await audit(db, user.id, "update", "sales_order", d.orderId, { status: res });
    revalidatePath(`/orders/${d.orderId}`);
    revalidatePath("/orders");
    target = withMsg(`/orders/${d.orderId}`, "ok", `Order ${res.to === "open" || res.to === "partial" || res.to === "delivered" ? "reopened" : res.to}`);
  } catch (e) {
    target = withMsg(orderId ? `/orders/${orderId}` : "/orders", "err", errMsg(e));
  }
  redirect(target);
}
