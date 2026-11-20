/**
 * Purchase invoice domain logic. Maintainer: Sirah Digital.
 *
 * `postPurchaseInvoice` implements CONVENTIONS rule 4, the single place that turns a supplier invoice into
 * price history, vendor-item rates, stock movements and the item's latest cost (which quotations auto-pick).
 */
import "server-only";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { items, payments, priceHistory, purchaseInvoiceLines, purchaseInvoices, stockMovements, vendorItems } from "@/db/schema";
import { round2 } from "./format";
import type { Executor } from "./items";

/** Price change threshold (%) reported after posting. */
export const PRICE_JUMP_PCT = 5;

export type PurchaseLineInput = { itemId: number; description?: string | null; qty: number; rate: number; gstRate: number };

/** Line amount = qty × rate (pre-tax). */
export const lineAmount = (l: { qty: number; rate: number }) => round2(Number(l.qty) * Number(l.rate));

/** Invoice totals from lines (qty-0 lines are ignored). */
export function computePurchaseTotals(lines: { qty: number; rate: number; gstRate: number }[]) {
  let subtotal = 0, taxAmount = 0;
  for (const l of lines) {
    if (!Number(l.qty)) continue;
    const amt = lineAmount(l);
    subtotal += amt;
    taxAmount += (amt * Number(l.gstRate)) / 100;
  }
  subtotal = round2(subtotal);
  taxAmount = round2(taxAmount);
  return { subtotal, taxAmount, total: round2(subtotal + taxAmount) };
}

export type PriceChange = { itemId: number; oldRate: number; newRate: number; changePct: number };
export type PostResult = { invoiceId: number; lines: number; itemsUpdated: number; priceChanges: PriceChange[] };

export class PurchaseError extends Error {}

/**
 * Post a draft purchase invoice (draft → posted, exactly once). Runs in a single DB transaction:
 *  - price_history(kind 'purchase') per line
 *  - vendor_items upsert (lastRate/lastDate only move forward in time)
 *  - stock_movements purchase_in (+qty); if invoice.projectId also issue_project (−qty) to that project
 *  - items.lastPurchaseRate/Date/VendorId when invoice date ≥ item's current lastPurchaseDate
 * Throws PurchaseError when the invoice is missing, not a draft, or has no lines.
 */
export async function postPurchaseInvoice(db: DB, invoiceId: number, userId: number | null): Promise<PostResult> {
  return db.transaction(async (tx) => {
    // Atomic claim: only one caller can flip draft → posted.
    const claimed = await tx.update(purchaseInvoices).set({ status: "posted" })
      .where(and(eq(purchaseInvoices.id, invoiceId), eq(purchaseInvoices.status, "draft")))
      .returning();
    const inv = claimed[0];
    if (!inv) {
      const [cur] = await tx.select({ status: purchaseInvoices.status }).from(purchaseInvoices).where(eq(purchaseInvoices.id, invoiceId));
      throw new PurchaseError(cur ? `Invoice is already ${cur.status}. Only drafts can be posted` : "Invoice not found");
    }
    const lines = (await tx.select().from(purchaseInvoiceLines).where(eq(purchaseInvoiceLines.invoiceId, invoiceId)))
      .filter((l) => Number(l.qty) > 0)
      .sort((a, b) => a.id - b.id);
    if (!lines.length) throw new PurchaseError("This invoice has no lines with a quantity. Add items before posting");

    // Recompute totals from lines so the posted figures are always consistent.
    const totals = computePurchaseTotals(lines);
    await tx.update(purchaseInvoices).set(totals).where(eq(purchaseInvoices.id, invoiceId));

    const itemIds = [...new Set(lines.map((l) => l.itemId))];
    const before = new Map((await tx.select({ id: items.id, lastPurchaseRate: items.lastPurchaseRate, lastPurchaseDate: items.lastPurchaseDate })
      .from(items).where(inArray(items.id, itemIds))).map((r) => [r.id, r]));
    if (before.size !== itemIds.length) throw new PurchaseError("Invoice references an item that no longer exists");

    for (const l of lines) {
      const qty = Number(l.qty), rate = Number(l.rate);
      await tx.insert(priceHistory).values({
        itemId: l.itemId, kind: "purchase", rate, date: inv.invoiceDate, vendorId: inv.vendorId,
        refType: "purchase_invoice", refId: inv.id, qty,
      });
      await tx.insert(stockMovements).values({
        itemId: l.itemId, qty, type: "purchase_in", rate, refType: "purchase_invoice", refId: inv.id,
        date: inv.invoiceDate, notes: `Purchase ${inv.invoiceNo}`, createdBy: userId,
      });
      if (inv.projectId) {
        await tx.insert(stockMovements).values({
          itemId: l.itemId, qty: -qty, type: "issue_project", rate, projectId: inv.projectId, refType: "purchase_invoice", refId: inv.id,
          date: inv.invoiceDate, notes: `Direct to site, purchase ${inv.invoiceNo}`, createdBy: userId,
        });
      }
    }

    // Per item, the last line on the invoice decides the rate.
    const lastByItem = new Map<number, number>();
    for (const l of lines) lastByItem.set(l.itemId, Number(l.rate));

    const priceChanges: PriceChange[] = [];
    let itemsUpdated = 0;
    for (const [itemId, rate] of lastByItem) {
      await tx.insert(vendorItems).values({ vendorId: inv.vendorId, itemId, lastRate: rate, lastDate: inv.invoiceDate })
        .onConflictDoUpdate({
          target: [vendorItems.vendorId, vendorItems.itemId],
          set: {
            lastRate: sql`case when ${vendorItems.lastDate} is null or excluded.last_date >= ${vendorItems.lastDate} then excluded.last_rate else ${vendorItems.lastRate} end`,
            lastDate: sql`case when ${vendorItems.lastDate} is null or excluded.last_date >= ${vendorItems.lastDate} then excluded.last_date else ${vendorItems.lastDate} end`,
          },
        });
      const b = before.get(itemId)!;
      if (!b.lastPurchaseDate || inv.invoiceDate >= b.lastPurchaseDate) {
        await tx.update(items).set({ lastPurchaseRate: rate, lastPurchaseDate: inv.invoiceDate, lastPurchaseVendorId: inv.vendorId }).where(eq(items.id, itemId));
        itemsUpdated++;
        const old = b.lastPurchaseRate == null ? null : Number(b.lastPurchaseRate);
        if (old && old > 0) {
          const changePct = round2(((rate - old) / old) * 100);
          if (Math.abs(changePct) >= PRICE_JUMP_PCT) priceChanges.push({ itemId, oldRate: old, newRate: rate, changePct });
        }
      }
    }
    return { invoiceId, lines: lines.length, itemsUpdated, priceChanges };
  });
}

