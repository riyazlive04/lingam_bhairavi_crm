"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  purchaseInvoices, purchaseReturnLines, purchaseReturns, salesInvoices, salesOrders, salesReturnLines, salesReturns,
} from "@/db/schema";
import { requireWrite } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canWrite } from "@/lib/rbac";
import { round2, todayIST } from "@/lib/format";
import {
  RETURN_REASON_KEYS, ReturnError, adjustCreditNote, adjustDebitNote, draftNumber, postPurchaseReturn, postSalesReturn,
  returnTotals, returnableInvoiceLines, returnableOrderLines, returnablePurchaseLines, type ReturnReason, type ReturnableLine,
} from "@/lib/returns";
import type { Tx } from "@/lib/orders";

class UserError extends Error {}
function errMsg(e: unknown): string {
  if (e instanceof z.ZodError) return e.issues[0]?.message ?? "Invalid input";
  if (e instanceof UserError || e instanceof ReturnError) return e.message;
  if (e instanceof SyntaxError) return "The lines could not be read. Please reload the page and try again.";
  console.error(e);
  return "Something went wrong. Please try again.";
}
const withMsg = (path: string, key: "ok" | "err", msg: string) => `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg)}`;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");
const optText = (max: number) => z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : undefined), z.string().max(max).optional());
const optId = z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().int().positive().optional());
const amountSchema = z.coerce.number().positive("Amount must be greater than 0").max(1e10).transform(round2);
const intent = z.enum(["draft", "post"]).default("draft");

const lineIn = z.object({
  key: z.string().min(1).max(40),
  qty: z.number().positive("Quantity must be greater than 0"),
  rate: z.number().min(0, "Rate cannot be negative").max(1e9),
  gstRate: z.number().min(0).max(28, "GST rate looks wrong"),
  restock: z.boolean().default(false),
});
const parseLines = (form: FormData) =>
  z.array(lineIn).min(1, "Enter the returned quantity for at least one line").max(500).parse(JSON.parse(String(form.get("lines") ?? "[]")));

/**
 * A credit / debit note can never be worth more than the original document: the rate may be lowered (down to 0 for a
 * free replacement) but not raised above the invoiced / billed rate, and GST cannot be higher than on the original line.
 */
function assertPriceWithinOriginal(l: { rate: number; gstRate: number }, a: { description: string; rate: number; gstRate: number }) {
  if (l.rate > Number(a.rate) + 0.005) throw new UserError(`"${a.description.slice(0, 60)}": the rate cannot be more than the original ${Number(a.rate).toFixed(2)}`);
  if (l.gstRate > Number(a.gstRate) + 1e-6) throw new UserError(`"${a.description.slice(0, 60)}": GST cannot be more than the original ${Number(a.gstRate)}%`);
}

function assertNotFuture(date: string) {
  if (date > todayIST(1)) throw new UserError("The return date cannot be in the future");
}

// ---------------------------------------------------------------- customer return (credit note)
const salesHeader = z.object({
  returnId: optId,
  orderId: optId,
  salesInvoiceId: optId,
  date: isoDate,
  reason: z.enum(RETURN_REASON_KEYS as [ReturnReason, ...ReturnReason[]], { message: "Choose a reason" }),
  notes: optText(2000),
  intent,
});

/** Builds validated credit-note lines from server data; only qty, rate, GST and restock come from the form. */
function buildSalesLines(input: z.infer<typeof lineIn>[], avail: ReturnableLine[]) {
  const byKey = new Map(avail.map((a) => [a.key, a]));
  const seen = new Set<string>();
  return input.map((l) => {
    const a = byKey.get(l.key);
    if (!a) throw new UserError("A line is not on this order or invoice any more. Please reload and try again");
    if (seen.has(l.key)) throw new UserError(`"${a.description.slice(0, 60)}" is entered twice`);
    seen.add(l.key);
    if (l.qty > a.returnable + 1e-6) throw new UserError(`"${a.description.slice(0, 60)}": only ${a.returnable} ${a.uom} can be returned (entered ${l.qty})`);
    assertPriceWithinOriginal(l, a);
    return {
      orderLineId: a.orderLineId, itemId: a.itemId, description: a.description, qty: l.qty, rate: l.rate, gstRate: l.gstRate,
      restock: !!a.itemId && l.restock,
    };
  });
}

