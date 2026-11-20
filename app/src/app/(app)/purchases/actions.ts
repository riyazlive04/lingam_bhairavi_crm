"use server";
import { publicError } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { items, projects, purchaseInvoiceLines, purchaseInvoices, vendors } from "@/db/schema";
import { requireWrite } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { PAYMENT_MODES } from "@/lib/constants";
import { round2, todayIST } from "@/lib/format";
import { PurchaseError, computePurchaseTotals, duplicateInvoiceNo, lineAmount, postPurchaseInvoice, postSummary, recordPurchasePayment } from "@/lib/purchasing";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date");
const lineSchema = z.object({
  itemId: z.coerce.number().int().positive(),
  description: z.string().max(500).optional().default(""),
  qty: z.coerce.number().min(0, "Quantity cannot be negative").max(1e7),
  rate: z.coerce.number().min(0, "Rate cannot be negative").max(1e9),
  gstRate: z.coerce.number().min(0).max(28),
});
const headerSchema = z.object({
  vendorId: z.coerce.number().int().positive("Choose a vendor"),
  invoiceNo: z.string().trim().min(1, "Supplier invoice number is required").max(60),
  invoiceDate: dateStr,
  dueDate: z.union([z.literal(""), dateStr]).optional().transform((v) => (v ? v : null)),
  projectId: z.union([z.literal(""), z.coerce.number().int().positive()]).optional().transform((v) => (v === "" || v === undefined ? null : v)),
  notes: z.string().trim().max(2000).optional().transform((v) => (v ? v : null)),
  intent: z.enum(["draft", "post"]).default("draft"),
});

const msg = (e: unknown, fallback: string) => publicError(e, fallback, [PurchaseError]);

type Parsed = { header: z.infer<typeof headerSchema>; lines: z.infer<typeof lineSchema>[] };

async function parseAndValidate(fd: FormData, exceptId?: number): Promise<Parsed> {
  const header = headerSchema.parse({
    vendorId: fd.get("vendorId"), invoiceNo: fd.get("invoiceNo"), invoiceDate: fd.get("invoiceDate"), dueDate: fd.get("dueDate") ?? "",
    projectId: fd.get("projectId") ?? "", notes: fd.get("notes") ?? "", intent: fd.get("intent") ?? "draft",
  });
  let raw: unknown;
  try { raw = JSON.parse(String(fd.get("lines") ?? "[]")); } catch { throw new PurchaseError("Invalid line data"); }
  const lines = z.array(lineSchema).max(500).parse(raw).filter((l) => l.qty > 0);
  if (!lines.length) throw new PurchaseError("Add at least one line with quantity");
  if (header.invoiceDate > todayIST(1)) throw new PurchaseError("Invoice date cannot be in the future");
  if (header.dueDate && header.dueDate < header.invoiceDate) throw new PurchaseError("Due date cannot be before the invoice date");

  const db = await getDb();
  const [v] = await db.select({ id: vendors.id, terms: vendors.paymentTermsDays }).from(vendors).where(eq(vendors.id, header.vendorId));
  if (!v) throw new PurchaseError("Vendor not found");
  if (header.projectId) {
    const [p] = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, header.projectId));
    if (!p) throw new PurchaseError("Project not found");
  }
  const ids = [...new Set(lines.map((l) => l.itemId))];
  const found = await db.select({ id: items.id }).from(items).where(inArray(items.id, ids));
  if (found.length !== ids.length) throw new PurchaseError("One or more items no longer exist");
  if (await duplicateInvoiceNo(db, header.vendorId, header.invoiceNo, exceptId)) {
    throw new PurchaseError(`Invoice ${header.invoiceNo} from this vendor is already entered`);
  }
  if (!header.dueDate) {
    const d = new Date(header.invoiceDate + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + v.terms);
    header.dueDate = d.toISOString().slice(0, 10);
  }
  return { header, lines };
}

