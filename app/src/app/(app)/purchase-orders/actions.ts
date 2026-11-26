"use server";
/** Vendor purchase order actions (CONVENTIONS rule 16). Maintainer: Sirah Digital. */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { items, projects, purchaseInvoices, purchaseOrderLines, purchaseOrders, salesOrderLines, salesOrders, vendors } from "@/db/schema";
import { requireWrite } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { publicError } from "@/lib/errors";
import { round2, todayIST } from "@/lib/format";
import { nextNumber } from "@/lib/sequence";
import { computePoTotals, markSoLinesOrdered, poLineAmount, revertSoLinesOrdered } from "@/lib/purchase-orders";

class PoError extends Error {}

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");
const optId = z.union([z.literal(""), z.coerce.number().int().positive()]).nullish().transform((v) => (typeof v === "number" ? v : null));
const optText = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
const idSchema = z.coerce.number().int().positive();

const lineSchema = z.object({
  itemId: z.coerce.number().int().positive(),
  description: z.string().trim().max(500).nullish().transform((v) => (v ? v : null)),
  qty: z.coerce.number().min(0, "Quantity cannot be negative").max(1e7),
  rate: z.coerce.number().min(0, "Rate cannot be negative").max(1e9),
  gstRate: z.coerce.number().min(0).max(28),
  salesOrderLineId: z.coerce.number().int().positive().nullish().transform((v) => v ?? null),
});
const headerSchema = z.object({
  id: optId,
  vendorId: z.coerce.number({ message: "Choose a vendor" }).int().positive("Choose a vendor"),
  poDate: dateStr,
  expectedDate: z.union([z.literal(""), dateStr]).nullish().transform((v) => (v ? v : null)),
  salesOrderId: optId,
  projectId: optId,
  terms: optText(8000),
  notes: optText(4000),
  intent: z.enum(["draft", "send"]).default("draft"),
});

const msg = (e: unknown, fallback: string) => publicError(e, fallback, [PoError]);

function revalidatePo(id?: number | null, salesOrderId?: number | null) {
  revalidatePath("/purchase-orders");
  if (id) revalidatePath(`/purchase-orders/${id}`);
  if (salesOrderId) revalidatePath(`/orders/${salesOrderId}`);
  revalidatePath("/orders");
}

