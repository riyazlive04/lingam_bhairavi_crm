"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, type DB } from "@/db";
import {
  customers, items, payments, priceHistory, purchaseInvoices, salesInvoiceLines, salesInvoices, salesOrderLines, salesOrders,
} from "@/db/schema";
import { requireWrite } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { flushOutbox, queueEmail, smtpConfigured } from "@/lib/email";
import { PAYMENT_MODES } from "@/lib/constants";
import { addDays, round2, todayIST } from "@/lib/format";
import { nextNumber } from "@/lib/sequence";
import {
  PAID_TOLERANCE, buildReminderEmail, buildStatementEmail, customerLedger, getCompany, invoiceStatusFor, openSalesInvoices, outstandingOf,
} from "@/lib/billing";

class UserError extends Error {}
function errMsg(e: unknown): string {
  if (e instanceof z.ZodError) return e.issues[0]?.message ?? "Invalid input";
  if (e instanceof UserError) return e.message;
  console.error(e);
  return "Something went wrong. Please try again.";
}
const withMsg = (path: string, key: "ok" | "err", msg: string) => `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg)}`;
/** Only allow redirecting back to a local billing path. */
const safeBack = (v: FormDataEntryValue | null, fallback: string) => {
  const s = typeof v === "string" ? v : "";
  return /^\/billing(\/[\w\-/]*)?(\?[\w=&%-]*)?$/.test(s) ? s : fallback;
};

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");
const optDate = z.preprocess((v) => (v === "" || v == null ? undefined : v), isoDate.optional());
const optText = (max: number) => z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : undefined), z.string().max(max).optional());
const optId = z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().int().positive().optional());
const money = z.coerce.number().positive("Amount must be greater than 0").max(1e10).transform(round2);

// ---------------------------------------------------------------- create invoice (rule 6)
const invLine = z.object({
  orderLineId: z.number().int().positive().nullable(),
  itemId: z.number().int().positive().nullable(),
  description: z.string().trim().min(1, "Every line needs a description").max(2000),
  qty: z.number().positive("Quantity must be greater than 0"),
  rate: z.number().min(0, "Rate cannot be negative"),
  gstRate: z.number().min(0).max(28, "GST rate looks wrong"),
});
const invHeader = z.object({
  customerId: z.coerce.number().int().positive("Select a customer"),
  orderId: optId,
  projectId: optId,
  invoiceDate: isoDate,
  dueDate: optDate,
  notes: optText(4000),
});