function lineRows(invoiceId: number, lines: Parsed["lines"]) {
  return lines.map((l) => ({
    invoiceId, itemId: l.itemId, description: l.description?.trim() || null, qty: l.qty, rate: round2(l.rate), gstRate: l.gstRate, amount: lineAmount(l),
  }));
}

/** Create a purchase invoice (draft, optionally posted immediately). */
export async function createPurchase(fd: FormData) {
  const user = await requireWrite("purchases");
  let target: string;
  let id: number | null = null;
  try {
    const { header, lines } = await parseAndValidate(fd);
    const db = await getDb();
    const totals = computePurchaseTotals(lines);
    id = await db.transaction(async (tx) => {
      const [inv] = await tx.insert(purchaseInvoices).values({
        vendorId: header.vendorId, invoiceNo: header.invoiceNo, invoiceDate: header.invoiceDate, dueDate: header.dueDate,
        projectId: header.projectId, notes: header.notes, status: "draft", createdBy: user.id, ...totals,
      }).returning({ id: purchaseInvoices.id });
      await tx.insert(purchaseInvoiceLines).values(lineRows(inv.id, lines));
      return inv.id;
    });
    await audit(db, user.id, "create", "purchase_invoice", id, { invoiceNo: header.invoiceNo, vendorId: header.vendorId, total: totals.total });
    if (header.intent === "post") {
      try {
        const r = await postPurchaseInvoice(db, id, user.id);
        await audit(db, user.id, "post", "purchase_invoice", id, { itemsUpdated: r.itemsUpdated, priceChanges: r.priceChanges });
        target = `/purchases/${id}?ok=` + encodeURIComponent(postSummary(r));
      } catch (e) {
        target = `/purchases/${id}?err=` + encodeURIComponent("Saved as draft but could not post: " + msg(e, "posting failed"));
      }
    } else {
      target = `/purchases/${id}?ok=` + encodeURIComponent("Draft saved. Post it to update prices and stock.");
    }
  } catch (e) {
    if (!(e instanceof PurchaseError) && !(e instanceof z.ZodError)) console.error("createPurchase", e);
    target = "/purchases/new?err=" + encodeURIComponent(msg(e, "Could not save invoice"));
  }
  revalidatePath("/purchases");
  if (id) { revalidatePath("/items"); revalidatePath("/stock"); }
  redirect(target);
}

/** Update a draft invoice (header + replace lines). */
export async function updatePurchase(invoiceId: number, fd: FormData) {
  const user = await requireWrite("purchases");
  let target: string;
  try {
    const { header, lines } = await parseAndValidate(fd, invoiceId);
    const db = await getDb();
    const totals = computePurchaseTotals(lines);
    await db.transaction(async (tx) => {
      const r = await tx.update(purchaseInvoices).set({
        vendorId: header.vendorId, invoiceNo: header.invoiceNo, invoiceDate: header.invoiceDate, dueDate: header.dueDate,
        projectId: header.projectId, notes: header.notes, ...totals,
      }).where(and(eq(purchaseInvoices.id, invoiceId), eq(purchaseInvoices.status, "draft"))).returning({ id: purchaseInvoices.id });
      if (!r.length) throw new PurchaseError("Only draft invoices can be edited");
      await tx.delete(purchaseInvoiceLines).where(eq(purchaseInvoiceLines.invoiceId, invoiceId));
      await tx.insert(purchaseInvoiceLines).values(lineRows(invoiceId, lines));
    });
    await audit(db, user.id, "update", "purchase_invoice", invoiceId, { invoiceNo: header.invoiceNo, total: totals.total });
    if (header.intent === "post") {
      try {
        const r = await postPurchaseInvoice(db, invoiceId, user.id);
        await audit(db, user.id, "post", "purchase_invoice", invoiceId, { itemsUpdated: r.itemsUpdated, priceChanges: r.priceChanges });
        target = `/purchases/${invoiceId}?ok=` + encodeURIComponent(postSummary(r));
      } catch (e) {
        target = `/purchases/${invoiceId}?err=` + encodeURIComponent("Saved but could not post: " + msg(e, "posting failed"));
      }
    } else {
      target = `/purchases/${invoiceId}?ok=` + encodeURIComponent("Draft updated");
    }
  } catch (e) {
    if (!(e instanceof PurchaseError) && !(e instanceof z.ZodError)) console.error("updatePurchase", e);
    target = `/purchases/${invoiceId}/edit?err=` + encodeURIComponent(msg(e, "Could not save invoice"));
  }
  revalidatePath("/purchases");
  revalidatePath(`/purchases/${invoiceId}`);
  redirect(target);
}