/** Create or update (draft only) a vendor PO. intent "send" also marks it sent in the same transaction. */
export async function savePurchaseOrder(fd: FormData) {
  const user = await requireWrite("purchaseOrders");
  const rawId = Number(fd.get("id")) || null;
  let target: string;
  try {
    const h = headerSchema.parse({
      id: fd.get("id") ?? "", vendorId: fd.get("vendorId"), poDate: fd.get("poDate"), expectedDate: fd.get("expectedDate") ?? "",
      salesOrderId: fd.get("salesOrderId") ?? "", projectId: fd.get("projectId") ?? "", terms: fd.get("terms"), notes: fd.get("notes"),
      intent: fd.get("intent") ?? "draft",
    });
    let raw: unknown;
    try { raw = JSON.parse(String(fd.get("lines") ?? "[]")); } catch { throw new PoError("Invalid line data"); }
    const lines = z.array(lineSchema).max(500).parse(raw).filter((l) => l.qty > 0);
    if (!lines.length) throw new PoError("Add at least one line with a quantity");
    if (h.expectedDate && h.expectedDate < h.poDate) throw new PoError("Expected delivery can't be before the PO date");
    if (h.poDate > todayIST(1)) throw new PoError("PO date can't be in the future");

    const db = await getDb();
    let existing: typeof purchaseOrders.$inferSelect | undefined;
    if (h.id) {
      [existing] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, h.id));
      if (!existing) throw new PoError("Purchase order not found");
      if (existing.status !== "draft") throw new PoError("Only a draft PO can be edited");
    }
    const [v] = await db.select({ id: vendors.id, active: vendors.active }).from(vendors).where(eq(vendors.id, h.vendorId));
    if (!v) throw new PoError("Vendor not found");
    if (!v.active && existing?.vendorId !== v.id) throw new PoError("This vendor is inactive. Choose another vendor or reactivate them first");
    if (h.projectId) {
      const [p] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, h.projectId));
      if (!p) throw new PoError("Project not found");
    }
    if (h.salesOrderId) {
      const [so] = await db.select({ id: salesOrders.id, status: salesOrders.status }).from(salesOrders).where(eq(salesOrders.id, h.salesOrderId));
      if (!so) throw new PoError("Customer order not found");
      if (so.status === "cancelled" && existing?.salesOrderId !== so.id) throw new PoError("That customer order is cancelled");
    }
    const itemIds = [...new Set(lines.map((l) => l.itemId))];
    const found = await db.select({ id: items.id }).from(items).where(inArray(items.id, itemIds));
    if (found.length !== itemIds.length) throw new PoError("One or more items no longer exist");
    const solIds = [...new Set(lines.map((l) => l.salesOrderLineId).filter((x): x is number => x != null))];
    if (solIds.length) {
      if (!h.salesOrderId) throw new PoError("Lines from a customer order need the order selected");
      const sol = await db.select({ id: salesOrderLines.id, orderId: salesOrderLines.orderId, itemId: salesOrderLines.itemId })
        .from(salesOrderLines).where(inArray(salesOrderLines.id, solIds));
      const byId = new Map(sol.map((x) => [x.id, x]));
      for (const l of lines) {
        if (l.salesOrderLineId == null) continue;
        const x = byId.get(l.salesOrderLineId);
        if (!x || x.orderId !== h.salesOrderId) throw new PoError("A line doesn't belong to the selected customer order");
        if (x.itemId !== l.itemId) throw new PoError("A customer order line's item doesn't match. Remove it and add the item as a new line");
      }
    }

    const totals = computePoTotals(lines);
    const rows = (poId: number) => lines.map((l, i) => ({
      poId, sortOrder: i + 1, itemId: l.itemId, description: l.description, qty: l.qty, rate: round2(l.rate), gstRate: l.gstRate,
      amount: poLineAmount(l), salesOrderLineId: l.salesOrderLineId,
    }));
    const header = {
      vendorId: h.vendorId, salesOrderId: h.salesOrderId, projectId: h.projectId, poDate: h.poDate, expectedDate: h.expectedDate,
      terms: h.terms, notes: h.notes, ...totals,
    };
    const send = h.intent === "send";
    let id: number, number: string, marked = 0;
    if (existing) {
      const ex = existing;
      id = ex.id;
      number = ex.number;
      await db.transaction(async (tx) => {
        const r = await tx.update(purchaseOrders).set({ ...header, ...(send ? { status: "sent" } : {}) })
          .where(and(eq(purchaseOrders.id, ex.id), eq(purchaseOrders.status, "draft"))).returning({ id: purchaseOrders.id });
        if (!r.length) throw new PoError("Only a draft PO can be edited");
        await tx.delete(purchaseOrderLines).where(eq(purchaseOrderLines.poId, ex.id));
        await tx.insert(purchaseOrderLines).values(rows(ex.id));
        if (send) marked = await markSoLinesOrdered(tx, ex.id);
      });
      await audit(db, user.id, "update", "purchase_order", id, { number, lines: lines.length, total: totals.total, ...(send ? { status: "sent", soLinesOrdered: marked } : {}) });
    } else {
      number = await nextNumber(db, "purchase_order", h.poDate);
      id = await db.transaction(async (tx) => {
        const [po] = await tx.insert(purchaseOrders).values({ ...header, number, status: send ? "sent" : "draft", createdBy: user.id }).returning({ id: purchaseOrders.id });
        await tx.insert(purchaseOrderLines).values(rows(po.id));
        if (send) marked = await markSoLinesOrdered(tx, po.id);
        return po.id;
      });
      await audit(db, user.id, "create", "purchase_order", id, { number, vendorId: h.vendorId, salesOrderId: h.salesOrderId, total: totals.total, status: send ? "sent" : "draft", soLinesOrdered: marked });
    }
    revalidatePo(id, h.salesOrderId);
    const okMsg = send
      ? `${number} saved and marked as sent${marked ? `. ${marked} customer order line${marked === 1 ? " is" : "s are"} now shown as ordered` : ""}`
      : `${number} saved as draft. Mark it sent once it has gone to the vendor`;
    target = `/purchase-orders/${id}?ok=` + encodeURIComponent(okMsg);
  } catch (e) {
    if (!(e instanceof PoError) && !(e instanceof z.ZodError)) console.error("savePurchaseOrder", e);
    const so = Number(fd.get("salesOrderId")) || null;
    const back = rawId ? `/purchase-orders/${rawId}/edit?` : so ? `/purchase-orders/new?salesOrderId=${so}&` : "/purchase-orders/new?";
    target = back + "err=" + encodeURIComponent(msg(e, "Could not save the purchase order"));
  }
  redirect(target);
}

async function loadPo(id: number) {
  const db = await getDb();
  const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id));
  if (!po) throw new PoError("Purchase order not found");
  return { db, po };
}