export async function createInvoice(form: FormData) {
  const user = await requireWrite("billing");
  let target: string;
  const orderIdRaw = form.get("orderId");
  try {
    const h = invHeader.parse(Object.fromEntries(form));
    const lines = z.array(invLine).min(1, "Add at least one line with quantity").parse(JSON.parse(String(form.get("lines") ?? "[]")));
    const db = await getDb();
    const [cust] = await db.select().from(customers).where(eq(customers.id, h.customerId));
    if (!cust) throw new UserError("Customer not found");
    const dueDate = h.dueDate ?? addDays(h.invoiceDate, Number(cust.paymentTermsDays ?? 30));
    if (dueDate < h.invoiceDate) throw new UserError("Due date cannot be before the invoice date");

    const res = await db.transaction(async (tx) => {
      let projectId = h.projectId ?? null;
      if (h.orderId) {
        const [o] = await tx.select().from(salesOrders).where(eq(salesOrders.id, h.orderId));
        if (!o) throw new UserError("Order not found");
        if (o.customerId !== h.customerId) throw new UserError("Order belongs to a different customer");
        if (o.status === "cancelled") throw new UserError("Order is cancelled");
        projectId = projectId ?? o.projectId;
      }
      // validate order-linked quantities (cannot invoice more than ordered − already invoiced)
      const olIds = lines.map((l) => l.orderLineId).filter((v): v is number => v != null);
      if (olIds.length && !h.orderId) throw new UserError("Order lines given without an order");
      const ols = olIds.length ? await tx.select().from(salesOrderLines).where(inArray(salesOrderLines.id, olIds)) : [];
      const olMap = new Map(ols.map((l) => [l.id, l]));
      const perLine = new Map<number, number>();
      for (const l of lines) {
        if (l.orderLineId == null) continue;
        const ol = olMap.get(l.orderLineId);
        if (!ol || ol.orderId !== h.orderId) throw new UserError("A line does not belong to this order");
        perLine.set(ol.id, (perLine.get(ol.id) ?? 0) + l.qty);
      }
      for (const [olId, q] of perLine) {
        const ol = olMap.get(olId)!;
        const room = round2(Number(ol.qty) - Number(ol.invoicedQty));
        if (q > room + 1e-6) throw new UserError(`"${ol.description.slice(0, 60)}": only ${room} ${ol.uom} left to invoice (entered ${q})`);
      }

      const priced = lines.map((l) => ({ ...l, rate: round2(l.rate), amount: round2(l.qty * l.rate) }));
      const subtotal = round2(priced.reduce((s, l) => s + l.amount, 0));
      const taxAmount = round2(priced.reduce((s, l) => s + (l.amount * l.gstRate) / 100, 0));
      const total = round2(subtotal + taxAmount);

      const number = await nextNumber(tx as unknown as DB, "sales_invoice", h.invoiceDate);
      const [inv] = await tx.insert(salesInvoices).values({
        number, customerId: h.customerId, orderId: h.orderId ?? null, projectId, invoiceDate: h.invoiceDate, dueDate,
        subtotal, taxAmount, total, paidAmount: 0, status: "issued", notes: h.notes, createdBy: user.id,
      }).returning({ id: salesInvoices.id });
      await tx.insert(salesInvoiceLines).values(priced.map((l) => ({
        invoiceId: inv.id, orderLineId: l.orderLineId, itemId: l.itemId, description: l.description, qty: l.qty, rate: l.rate, gstRate: l.gstRate, amount: l.amount,
      })));
      for (const [olId, q] of perLine) {
        await tx.update(salesOrderLines).set({ invoicedQty: sql`${salesOrderLines.invoicedQty} + ${q}` }).where(eq(salesOrderLines.id, olId));
      }
      // rule 6: sale price history + item last sale rate
      for (const l of priced) {
        if (!l.itemId) continue;
        await tx.insert(priceHistory).values({
          itemId: l.itemId, kind: "sale", rate: l.rate, date: h.invoiceDate, customerId: h.customerId, refType: "sales_invoice", refId: inv.id, qty: l.qty,
        });
        await tx.update(items).set({ lastSaleRate: l.rate, lastSaleDate: h.invoiceDate })
          .where(and(eq(items.id, l.itemId), sql`(${items.lastSaleDate} is null or ${items.lastSaleDate} <= ${h.invoiceDate})`));
      }
      return { id: inv.id, number, total };
    });
    await audit(db, user.id, "create", "sales_invoice", res.id, { number: res.number, total: res.total, orderId: h.orderId, lines: lines.length });
    revalidatePath("/billing");
    revalidatePath("/billing/invoices");
    if (h.orderId) revalidatePath(`/orders/${h.orderId}`);
    target = withMsg(`/billing/invoices/${res.id}`, "ok", `Invoice ${res.number} issued`);
  } catch (e) {
    target = withMsg(`/billing/invoices/new${orderIdRaw ? `?orderId=${encodeURIComponent(String(orderIdRaw))}` : ""}`, "err", errMsg(e));
  }
  redirect(target);
}

// ---------------------------------------------------------------- record customer payment
const payIn = z.object({
  invoiceId: z.coerce.number().int().positive(),
  amount: money,
  date: isoDate,
  mode: z.enum(PAYMENT_MODES),
  reference: optText(80),
  notes: optText(1000),
});