/** Post a draft (CONVENTIONS rule 4). Idempotent: a second call reports that it is already posted. */
export async function postPurchase(invoiceId: number) {
  const user = await requireWrite("purchases");
  const db = await getDb();
  let target: string;
  try {
    const r = await postPurchaseInvoice(db, invoiceId, user.id);
    await audit(db, user.id, "post", "purchase_invoice", invoiceId, { itemsUpdated: r.itemsUpdated, priceChanges: r.priceChanges });
    target = `/purchases/${invoiceId}?ok=` + encodeURIComponent(postSummary(r));
  } catch (e) {
    if (!(e instanceof PurchaseError)) console.error("postPurchase", e);
    target = `/purchases/${invoiceId}?err=` + encodeURIComponent(msg(e, "Could not post invoice"));
  }
  revalidatePath("/purchases");
  revalidatePath(`/purchases/${invoiceId}`);
  revalidatePath("/items");
  revalidatePath("/stock");
  redirect(target);
}

/** Cancel a draft invoice (posted invoices cannot be cancelled here; raise a debit note instead). */
export async function cancelPurchase(invoiceId: number) {
  const user = await requireWrite("purchases");
  const db = await getDb();
  const r = await db.update(purchaseInvoices).set({ status: "cancelled" })
    .where(and(eq(purchaseInvoices.id, invoiceId), eq(purchaseInvoices.status, "draft"))).returning({ id: purchaseInvoices.id });
  if (r.length) await audit(db, user.id, "update", "purchase_invoice", invoiceId, { status: "cancelled" });
  revalidatePath("/purchases");
  redirect(`/purchases/${invoiceId}?` + (r.length ? "ok=" + encodeURIComponent("Draft cancelled") : "err=" + encodeURIComponent("Only draft invoices can be cancelled")));
}

const paymentSchema = z.object({
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  date: dateStr,
  mode: z.enum(PAYMENT_MODES),
  reference: z.string().trim().max(80).optional().transform((v) => (v ? v : null)),
  notes: z.string().trim().max(500).optional().transform((v) => (v ? v : null)),
});

/** Record a payment to the vendor against this invoice (payments.direction = 'out'). */
export async function recordPayment(invoiceId: number, fd: FormData) {
  const user = await requireWrite("purchases");
  let target: string;
  try {
    const p = paymentSchema.parse({ amount: fd.get("amount"), date: fd.get("date"), mode: fd.get("mode"), reference: fd.get("reference") ?? "", notes: fd.get("notes") ?? "" });
    if (p.date > todayIST(1)) throw new PurchaseError("Payment date cannot be in the future");
    const db = await getDb();
    const r = await recordPurchasePayment(db, { invoiceId, ...p }, user.id);
    await audit(db, user.id, "create", "payment", r.paymentId, { direction: "out", purchaseInvoiceId: invoiceId, amount: p.amount, mode: p.mode });
    target = `/purchases/${invoiceId}?ok=` + encodeURIComponent(r.outstanding <= 0.5 ? "Payment recorded. The invoice is now fully paid" : `Payment recorded. Balance ₹${r.outstanding.toLocaleString("en-IN")}`);
  } catch (e) {
    if (!(e instanceof PurchaseError) && !(e instanceof z.ZodError)) console.error("recordPayment", e);
    target = `/purchases/${invoiceId}?err=` + encodeURIComponent(msg(e, "Could not record payment"));
  }
  revalidatePath("/purchases");
  revalidatePath(`/purchases/${invoiceId}`);
  redirect(target);
}