/** Human summary for the flash after posting. */
export function postSummary(r: PostResult) {
  return `Invoice posted. Updated latest price for ${r.itemsUpdated} item${r.itemsUpdated === 1 ? "" : "s"} (${r.priceChanges.length} price change${r.priceChanges.length === 1 ? "" : "s"} ≥${PRICE_JUMP_PCT}%).`;
}

/** Outstanding of a purchase invoice. */
export const purchaseOutstanding = (inv: { total: number; paidAmount: number }) => round2(Math.max(0, Number(inv.total) - Number(inv.paidAmount)));

/** Outstanding payable per vendor (posted invoices: total − paid) → Map(vendorId → amount). */
export async function vendorOutstanding(db: Executor, vendorIds?: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (vendorIds && !vendorIds.length) return out;
  const rows = await db
    .select({ vendorId: purchaseInvoices.vendorId, amt: sql<number>`coalesce(sum(${purchaseInvoices.total} - ${purchaseInvoices.paidAmount}),0)`.mapWith(Number) })
    .from(purchaseInvoices)
    .where(and(eq(purchaseInvoices.status, "posted"), vendorIds ? inArray(purchaseInvoices.vendorId, vendorIds) : undefined))
    .groupBy(purchaseInvoices.vendorId);
  for (const r of rows) out.set(r.vendorId, round2(Math.max(0, Number(r.amt))));
  return out;
}

/**
 * Record a payment to a vendor against a posted invoice (payments.direction = 'out') and bump paidAmount.
 * Rejects overpayment beyond outstanding (+₹0.50 rounding tolerance).
 */
export async function recordPurchasePayment(
  db: DB,
  input: { invoiceId: number; amount: number; date: string; mode: string; reference?: string | null; notes?: string | null },
  userId: number | null,
): Promise<{ paymentId: number; outstanding: number }> {
  return db.transaction(async (tx) => {
    const [inv] = await tx.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, input.invoiceId)).for("update");
    if (!inv) throw new PurchaseError("Invoice not found");
    if (inv.status !== "posted") throw new PurchaseError("Payments can only be recorded against posted invoices");
    const outstanding = purchaseOutstanding(inv);
    if (input.amount <= 0) throw new PurchaseError("Amount must be greater than zero");
    if (input.amount > outstanding + 0.5) throw new PurchaseError(`Amount exceeds outstanding (₹${outstanding.toFixed(2)})`);
    const [p] = await tx.insert(payments).values({
      direction: "out", vendorId: inv.vendorId, purchaseInvoiceId: inv.id, amount: round2(input.amount), date: input.date,
      mode: input.mode, reference: input.reference || null, notes: input.notes || null, createdBy: userId,
    }).returning({ id: payments.id });
    const paid = round2(Number(inv.paidAmount) + input.amount);
    await tx.update(purchaseInvoices).set({ paidAmount: paid }).where(eq(purchaseInvoices.id, inv.id));
    return { paymentId: p.id, outstanding: round2(Math.max(0, Number(inv.total) - paid)) };
  });
}

/** True when another invoice from the same vendor already uses this invoice number. */
export async function duplicateInvoiceNo(db: Executor, vendorId: number, invoiceNo: string, exceptId?: number): Promise<boolean> {
  const rows = await db.select({ id: purchaseInvoices.id }).from(purchaseInvoices)
    .where(and(eq(purchaseInvoices.vendorId, vendorId), sql`lower(${purchaseInvoices.invoiceNo}) = lower(${invoiceNo})`, exceptId ? ne(purchaseInvoices.id, exceptId) : undefined));
  return rows.length > 0;
}