export async function recordPayment(form: FormData) {
  const user = await requireWrite("billing");
  const invoiceId = Number(form.get("invoiceId"));
  let target: string;
  try {
    const d = payIn.parse(Object.fromEntries(form));
    if (d.date > todayIST(1)) throw new UserError("Payment date cannot be in the future");
    const db = await getDb();
    const res = await db.transaction(async (tx) => {
      const [inv] = await tx.select().from(salesInvoices).where(eq(salesInvoices.id, d.invoiceId));
      if (!inv) throw new UserError("Invoice not found");
      if (inv.status === "cancelled" || inv.status === "draft") throw new UserError(`Invoice is ${inv.status}`);
      const due = outstandingOf(inv.total, inv.paidAmount);
      if (d.amount > due + PAID_TOLERANCE) throw new UserError(`Amount exceeds the outstanding balance (${due.toFixed(2)})`);
      const [p] = await tx.insert(payments).values({
        direction: "in", customerId: inv.customerId, salesInvoiceId: inv.id, amount: d.amount, date: d.date, mode: d.mode,
        reference: d.reference, notes: d.notes, createdBy: user.id,
      }).returning({ id: payments.id });
      const paid = round2(Number(inv.paidAmount) + d.amount);
      const status = invoiceStatusFor(Number(inv.total), paid, inv.status);
      await tx.update(salesInvoices).set({ paidAmount: paid, status }).where(eq(salesInvoices.id, inv.id));
      return { paymentId: p.id, number: inv.number, status, paid };
    });
    await audit(db, user.id, "create", "payment", res.paymentId, { direction: "in", invoiceId: d.invoiceId, amount: d.amount, mode: d.mode, status: res.status });
    revalidatePath("/billing", "layout");
    target = withMsg(`/billing/invoices/${d.invoiceId}`, "ok", `Payment recorded${res.status === "paid" ? ". The invoice is now fully paid" : ""}`);
  } catch (e) {
    target = withMsg(invoiceId ? `/billing/invoices/${invoiceId}` : "/billing/invoices", "err", errMsg(e));
  }
  redirect(target);
}

// ---------------------------------------------------------------- reminder e-mail now
export async function sendReminderNow(form: FormData) {
  const user = await requireWrite("billing");
  const invoiceId = Number(form.get("invoiceId"));
  let target: string;
  try {
    if (!Number.isInteger(invoiceId) || invoiceId <= 0) throw new UserError("Invalid invoice");
    const db = await getDb();
    const [inv] = await db.select().from(salesInvoices).where(eq(salesInvoices.id, invoiceId));
    if (!inv) throw new UserError("Invoice not found");
    if (inv.status !== "issued" && inv.status !== "partially_paid") throw new UserError(`This invoice is ${inv.status.replace("_", " ")}, so no reminder is needed`);
    const [cust] = await db.select().from(customers).where(eq(customers.id, inv.customerId));
    if (!cust?.email) throw new UserError("Customer has no e-mail address. Add it in the customer master first.");
    const open = await openSalesInvoices(db, { customerId: inv.customerId });
    // the reminder is about this invoice; the mini statement lists every open invoice of the customer
    const ordered = [...open.filter((o) => o.id === inv.id), ...open.filter((o) => o.id !== inv.id)];
    if (!ordered.length) throw new UserError("Nothing outstanding for this customer");
    const company = await getCompany(db);
    const { subject, html } = buildReminderEmail({
      customerName: cust.contactPerson ? `${cust.contactPerson} (${cust.name})` : cust.name,
      invoices: ordered.map((o) => ({ number: o.number, invoiceDate: o.invoiceDate, dueDate: o.dueDate, total: o.total, outstanding: o.outstanding, daysOverdue: o.daysOverdue })),
      company: { name: company.name, phone: company.phone || undefined, email: company.email || undefined, bank: company.bank || undefined },
    });
    const emailId = await queueEmail(db, { to: cust.email, subject, html, agent: "manual", entityType: "sales_invoice", entityId: inv.id });
    await db.update(salesInvoices).set({ reminderCount: sql`${salesInvoices.reminderCount} + 1`, lastReminderAt: new Date() }).where(eq(salesInvoices.id, inv.id));
    let delivery = "logged to the outbox (demo mode, SMTP is not configured)";
    if (smtpConfigured()) {
      const r = await flushOutbox(db, 5);
      delivery = r.failed ? "queued, but sending failed. Check the Email outbox" : "sent";
    }
    await audit(db, user.id, "email", "sales_invoice", inv.id, { kind: "reminder", to: cust.email, emailId });
    revalidatePath(`/billing/invoices/${inv.id}`);
    revalidatePath("/emails");
    target = withMsg(`/billing/invoices/${inv.id}`, "ok", `Reminder to ${cust.email} ${delivery}`);
  } catch (e) {
    target = withMsg(invoiceId ? `/billing/invoices/${invoiceId}` : "/billing/invoices", "err", errMsg(e));
  }
  redirect(target);
}