/** draft → sent; linked customer order lines that were pending become ordered. */
export async function markPoSent(fd: FormData) {
  const user = await requireWrite("purchaseOrders");
  const id = idSchema.parse(fd.get("id"));
  let target: string;
  let soId: number | null = null;
  try {
    const { db, po } = await loadPo(id);
    soId = po.salesOrderId;
    if (po.status !== "draft") throw new PoError("Only a draft PO can be marked as sent");
    const [{ n }] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(purchaseOrderLines)
      .where(and(eq(purchaseOrderLines.poId, id), sql`${purchaseOrderLines.qty} > 0`));
    if (!n) throw new PoError("This PO has no lines. Edit it and add items first");
    const marked = await db.transaction(async (tx) => {
      const r = await tx.update(purchaseOrders).set({ status: "sent" }).where(and(eq(purchaseOrders.id, id), eq(purchaseOrders.status, "draft"))).returning({ id: purchaseOrders.id });
      if (!r.length) throw new PoError("Someone else just changed this PO. Please reload");
      return markSoLinesOrdered(tx, id);
    });
    await audit(db, user.id, "update", "purchase_order", id, { status: "sent", soLinesOrdered: marked });
    target = `/purchase-orders/${id}?ok=` + encodeURIComponent(`Marked as sent${marked ? `. ${marked} customer order line${marked === 1 ? " is" : "s are"} now shown as ordered` : ""}`);
  } catch (e) {
    target = `/purchase-orders/${id}?err=` + encodeURIComponent(msg(e, "Could not update the PO"));
  }
  revalidatePo(id, soId);
  redirect(target);
}

const reasonSchema = z.object({ id: idSchema, reason: optText(500) });

/** Cancel a draft or sent PO that has nothing received and no bills. Customer order lines go back to pending. */
export async function cancelPo(fd: FormData) {
  const user = await requireWrite("purchaseOrders");
  const id = idSchema.parse(fd.get("id"));
  let target: string;
  let soId: number | null = null;
  try {
    const p = reasonSchema.parse({ id: fd.get("id"), reason: fd.get("reason") });
    const { db, po } = await loadPo(p.id);
    soId = po.salesOrderId;
    if (po.status !== "draft" && po.status !== "sent") throw new PoError("Only a draft or sent PO with nothing received can be cancelled. Use Close instead");
    const [{ got }] = await db.select({ got: sql<number>`coalesce(sum(${purchaseOrderLines.receivedQty}),0)`.mapWith(Number) }).from(purchaseOrderLines).where(eq(purchaseOrderLines.poId, id));
    if (got > 0) throw new PoError("Goods have already been received on this PO. Use Close instead");
    const bills = await db.select({ id: purchaseInvoices.id }).from(purchaseInvoices)
      .where(and(eq(purchaseInvoices.purchaseOrderId, id), inArray(purchaseInvoices.status, ["draft", "posted"])));
    if (bills.length) throw new PoError("There is a bill raised against this PO. Cancel that draft bill first");
    const reverted = await db.transaction(async (tx) => {
      const r = await tx.update(purchaseOrders).set({
        status: "cancelled", notes: p.reason ? [po.notes, `Cancelled: ${p.reason}`].filter(Boolean).join("\n") : po.notes,
      }).where(and(eq(purchaseOrders.id, id), inArray(purchaseOrders.status, ["draft", "sent"]))).returning({ id: purchaseOrders.id });
      if (!r.length) throw new PoError("Someone else just changed this PO. Please reload");
      return po.status === "sent" ? revertSoLinesOrdered(tx, id) : 0;
    });
    await audit(db, user.id, "update", "purchase_order", id, { status: "cancelled", from: po.status, reason: p.reason, soLinesReverted: reverted });
    target = `/purchase-orders/${id}?ok=` + encodeURIComponent(`${po.number} cancelled`);
  } catch (e) {
    target = `/purchase-orders/${id}?err=` + encodeURIComponent(msg(e, "Could not cancel the PO"));
  }
  revalidatePo(id, soId);
  redirect(target);
}

/** Short-close a sent / partly received / received PO: nothing more is expected from the vendor. */
export async function closePo(fd: FormData) {
  const user = await requireWrite("purchaseOrders");
  const id = idSchema.parse(fd.get("id"));
  let target: string;
  let soId: number | null = null;
  try {
    const p = reasonSchema.parse({ id: fd.get("id"), reason: fd.get("reason") });
    const { db, po } = await loadPo(p.id);
    soId = po.salesOrderId;
    if (!["sent", "partial", "received"].includes(po.status)) throw new PoError("Only a sent or received PO can be closed");
    const r = await db.update(purchaseOrders).set({
      status: "closed", notes: p.reason ? [po.notes, `Closed: ${p.reason}`].filter(Boolean).join("\n") : po.notes,
    }).where(and(eq(purchaseOrders.id, id), inArray(purchaseOrders.status, ["sent", "partial", "received"]))).returning({ id: purchaseOrders.id });
    if (!r.length) throw new PoError("Someone else just changed this PO. Please reload");
    await audit(db, user.id, "update", "purchase_order", id, { status: "closed", from: po.status, reason: p.reason });
    target = `/purchase-orders/${id}?ok=` + encodeURIComponent(`${po.number} closed`);
  } catch (e) {
    target = `/purchase-orders/${id}?err=` + encodeURIComponent(msg(e, "Could not close the PO"));
  }
  revalidatePo(id, soId);
  redirect(target);
}