export async function saveSalesReturn(form: FormData) {
  const user = await requireWrite("returns");
  let target: string;
  const back = form.get("returnId") ? `/returns/${encodeURIComponent(String(form.get("returnId")))}/edit`
    : `/returns/new?${form.get("salesInvoiceId") && !form.get("orderId") ? `invoiceId=${encodeURIComponent(String(form.get("salesInvoiceId")))}` : `orderId=${encodeURIComponent(String(form.get("orderId") ?? ""))}`}`;
  try {
    const h = salesHeader.parse(Object.fromEntries(form));
    assertNotFuture(h.date);
    const input = parseLines(form);
    const db = await getDb();
    const res = await db.transaction(async (tx) => {
      let orderId = h.orderId ?? null, invoiceId = h.salesInvoiceId ?? null;
      if (h.returnId) {
        const [r] = await tx.select().from(salesReturns).where(eq(salesReturns.id, h.returnId)).for("update");
        if (!r) throw new UserError("Credit note not found");
        if (r.status !== "draft") throw new UserError("Only a draft can be changed");
        // an invoice-only draft stays on its invoice (and so its customer); an order draft may pick another invoice of that order
        orderId = r.orderId; invoiceId = r.orderId ? invoiceId ?? r.salesInvoiceId : r.salesInvoiceId;
      }
      if (!orderId && !invoiceId) throw new UserError("Start the return from an order or an invoice");
      // a new return started from an invoice is limited to that invoice's lines; otherwise the order's delivered lines
      const fromInvoice = !h.returnId && !!invoiceId && !h.orderId;
      let customerId = 0, projectId: number | null = null;
      let invLines: ReturnableLine[] = [];
      if (invoiceId) {
        const [inv] = await tx.select().from(salesInvoices).where(eq(salesInvoices.id, invoiceId));
        if (!inv) throw new UserError("Invoice not found");
        if (inv.status === "cancelled" || inv.status === "draft") throw new UserError(`Invoice ${inv.number} is ${inv.status}`);
        if (orderId && inv.orderId !== orderId) throw new UserError("That invoice is not for this order");
        customerId = inv.customerId; projectId = inv.projectId; orderId = orderId ?? inv.orderId;
        invLines = await returnableInvoiceLines(tx, invoiceId);
      }
      let avail: ReturnableLine[] = fromInvoice ? invLines : invLines.filter((l) => l.orderLineId == null);
      if (orderId) {
        const [o] = await tx.select().from(salesOrders).where(eq(salesOrders.id, orderId));
        if (!o) throw new UserError("Order not found");
        if (o.status === "cancelled") throw new UserError("This order is cancelled");
        customerId = o.customerId; projectId = o.projectId ?? projectId;
        if (!fromInvoice) avail = [...(await returnableOrderLines(tx, orderId)), ...avail];
      }
      const lines = buildSalesLines(input, avail);
      const t = returnTotals(lines);
      if (!t.lines.length) throw new UserError("Enter the returned quantity for at least one line");
      const head = {
        customerId, orderId, salesInvoiceId: invoiceId, projectId, date: h.date, reason: h.reason, notes: h.notes ?? null,
        subtotal: t.subtotal, taxAmount: t.taxAmount, total: t.total,
      };
      let id: number;
      if (h.returnId) {
        id = h.returnId;
        await tx.update(salesReturns).set(head).where(and(eq(salesReturns.id, id), eq(salesReturns.status, "draft")));
        await tx.delete(salesReturnLines).where(eq(salesReturnLines.returnId, id));
      } else {
        const [r] = await tx.insert(salesReturns).values({ ...head, number: `DRAFT-CN-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, status: "draft", createdBy: user.id })
          .returning({ id: salesReturns.id });
        id = r.id;
        await tx.update(salesReturns).set({ number: draftNumber("CN", id) }).where(eq(salesReturns.id, id));
      }
      await tx.insert(salesReturnLines).values(t.lines.map((l) => ({
        returnId: id, orderLineId: l.orderLineId, itemId: l.itemId, description: l.description, qty: l.qty, rate: l.rate,
        gstRate: l.gstRate, amount: l.amount, restock: l.restock, costRate: 0,
      })));
      const posted = h.intent === "post" ? await postSalesReturn(tx as Tx, id, user.id) : null;
      return { id, total: t.total, posted, orderId };
    });
    await audit(db, user.id, h.returnId ? "update" : "create", "sales_return", res.id, { total: res.total, lines: input.length, orderId: res.orderId, invoiceId: h.salesInvoiceId });
    if (res.posted) await audit(db, user.id, "post", "sales_return", res.id, { number: res.posted.number, restocked: res.posted.restockedLines });
    revalidatePath("/returns");
    if (res.orderId) revalidatePath(`/orders/${res.orderId}`);
    if (res.posted) revalidatePath("/billing", "layout");
    target = withMsg(`/returns/${res.id}`, "ok", res.posted ? `Credit note ${res.posted.number} posted` : "Draft saved. Post it when the goods are back");
  } catch (e) {
    target = withMsg(back, "err", errMsg(e));
  }
  redirect(target);
}

export async function postSalesReturnAction(form: FormData) {
  const user = await requireWrite("returns");
  const id = Number(form.get("returnId"));
  let target: string;
  try {
    if (!Number.isInteger(id) || id <= 0) throw new UserError("Invalid credit note");
    const db = await getDb();
    const res = await db.transaction((tx) => postSalesReturn(tx as Tx, id, user.id));
    await audit(db, user.id, "post", "sales_return", id, { number: res.number, restocked: res.restockedLines, total: res.total });
    revalidatePath("/returns");
    revalidatePath("/billing", "layout");
    for (const o of res.orderIds) revalidatePath(`/orders/${o}`);
    target = withMsg(`/returns/${id}`, "ok", `Credit note ${res.number} posted${res.restockedLines ? `. ${res.restockedLines} line${res.restockedLines === 1 ? "" : "s"} back in stock` : ""}`);
  } catch (e) {
    target = withMsg(id ? `/returns/${id}` : "/returns", "err", errMsg(e));
  }
  redirect(target);
}

export async function deleteSalesReturnDraft(form: FormData) {
  const user = await requireWrite("returns");
  const id = Number(form.get("returnId"));
  let target: string;
  try {
    if (!Number.isInteger(id) || id <= 0) throw new UserError("Invalid credit note");
    const db = await getDb();
    const r = await db.transaction(async (tx) => {
      const [row] = await tx.select().from(salesReturns).where(eq(salesReturns.id, id)).for("update");
      if (!row) throw new UserError("Credit note not found");
      if (row.status !== "draft") throw new UserError("Only a draft can be deleted");
      await tx.delete(salesReturnLines).where(eq(salesReturnLines.returnId, id));
      await tx.delete(salesReturns).where(eq(salesReturns.id, id));
      return row;
    });
    await audit(db, user.id, "delete", "sales_return", id, { number: r.number, total: r.total });
    revalidatePath("/returns");
    if (r.orderId) revalidatePath(`/orders/${r.orderId}`);
    target = withMsg("/returns", "ok", "Draft deleted");
  } catch (e) {
    target = withMsg(id ? `/returns/${id}` : "/returns", "err", errMsg(e));
  }
  redirect(target);
}

const adjustSchema = z.object({ returnId: z.coerce.number().int().positive(), invoiceId: z.coerce.number().int().positive("Choose an invoice"), amount: amountSchema });

export async function adjustCreditNoteAction(form: FormData) {
  const user = await requireWrite("returns");
  const id = Number(form.get("returnId"));
  let target: string;
  try {
    if (!canWrite(user.role, "billing")) throw new UserError("Only Accounts or the Owner can adjust a credit note against an invoice");
    const d = adjustSchema.parse(Object.fromEntries(form));
    const db = await getDb();
    const res = await db.transaction((tx) => adjustCreditNote(tx as Tx, d.returnId, d.invoiceId, d.amount));
    await audit(db, user.id, "adjust", "sales_return", d.returnId, { invoiceId: d.invoiceId, invoiceNumber: res.invoiceNumber, amount: res.amount });
    await audit(db, user.id, "credit_adjust", "sales_invoice", d.invoiceId, { returnId: d.returnId, number: res.returnNumber, amount: res.amount, status: res.invoiceStatus });
    revalidatePath(`/returns/${d.returnId}`);
    revalidatePath("/returns");
    revalidatePath("/billing", "layout");
    if (res.orderId) revalidatePath(`/orders/${res.orderId}`);
    target = withMsg(`/returns/${d.returnId}`, "ok", `Adjusted against invoice ${res.invoiceNumber}${res.invoiceStatus === "paid" ? ". The invoice is now fully settled" : ""}`);
  } catch (e) {
    target = withMsg(id ? `/returns/${id}` : "/returns", "err", errMsg(e));
  }
  redirect(target);
}

// ---------------------------------------------------------------- return to vendor (debit note)
const vendorHeader = z.object({
  returnId: optId,
  purchaseInvoiceId: optId,
  date: isoDate,
  reason: optText(1000),
  intent,
});

export async function saveVendorReturn(form: FormData) {
  const user = await requireWrite("returns");
  let target: string;
  const back = form.get("returnId") ? `/returns/vendor/${encodeURIComponent(String(form.get("returnId")))}/edit`
    : `/returns/vendor/new?invoiceId=${encodeURIComponent(String(form.get("purchaseInvoiceId") ?? ""))}`;
  try {
    const h = vendorHeader.parse(Object.fromEntries(form));
    assertNotFuture(h.date);
    const input = parseLines(form);
    const db = await getDb();
    const res = await db.transaction(async (tx) => {
      let piId = h.purchaseInvoiceId ?? null;
      if (h.returnId) {
        const [r] = await tx.select().from(purchaseReturns).where(eq(purchaseReturns.id, h.returnId)).for("update");
        if (!r) throw new UserError("Debit note not found");
        if (r.status !== "draft") throw new UserError("Only a draft can be changed");
        piId = r.purchaseInvoiceId;
      }
      if (!piId) throw new UserError("Start the return from a purchase invoice");
      const [pi] = await tx.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, piId));
      if (!pi) throw new UserError("Purchase invoice not found");
      if (pi.status !== "posted") throw new UserError(`Purchase invoice ${pi.invoiceNo} is ${pi.status}. Only posted bills can be returned against`);
      const avail = await returnablePurchaseLines(tx, piId);
      const byKey = new Map(avail.map((a) => [a.key, a]));
      const seen = new Set<string>();
      const lines = input.map((l) => {
        const a = byKey.get(l.key);
        if (!a) throw new UserError("A line is not on this bill any more. Please reload and try again");
        if (seen.has(l.key)) throw new UserError(`"${a.description.slice(0, 60)}" is entered twice`);
        seen.add(l.key);
        if (l.qty > a.returnable + 1e-6) throw new UserError(`"${a.description.slice(0, 60)}": only ${a.returnable} ${a.uom} can go back (billed less returned, and what is in stock)`);
        assertPriceWithinOriginal(l, a);
        return { purchaseInvoiceLineId: a.purchaseInvoiceLineId, itemId: a.itemId, qty: l.qty, rate: l.rate, gstRate: l.gstRate };
      });
      const t = returnTotals(lines);
      if (!t.lines.length) throw new UserError("Enter the quantity going back for at least one line");
      const head = { vendorId: pi.vendorId, purchaseInvoiceId: piId, date: h.date, reason: h.reason ?? null, subtotal: t.subtotal, taxAmount: t.taxAmount, total: t.total };
      let id: number;
      if (h.returnId) {
        id = h.returnId;
        await tx.update(purchaseReturns).set(head).where(and(eq(purchaseReturns.id, id), eq(purchaseReturns.status, "draft")));
        await tx.delete(purchaseReturnLines).where(eq(purchaseReturnLines.returnId, id));
      } else {
        const [r] = await tx.insert(purchaseReturns).values({ ...head, number: `DRAFT-DN-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, status: "draft", createdBy: user.id })
          .returning({ id: purchaseReturns.id });
        id = r.id;
        await tx.update(purchaseReturns).set({ number: draftNumber("DN", id) }).where(eq(purchaseReturns.id, id));
      }
      await tx.insert(purchaseReturnLines).values(t.lines.map((l) => ({
        returnId: id, itemId: l.itemId, purchaseInvoiceLineId: l.purchaseInvoiceLineId, qty: l.qty, rate: l.rate, gstRate: l.gstRate, amount: l.amount,
      })));
      const posted = h.intent === "post" ? await postPurchaseReturn(tx as Tx, id, user.id) : null;
      return { id, total: t.total, posted };
    });
    await audit(db, user.id, h.returnId ? "update" : "create", "purchase_return", res.id, { total: res.total, lines: input.length, purchaseInvoiceId: h.purchaseInvoiceId });
    if (res.posted) await audit(db, user.id, "post", "purchase_return", res.id, { number: res.posted.number });
    revalidatePath("/returns");
    if (res.posted) { revalidatePath("/billing", "layout"); revalidatePath("/stock"); }
    target = withMsg(`/returns/vendor/${res.id}`, "ok", res.posted ? `Debit note ${res.posted.number} posted and stock reduced` : "Draft saved. Post it when the goods leave");
  } catch (e) {
    target = withMsg(back, "err", errMsg(e));
  }
  redirect(target);
}