// ---------------------------------------------------------------- cancel invoice
export async function cancelInvoice(form: FormData) {
  const user = await requireWrite("billing");
  const invoiceId = Number(form.get("invoiceId"));
  let target: string;
  try {
    if (!Number.isInteger(invoiceId) || invoiceId <= 0) throw new UserError("Invalid invoice");
    const db = await getDb();
    const res = await db.transaction(async (tx) => {
      const [inv] = await tx.select().from(salesInvoices).where(eq(salesInvoices.id, invoiceId));
      if (!inv) throw new UserError("Invoice not found");
      if (inv.status === "cancelled") throw new UserError("Invoice is already cancelled");
      const [{ n }] = await tx.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(payments).where(eq(payments.salesInvoiceId, invoiceId));
      if (n > 0 || Number(inv.paidAmount) > 0) throw new UserError("This invoice has payments recorded against it, so it cannot be cancelled");
      const lines = await tx.select().from(salesInvoiceLines).where(eq(salesInvoiceLines.invoiceId, invoiceId));
      for (const l of lines) {
        if (l.orderLineId) {
          await tx.update(salesOrderLines).set({ invoicedQty: sql`greatest(0, ${salesOrderLines.invoicedQty} - ${l.qty})` }).where(eq(salesOrderLines.id, l.orderLineId));
        }
      }
      await tx.delete(priceHistory).where(and(eq(priceHistory.refType, "sales_invoice"), eq(priceHistory.refId, invoiceId)));
      // restore items.lastSaleRate/Date from the remaining sale history
      const itemIds = [...new Set(lines.map((l) => l.itemId).filter((v): v is number => v != null))];
      for (const itemId of itemIds) {
        const [last] = await tx.select({ rate: priceHistory.rate, date: priceHistory.date }).from(priceHistory)
          .where(and(eq(priceHistory.itemId, itemId), eq(priceHistory.kind, "sale"))).orderBy(desc(priceHistory.date), desc(priceHistory.id)).limit(1);
        await tx.update(items).set({ lastSaleRate: last?.rate ?? null, lastSaleDate: last?.date ?? null }).where(eq(items.id, itemId));
      }
      await tx.update(salesInvoices).set({ status: "cancelled" }).where(eq(salesInvoices.id, invoiceId));
      return { number: inv.number, orderId: inv.orderId };
    });
    await audit(db, user.id, "update", "sales_invoice", invoiceId, { status: "cancelled", number: res.number });
    revalidatePath("/billing", "layout");
    if (res.orderId) revalidatePath(`/orders/${res.orderId}`);
    target = withMsg(`/billing/invoices/${invoiceId}`, "ok", `Invoice ${res.number} cancelled`);
  } catch (e) {
    target = withMsg(invoiceId ? `/billing/invoices/${invoiceId}` : "/billing/invoices", "err", errMsg(e));
  }
  redirect(target);
}