export async function postVendorReturnAction(form: FormData) {
  const user = await requireWrite("returns");
  const id = Number(form.get("returnId"));
  let target: string;
  try {
    if (!Number.isInteger(id) || id <= 0) throw new UserError("Invalid debit note");
    const db = await getDb();
    const res = await db.transaction((tx) => postPurchaseReturn(tx as Tx, id, user.id));
    await audit(db, user.id, "post", "purchase_return", id, { number: res.number, total: res.total });
    revalidatePath("/returns");
    revalidatePath("/billing", "layout");
    revalidatePath("/stock");
    target = withMsg(`/returns/vendor/${id}`, "ok", `Debit note ${res.number} posted and stock reduced`);
  } catch (e) {
    target = withMsg(id ? `/returns/vendor/${id}` : "/returns?tab=vendor", "err", errMsg(e));
  }
  redirect(target);
}

export async function deleteVendorReturnDraft(form: FormData) {
  const user = await requireWrite("returns");
  const id = Number(form.get("returnId"));
  let target: string;
  try {
    if (!Number.isInteger(id) || id <= 0) throw new UserError("Invalid debit note");
    const db = await getDb();
    const r = await db.transaction(async (tx) => {
      const [row] = await tx.select().from(purchaseReturns).where(eq(purchaseReturns.id, id)).for("update");
      if (!row) throw new UserError("Debit note not found");
      if (row.status !== "draft") throw new UserError("Only a draft can be deleted");
      await tx.delete(purchaseReturnLines).where(eq(purchaseReturnLines.returnId, id));
      await tx.delete(purchaseReturns).where(eq(purchaseReturns.id, id));
      return row;
    });
    await audit(db, user.id, "delete", "purchase_return", id, { number: r.number, total: r.total });
    revalidatePath("/returns");
    target = withMsg("/returns?tab=vendor", "ok", "Draft deleted");
  } catch (e) {
    target = withMsg(id ? `/returns/vendor/${id}` : "/returns?tab=vendor", "err", errMsg(e));
  }
  redirect(target);
}