// ---------------------------------------------------------------- e-mail ledger statement
export async function emailStatement(form: FormData) {
  const user = await requireWrite("billing");
  const customerId = Number(form.get("customerId"));
  const back = `/billing/receivables/${customerId}`;
  let target: string;
  try {
    if (!Number.isInteger(customerId) || customerId <= 0) throw new UserError("Invalid customer");
    const db = await getDb();
    const [cust] = await db.select().from(customers).where(eq(customers.id, customerId));
    if (!cust) throw new UserError("Customer not found");
    if (!cust.email) throw new UserError("Customer has no e-mail address. Add it in the customer master first.");
    const ledger = await customerLedger(db, customerId);
    if (!ledger.entries.length) throw new UserError("No transactions to send");
    const company = await getCompany(db);
    const { subject, html } = buildStatementEmail({
      customerName: cust.contactPerson ? `${cust.contactPerson} (${cust.name})` : cust.name, ledger,
      company: { name: company.name, phone: company.phone || undefined, email: company.email || undefined, bank: company.bank || undefined },
    });
    const emailId = await queueEmail(db, { to: cust.email, subject, html, agent: "manual", entityType: "customer", entityId: customerId });
    let delivery = "logged to the outbox (demo mode)";
    if (smtpConfigured()) {
      const r = await flushOutbox(db, 5);
      delivery = r.failed ? "queued, but sending failed. Check the Email outbox" : "sent";
    }
    await audit(db, user.id, "email", "customer", customerId, { kind: "statement", to: cust.email, emailId, closing: ledger.closing });
    revalidatePath("/emails");
    target = withMsg(back, "ok", `Statement to ${cust.email} ${delivery}`);
  } catch (e) {
    target = withMsg(back, "err", errMsg(e));
  }
  redirect(target);
}

// ---------------------------------------------------------------- vendor payment (out)
const payOut = z.object({
  purchaseInvoiceId: z.coerce.number().int().positive("Select a purchase invoice"),
  amount: money,
  date: isoDate,
  mode: z.enum(PAYMENT_MODES),
  reference: optText(80),
  notes: optText(1000),
});

export async function recordVendorPayment(form: FormData) {
  const user = await requireWrite("billing");
  const back = safeBack(form.get("back"), "/billing/payables");
  let target: string;
  try {
    const d = payOut.parse(Object.fromEntries(form));
    if (d.date > todayIST(1)) throw new UserError("Payment date cannot be in the future");
    const db = await getDb();
    const res = await db.transaction(async (tx) => {
      const [pi] = await tx.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, d.purchaseInvoiceId));
      if (!pi) throw new UserError("Purchase invoice not found");
      if (pi.status !== "posted") throw new UserError(`This purchase invoice is ${pi.status}. Only posted invoices can be paid`);
      const due = outstandingOf(pi.total, pi.paidAmount);
      if (d.amount > due + PAID_TOLERANCE) throw new UserError(`Amount exceeds the balance payable (${due.toFixed(2)})`);
      const [p] = await tx.insert(payments).values({
        direction: "out", vendorId: pi.vendorId, purchaseInvoiceId: pi.id, amount: d.amount, date: d.date, mode: d.mode,
        reference: d.reference, notes: d.notes, createdBy: user.id,
      }).returning({ id: payments.id });
      await tx.update(purchaseInvoices).set({ paidAmount: round2(Number(pi.paidAmount) + d.amount) }).where(eq(purchaseInvoices.id, pi.id));
      return { paymentId: p.id, invoiceNo: pi.invoiceNo };
    });
    await audit(db, user.id, "create", "payment", res.paymentId, { direction: "out", purchaseInvoiceId: d.purchaseInvoiceId, amount: d.amount, mode: d.mode });
    revalidatePath("/billing", "layout");
    target = withMsg(back, "ok", `Vendor payment recorded against ${res.invoiceNo}`);
  } catch (e) {
    target = withMsg(back, "err", errMsg(e));
  }
  redirect(target);
}