const adjustDnSchema = z.object({ returnId: z.coerce.number().int().positive(), purchaseInvoiceId: z.coerce.number().int().positive("Choose a vendor bill"), amount: amountSchema });

export async function adjustDebitNoteAction(form: FormData) {
  const user = await requireWrite("returns");
  const id = Number(form.get("returnId"));
  let target: string;
  try {
    if (!canWrite(user.role, "billing") && !canWrite(user.role, "purchases")) throw new UserError("Only Accounts, Purchase or the Owner can adjust a debit note against a bill");
    const d = adjustDnSchema.parse(Object.fromEntries(form));
    const db = await getDb();
    const res = await db.transaction((tx) => adjustDebitNote(tx as Tx, d.returnId, d.purchaseInvoiceId, d.amount));
    await audit(db, user.id, "adjust", "purchase_return", d.returnId, { purchaseInvoiceId: d.purchaseInvoiceId, invoiceNo: res.invoiceNo, amount: res.amount });
    await audit(db, user.id, "debit_adjust", "purchase_invoice", d.purchaseInvoiceId, { returnId: d.returnId, number: res.returnNumber, amount: res.amount });
    revalidatePath(`/returns/vendor/${d.returnId}`);
    revalidatePath("/returns");
    revalidatePath("/billing", "layout");
    revalidatePath(`/purchases/${d.purchaseInvoiceId}`);
    target = withMsg(`/returns/vendor/${d.returnId}`, "ok", `Adjusted against bill ${res.invoiceNo}`);
  } catch (e) {
    target = withMsg(id ? `/returns/vendor/${id}` : "/returns?tab=vendor", "err", errMsg(e));
  }
  redirect(target);
}
