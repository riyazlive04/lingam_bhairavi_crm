/**
 * Returns domain: customer returns (credit notes, rule 13) and returns to vendor (debit notes, rule 14).
 * Maintainer: Sirah Digital.
 *
 * Pure helpers (returnable qty, totals, GST split, balances) are at the top and are unit tested.
 * The posting / adjustment functions take a transaction handle so callers wrap them in db.transaction.
 */
import "server-only";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import type { DB } from "@/db";
import {
  deliveryLines, items, purchaseInvoiceLines, purchaseInvoices, purchaseReturnLines, purchaseReturns, salesInvoiceLines,
  salesInvoices, salesOrderLines, salesOrders, salesReturnLines, salesReturns, stockMovements,
} from "@/db/schema";
import { round2 } from "./format";
import { nextNumber } from "./sequence";
import { lineStatusFor, recomputeOrderStatus, type DbOrTx, type Tx } from "./orders";

const EPS = 1e-6;
/** Payments and adjustments are considered settled within ₹0.50 (same as rule 6). */
const TOLERANCE = 0.5;

/** Error whose message is safe to show to the user. */
export class ReturnError extends Error {}

export const RETURN_REASONS = {
  damaged: "Damaged",
  excess: "Excess supply",
  wrong_item: "Wrong item",
  quality: "Quality issue",
  other: "Other",
} as const;
export type ReturnReason = keyof typeof RETURN_REASONS;
export const RETURN_REASON_KEYS = Object.keys(RETURN_REASONS) as ReturnReason[];
export const reasonLabel = (r: string | null | undefined) => (r && r in RETURN_REASONS ? RETURN_REASONS[r as ReturnReason] : r || "-");

// ---------------------------------------------------------------- pure helpers

/** Customer side: qty that can still come back = delivered − already returned (never below 0). */
export function returnableQty(deliveredQty: number, returnedQty: number): number {
  return Math.max(0, round2(Number(deliveredQty) - Number(returnedQty)));
}

/** Vendor side: qty that can still go back = billed − already returned, also capped by stock on hand when given. */
export function vendorReturnableQty(billedQty: number, alreadyReturned: number, onHand?: number): number {
  const left = Math.max(0, round2(Number(billedQty) - Number(alreadyReturned)));
  return onHand == null ? left : Math.max(0, Math.min(left, round2(Number(onHand))));
}

export type PricedLine = { qty: number; rate: number; gstRate: number };

/** Line amount = qty × rate; tax per line; totals rounded to paise. Lines with qty 0 are dropped. */
export function returnTotals<T extends PricedLine>(lines: T[]) {
  const priced = lines
    .filter((l) => Number(l.qty) > EPS)
    .map((l) => ({ ...l, rate: round2(l.rate), amount: round2(Number(l.qty) * Number(l.rate)) }));
  const subtotal = round2(priced.reduce((s, l) => s + l.amount, 0));
  const taxAmount = round2(priced.reduce((s, l) => s + (l.amount * Number(l.gstRate)) / 100, 0));
  return { lines: priced, subtotal, taxAmount, total: round2(subtotal + taxAmount) };
}

/** Unadjusted balance of a credit / debit note (or an unallocated advance). */
export const noteBalance = (total: number, adjusted: number) => Math.max(0, round2(Number(total) - Number(adjusted)));

/** Largest amount that may be adjusted: the smaller of the note balance and the bill outstanding. */
export const maxAdjustable = (noteBal: number, billOutstanding: number) => Math.max(0, round2(Math.min(Number(noteBal), Number(billOutstanding))));

/** Same state test as the tax invoice: GSTIN state code first, else the state names. */
export function isIntraState(company: { gstin?: string | null; state?: string | null }, party: { gstin?: string | null; state?: string | null }): boolean {
  const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
  if (company.gstin && party.gstin) return company.gstin.slice(0, 2) === party.gstin.slice(0, 2);
  return norm(party.state || "Tamil Nadu") === norm(company.state || "Tamil Nadu");
}

/** GST summary by rate, with CGST/SGST halves (intra state) or IGST. */
export function gstSummary(lines: { amount: number; gstRate: number }[], intra: boolean) {
  const byRate = new Map<number, { taxable: number; tax: number }>();
  for (const l of lines) {
    const r = Number(l.gstRate), cur = byRate.get(r) ?? { taxable: 0, tax: 0 };
    cur.taxable = round2(cur.taxable + Number(l.amount));
    cur.tax = round2(cur.tax + (Number(l.amount) * r) / 100);
    byRate.set(r, cur);
  }
  return [...byRate.entries()].sort((a, b) => a[0] - b[0]).map(([rate, v]) => {
    const cgst = intra ? round2(v.tax / 2) : 0;
    return { rate, taxable: v.taxable, tax: v.tax, cgst, sgst: intra ? round2(v.tax - cgst) : 0, igst: intra ? 0 : v.tax };
  });
}

/** Weighted average of delivery cost rates (ignores rows without a cost). Null when nothing is known. */
export function weightedCost(rows: { qty: number; costRate: number }[]): number | null {
  const valid = rows.filter((r) => Number(r.costRate) > 0 && Number(r.qty) > 0);
  const q = valid.reduce((s, r) => s + Number(r.qty), 0);
  if (q <= EPS) return null;
  return round2(valid.reduce((s, r) => s + Number(r.qty) * Number(r.costRate), 0) / q);
}

/** Latest cost of an item (rule 1). */
export const latestCostOf = (it: { lastPurchaseRate: number | null; listPrice: number | null } | undefined) =>
  round2(Number(it?.lastPurchaseRate ?? it?.listPrice ?? 0));

// ---------------------------------------------------------------- returnable lines (customer)

export type ReturnableLine = {
  /** stable key for the form (order line id, or "i<invoiceLineId>") */
  key: string;
  orderLineId: number | null;
  itemId: number | null;
  description: string;
  uom: string;
  deliveredQty: number;
  returnedQty: number;
  returnable: number;
  rate: number;
  gstRate: number;
  info: string;
};

/** Delivered lines of an order with returnable qty (delivered − returned). Rate = order line rate. */
export async function returnableOrderLines(db: DbOrTx, orderId: number): Promise<ReturnableLine[]> {
  const rows = await db
    .select({ l: salesOrderLines, gst: items.gstRate })
    .from(salesOrderLines)
    .leftJoin(items, eq(items.id, salesOrderLines.itemId))
    .where(eq(salesOrderLines.orderId, orderId))
    .orderBy(asc(salesOrderLines.sortOrder), asc(salesOrderLines.id));
  // GST from the latest invoice line for that order line, else the item master
  const invGst = rows.length
    ? await db.select({ olId: salesInvoiceLines.orderLineId, gst: salesInvoiceLines.gstRate }).from(salesInvoiceLines)
      .innerJoin(salesInvoices, eq(salesInvoices.id, salesInvoiceLines.invoiceId))
      .where(and(inArray(salesInvoiceLines.orderLineId, rows.map((r) => r.l.id)), ne(salesInvoices.status, "cancelled")))
    : [];
  const gstByLine = new Map(invGst.map((g) => [g.olId, Number(g.gst)]));
  return rows
    .filter((r) => Number(r.l.deliveredQty) > EPS)
    .map(({ l, gst }) => ({
      key: String(l.id), orderLineId: l.id, itemId: l.itemId, description: l.description, uom: l.uom,
      deliveredQty: Number(l.deliveredQty), returnedQty: Number(l.returnedQty), returnable: returnableQty(l.deliveredQty, l.returnedQty),
      rate: Number(l.rate), gstRate: gstByLine.get(l.id) ?? Number(gst ?? 18),
      info: `Delivered ${Number(l.deliveredQty)} · returned ${Number(l.returnedQty)} ${l.uom}`,
    }));
}

/**
 * Lines of an invoice that can come back. Order-linked lines: min(invoice qty, delivered − returned).
 * Lines without an order line: invoice qty − qty already returned against this invoice for the same item / description.
 */
export async function returnableInvoiceLines(db: DbOrTx, invoiceId: number): Promise<ReturnableLine[]> {
  const rows = await db
    .select({ il: salesInvoiceLines, ol: salesOrderLines, uom: items.uom })
    .from(salesInvoiceLines)
    .leftJoin(salesOrderLines, eq(salesOrderLines.id, salesInvoiceLines.orderLineId))
    .leftJoin(items, eq(items.id, salesInvoiceLines.itemId))
    .where(eq(salesInvoiceLines.invoiceId, invoiceId))
    .orderBy(asc(salesInvoiceLines.id));
  const prior = await db
    .select({ orderLineId: salesReturnLines.orderLineId, itemId: salesReturnLines.itemId, description: salesReturnLines.description, qty: salesReturnLines.qty })
    .from(salesReturnLines)
    .innerJoin(salesReturns, eq(salesReturns.id, salesReturnLines.returnId))
    .where(and(eq(salesReturns.salesInvoiceId, invoiceId), eq(salesReturns.status, "posted")));
  const out: ReturnableLine[] = [];
  for (const { il, ol, uom } of rows) {
    const invQty = Number(il.qty);
    const backHere = prior
      .filter((p) => (il.orderLineId ? p.orderLineId === il.orderLineId : p.orderLineId == null && p.itemId === il.itemId && p.description === il.description))
      .reduce((s, p) => s + Number(p.qty), 0);
    const leftOnInvoice = Math.max(0, round2(invQty - backHere));
    const returnable = ol ? Math.min(leftOnInvoice, returnableQty(ol.deliveredQty, ol.returnedQty)) : leftOnInvoice;
    out.push({
      key: ol ? String(ol.id) : `i${il.id}`, orderLineId: ol?.id ?? null, itemId: il.itemId, description: il.description,
      uom: ol?.uom ?? uom ?? "Nos", deliveredQty: ol ? Number(ol.deliveredQty) : invQty, returnedQty: ol ? Number(ol.returnedQty) : round2(backHere),
      returnable: round2(returnable), rate: Number(il.rate), gstRate: Number(il.gstRate),
      info: ol ? `Invoiced ${invQty} · delivered ${Number(ol.deliveredQty)} · returned ${Number(ol.returnedQty)} ${ol.uom}` : `Invoiced ${invQty}${backHere ? ` · returned ${round2(backHere)}` : ""}`,
    });
  }
  return out;
}

// ---------------------------------------------------------------- posting: customer return (rule 13)

export type PostedReturn = { number: string; restockedLines: number; orderIds: number[]; total: number };

/** Draft credit note number placeholder (the real number is given on posting so posted numbers have no gaps). */
export const draftNumber = (kind: "CN" | "DN", id: number) => `DRAFT-${kind}-${id}`;

/**
 * Rule 13. Posts a draft customer return exactly once (inside the caller's transaction):
 * returnedQty += qty (capped at delivered − returned), line status from net delivered, a remark on the line,
 * a 'sales_return' stock movement for restocked lines (rate = delivery cost, else latest cost), and the CN number.
 */
export async function postSalesReturn(tx: Tx, returnId: number, userId: number | null): Promise<PostedReturn> {
  const [r] = await tx.select().from(salesReturns).where(eq(salesReturns.id, returnId)).for("update");
  if (!r) throw new ReturnError("Credit note not found");
  if (r.status !== "draft") throw new ReturnError(`This credit note is already ${r.status}`);
  const lines = await tx.select().from(salesReturnLines).where(eq(salesReturnLines.returnId, returnId)).orderBy(asc(salesReturnLines.id));
  if (!lines.length) throw new ReturnError("Add at least one line before posting");

  // order lines involved (locked), and validation of quantities
  const olIds = [...new Set(lines.map((l) => l.orderLineId).filter((v): v is number => v != null))];
  const ols = olIds.length ? await tx.select().from(salesOrderLines).where(inArray(salesOrderLines.id, olIds)).for("update") : [];
  const olMap = new Map(ols.map((l) => [l.id, l]));
  const perLine = new Map<number, number>();
  for (const l of lines) {
    if (l.orderLineId == null) continue;
    const ol = olMap.get(l.orderLineId);
    if (!ol) throw new ReturnError(`"${l.description.slice(0, 60)}" is no longer on the order`);
    if (r.orderId && ol.orderId !== r.orderId) throw new ReturnError("A line does not belong to this order");
    perLine.set(ol.id, round2((perLine.get(ol.id) ?? 0) + Number(l.qty)));
  }
  for (const [olId, q] of perLine) {
    const ol = olMap.get(olId)!;
    const can = returnableQty(ol.deliveredQty, ol.returnedQty);
    if (q > can + EPS) throw new ReturnError(`"${ol.description.slice(0, 60)}": only ${can} ${ol.uom} can be returned (entered ${q})`);
  }
  // invoice-only lines: cannot exceed what is left on the invoice
  if (r.salesInvoiceId && lines.some((l) => l.orderLineId == null)) {
    const avail = await returnableInvoiceLines(tx, r.salesInvoiceId);
    for (const l of lines.filter((x) => x.orderLineId == null)) {
      const a = avail.find((x) => x.orderLineId == null && x.itemId === l.itemId && x.description === l.description);
      if (!a) throw new ReturnError(`"${l.description.slice(0, 60)}" is not on the referenced invoice`);
      if (Number(l.qty) > a.returnable + EPS) throw new ReturnError(`"${l.description.slice(0, 60)}": only ${a.returnable} can be returned (entered ${l.qty})`);
    }
  }

  // cost rates: delivery cost of the order line (rule 12), else latest cost (rule 1)
  const dl = olIds.length
    ? await tx.select({ olId: deliveryLines.orderLineId, qty: deliveryLines.qty, costRate: deliveryLines.costRate }).from(deliveryLines).where(inArray(deliveryLines.orderLineId, olIds))
    : [];
  const itemIds = [...new Set(lines.map((l) => l.itemId).filter((v): v is number => v != null))];
  const its = itemIds.length ? await tx.select({ id: items.id, lastPurchaseRate: items.lastPurchaseRate, listPrice: items.listPrice }).from(items).where(inArray(items.id, itemIds)) : [];
  const itMap = new Map(its.map((i) => [i.id, i]));

  const number = await nextNumber(tx as unknown as DB, "sales_return", r.date);
  const done = await tx.update(salesReturns).set({ status: "posted", number })
    .where(and(eq(salesReturns.id, returnId), eq(salesReturns.status, "draft"))).returning({ id: salesReturns.id });
  if (!done.length) throw new ReturnError("This credit note was posted by someone else just now");

  let restocked = 0;
  for (const l of lines) {
    const delivered = l.orderLineId ? weightedCost(dl.filter((d) => d.olId === l.orderLineId).map((d) => ({ qty: Number(d.qty), costRate: Number(d.costRate) }))) : null;
    const costRate = delivered ?? (l.itemId ? latestCostOf(itMap.get(l.itemId)) : 0);
    if (costRate !== Number(l.costRate)) await tx.update(salesReturnLines).set({ costRate }).where(eq(salesReturnLines.id, l.id));
    if (l.restock && l.itemId) {
      await tx.insert(stockMovements).values({
        itemId: l.itemId, qty: Number(l.qty), type: "sales_return", rate: costRate, projectId: r.projectId ?? null,
        refType: "sales_return", refId: r.id, date: r.date, notes: `Customer return ${number}`, createdBy: userId,
      });
      restocked++;
    }
  }
  const reason = reasonLabel(r.reason).toLowerCase();
  for (const [olId, q] of perLine) {
    const ol = olMap.get(olId)!;
    const returned = round2(Number(ol.returnedQty) + q);
    const net = round2(Number(ol.deliveredQty) - returned);
    const status = lineStatusFor(Number(ol.qty), net, ol.deliveryStatus);
    const note = `Returned ${q} ${ol.uom} on ${number} (${reason})${status !== "delivered" && status !== "cancelled" ? ". Replacement pending" : ""}.`;
    const remarks = (ol.remarks ? `${ol.remarks} ${note}` : note).slice(0, 1000);
    await tx.update(salesOrderLines).set({ returnedQty: returned, deliveryStatus: status, remarks }).where(eq(salesOrderLines.id, olId));
  }
  const orderIds = [...new Set(ols.map((o) => o.orderId))];
  for (const oid of orderIds) await recomputeOrderStatus(tx, oid);
  return { number, restockedLines: restocked, orderIds, total: Number(r.total) };
}

/** Adjust a posted credit note against one of the same customer's open invoices (rule 13). */
export async function adjustCreditNote(tx: Tx, returnId: number, invoiceId: number, amount: number) {
  const amt = round2(amount);
  if (!(amt > 0)) throw new ReturnError("Amount must be greater than 0");
  const [r] = await tx.select().from(salesReturns).where(eq(salesReturns.id, returnId)).for("update");
  if (!r) throw new ReturnError("Credit note not found");
  if (r.status !== "posted") throw new ReturnError("Post the credit note before adjusting it");
  const [inv] = await tx.select().from(salesInvoices).where(eq(salesInvoices.id, invoiceId)).for("update");
  if (!inv) throw new ReturnError("Invoice not found");
  if (inv.customerId !== r.customerId) throw new ReturnError("That invoice belongs to a different customer");
  if (inv.status !== "issued" && inv.status !== "partially_paid") throw new ReturnError(`Invoice ${inv.number} is ${inv.status.replace("_", " ")}`);
  const bal = noteBalance(r.total, r.adjustedAmount);
  const due = noteBalance(inv.total, inv.paidAmount);
  const max = maxAdjustable(bal, due);
  if (max <= 0) throw new ReturnError(bal <= 0 ? "This credit note is fully adjusted" : "Nothing is outstanding on that invoice");
  if (amt > max + 0.005) throw new ReturnError(`You can adjust at most ${max.toFixed(2)} (credit balance ${bal.toFixed(2)}, invoice outstanding ${due.toFixed(2)})`);
  const paid = round2(Number(inv.paidAmount) + amt);
  const status = paid >= Number(inv.total) - TOLERANCE ? "paid" : paid > 0 ? "partially_paid" : "issued";
  await tx.update(salesReturns).set({ adjustedAmount: round2(Number(r.adjustedAmount) + amt) }).where(eq(salesReturns.id, returnId));
  await tx.update(salesInvoices).set({ paidAmount: paid, status }).where(eq(salesInvoices.id, invoiceId));
  return { returnNumber: r.number, invoiceNumber: inv.number, invoiceStatus: status, amount: amt, orderId: inv.orderId };
}

// ---------------------------------------------------------------- returnable lines (vendor)

export type VendorReturnableLine = {
  key: string;
  purchaseInvoiceLineId: number;
  itemId: number;
  description: string;
  uom: string;
  billedQty: number;
  returnedQty: number;
  onHand: number;
  returnable: number;
  rate: number;
  gstRate: number;
  info: string;
};

/** Lines of a purchase invoice that can go back: billed − already returned (posted debit notes), capped by stock on hand. */
export async function returnablePurchaseLines(db: DbOrTx, purchaseInvoiceId: number): Promise<VendorReturnableLine[]> {
  const rows = await db
    .select({ l: purchaseInvoiceLines, name: items.name, uom: items.uom })
    .from(purchaseInvoiceLines)
    .innerJoin(items, eq(items.id, purchaseInvoiceLines.itemId))
    .where(eq(purchaseInvoiceLines.invoiceId, purchaseInvoiceId))
    .orderBy(asc(purchaseInvoiceLines.id));
  if (!rows.length) return [];
  const prior = await db
    .select({ lineId: purchaseReturnLines.purchaseInvoiceLineId, q: sql<number>`coalesce(sum(${purchaseReturnLines.qty}),0)`.mapWith(Number) })
    .from(purchaseReturnLines)
    .innerJoin(purchaseReturns, eq(purchaseReturns.id, purchaseReturnLines.returnId))
    .where(and(eq(purchaseReturns.purchaseInvoiceId, purchaseInvoiceId), eq(purchaseReturns.status, "posted")))
    .groupBy(purchaseReturnLines.purchaseInvoiceLineId);
  const back = new Map(prior.map((p) => [p.lineId, Number(p.q)]));
  const stock = await stockByItem(db, [...new Set(rows.map((r) => r.l.itemId))]);
  return rows.map(({ l, name, uom }) => {
    const returned = back.get(l.id) ?? 0, onHand = stock.get(l.itemId) ?? 0;
    return {
      key: String(l.id), purchaseInvoiceLineId: l.id, itemId: l.itemId, description: l.description || name, uom,
      billedQty: Number(l.qty), returnedQty: returned, onHand, returnable: vendorReturnableQty(l.qty, returned, onHand),
      rate: Number(l.rate), gstRate: Number(l.gstRate),
      info: `Billed ${Number(l.qty)} · returned ${returned} · in stock ${round2(onHand)} ${uom}`,
    };
  });
}

async function stockByItem(db: DbOrTx, itemIds: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (!itemIds.length) return out;
  const rows = await db
    .select({ itemId: stockMovements.itemId, q: sql<number>`coalesce(sum(${stockMovements.qty}),0)`.mapWith(Number) })
    .from(stockMovements).where(inArray(stockMovements.itemId, itemIds)).groupBy(stockMovements.itemId);
  for (const r of rows) out.set(r.itemId, Number(r.q));
  return out;
}

// ---------------------------------------------------------------- posting: vendor return (rule 14)

/** Rule 14. Posts a draft debit note once: 'purchase_return' stock out (never below zero) and the DN number. */
export async function postPurchaseReturn(tx: Tx, returnId: number, userId: number | null) {
  const [r] = await tx.select().from(purchaseReturns).where(eq(purchaseReturns.id, returnId)).for("update");
  if (!r) throw new ReturnError("Debit note not found");
  if (r.status !== "draft") throw new ReturnError(`This debit note is already ${r.status}`);
  const lines = await tx.select().from(purchaseReturnLines).where(eq(purchaseReturnLines.returnId, returnId));
  if (!lines.length) throw new ReturnError("Add at least one line before posting");
  if (r.purchaseInvoiceId) {
    const avail = await returnablePurchaseLines(tx, r.purchaseInvoiceId);
    const per = new Map<number, number>();
    for (const l of lines) {
      if (l.purchaseInvoiceLineId == null) continue;
      per.set(l.purchaseInvoiceLineId, round2((per.get(l.purchaseInvoiceLineId) ?? 0) + Number(l.qty)));
    }
    for (const [lineId, q] of per) {
      const a = avail.find((x) => x.purchaseInvoiceLineId === lineId);
      if (!a) throw new ReturnError("A line is not on the referenced purchase invoice");
      const left = vendorReturnableQty(a.billedQty, a.returnedQty);
      if (q > left + EPS) throw new ReturnError(`"${a.description.slice(0, 60)}": only ${left} ${a.uom} left to return on this bill (entered ${q})`);
    }
  }
  // stock cannot go negative (aggregate per item)
  const perItem = new Map<number, number>();
  for (const l of lines) perItem.set(l.itemId, round2((perItem.get(l.itemId) ?? 0) + Number(l.qty)));
  const stock = await stockByItem(tx, [...perItem.keys()]);
  const names = await tx.select({ id: items.id, name: items.name, uom: items.uom }).from(items).where(inArray(items.id, [...perItem.keys()]));
  for (const [itemId, q] of perItem) {
    const have = round2(stock.get(itemId) ?? 0);
    if (q > have + EPS) {
      const it = names.find((n) => n.id === itemId);
      throw new ReturnError(`Not enough stock of "${(it?.name ?? "item").slice(0, 60)}": ${have} ${it?.uom ?? ""} on hand, returning ${q}`);
    }
  }
  const number = await nextNumber(tx as unknown as DB, "purchase_return", r.date);
  const done = await tx.update(purchaseReturns).set({ status: "posted", number })
    .where(and(eq(purchaseReturns.id, returnId), eq(purchaseReturns.status, "draft"))).returning({ id: purchaseReturns.id });
  if (!done.length) throw new ReturnError("This debit note was posted by someone else just now");
  for (const l of lines) {
    await tx.insert(stockMovements).values({
      itemId: l.itemId, qty: -Number(l.qty), type: "purchase_return", rate: Number(l.rate), refType: "purchase_return", refId: r.id,
      date: r.date, notes: `Returned to vendor ${number}`, createdBy: userId,
    });
  }
  return { number, lines: lines.length, total: Number(r.total) };
}

/** Adjust a posted debit note against an open (posted, unpaid) bill of the same vendor (rule 14). */
export async function adjustDebitNote(tx: Tx, returnId: number, purchaseInvoiceId: number, amount: number) {
  const amt = round2(amount);
  if (!(amt > 0)) throw new ReturnError("Amount must be greater than 0");
  const [r] = await tx.select().from(purchaseReturns).where(eq(purchaseReturns.id, returnId)).for("update");
  if (!r) throw new ReturnError("Debit note not found");
  if (r.status !== "posted") throw new ReturnError("Post the debit note before adjusting it");
  const [pi] = await tx.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, purchaseInvoiceId)).for("update");
  if (!pi) throw new ReturnError("Vendor bill not found");
  if (pi.vendorId !== r.vendorId) throw new ReturnError("That bill belongs to a different vendor");
  if (pi.status !== "posted") throw new ReturnError(`Bill ${pi.invoiceNo} is ${pi.status}`);
  const bal = noteBalance(r.total, r.adjustedAmount);
  const due = noteBalance(pi.total, pi.paidAmount);
  const max = maxAdjustable(bal, due);
  if (max <= 0) throw new ReturnError(bal <= 0 ? "This debit note is fully adjusted" : "Nothing is payable on that bill");
  if (amt > max + 0.005) throw new ReturnError(`You can adjust at most ${max.toFixed(2)} (debit balance ${bal.toFixed(2)}, bill balance ${due.toFixed(2)})`);
  await tx.update(purchaseReturns).set({ adjustedAmount: round2(Number(r.adjustedAmount) + amt) }).where(eq(purchaseReturns.id, returnId));
  await tx.update(purchaseInvoices).set({ paidAmount: round2(Number(pi.paidAmount) + amt) }).where(eq(purchaseInvoices.id, purchaseInvoiceId));
  return { returnNumber: r.number, invoiceNo: pi.invoiceNo, amount: amt };
}

// ---------------------------------------------------------------- balances used by billing

/** Posted credit notes with an unadjusted balance. */
export async function openCreditNotes(db: Pick<DB, "select">, opts: { customerId?: number } = {}) {
  const rows = await db
    .select({ id: salesReturns.id, number: salesReturns.number, customerId: salesReturns.customerId, date: salesReturns.date, total: salesReturns.total, adjustedAmount: salesReturns.adjustedAmount, projectId: salesReturns.projectId, orderId: salesReturns.orderId })
    .from(salesReturns)
    .where(and(eq(salesReturns.status, "posted"), opts.customerId ? eq(salesReturns.customerId, opts.customerId) : undefined))
    .orderBy(asc(salesReturns.date), asc(salesReturns.id));
  return rows.map((r) => ({ ...r, total: Number(r.total), adjustedAmount: Number(r.adjustedAmount), balance: noteBalance(r.total, r.adjustedAmount) }))
    .filter((r) => r.balance > 0.005);
}

/** Posted debit notes with an unadjusted balance. */
export async function openDebitNotes(db: Pick<DB, "select">, opts: { vendorId?: number } = {}) {
  const rows = await db
    .select({ id: purchaseReturns.id, number: purchaseReturns.number, vendorId: purchaseReturns.vendorId, date: purchaseReturns.date, total: purchaseReturns.total, adjustedAmount: purchaseReturns.adjustedAmount })
    .from(purchaseReturns)
    .where(and(eq(purchaseReturns.status, "posted"), opts.vendorId ? eq(purchaseReturns.vendorId, opts.vendorId) : undefined))
    .orderBy(asc(purchaseReturns.date), asc(purchaseReturns.id));
  return rows.map((r) => ({ ...r, total: Number(r.total), adjustedAmount: Number(r.adjustedAmount), balance: noteBalance(r.total, r.adjustedAmount) }))
    .filter((r) => r.balance > 0.005);
}

/** Qty credited (posted credit notes) per order line, used to free up invoiceable qty for replacements. */
export async function creditedQtyByOrderLine(db: DbOrTx, orderLineIds: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (!orderLineIds.length) return out;
  const rows = await db
    .select({ olId: salesReturnLines.orderLineId, q: sql<number>`coalesce(sum(${salesReturnLines.qty}),0)`.mapWith(Number) })
    .from(salesReturnLines)
    .innerJoin(salesReturns, eq(salesReturns.id, salesReturnLines.returnId))
    .where(and(inArray(salesReturnLines.orderLineId, orderLineIds), eq(salesReturns.status, "posted"), sql`${salesReturnLines.rate} > 0`))
    .groupBy(salesReturnLines.orderLineId);
  for (const r of rows) if (r.olId != null) out.set(r.olId, Number(r.q));
  return out;
}

/** Credit notes of an order (any status), newest first. */
export async function returnsForOrder(db: DbOrTx, orderId: number) {
  return db.select({ id: salesReturns.id, number: salesReturns.number, date: salesReturns.date, reason: salesReturns.reason, total: salesReturns.total, adjustedAmount: salesReturns.adjustedAmount, status: salesReturns.status })
    .from(salesReturns).where(and(eq(salesReturns.orderId, orderId), ne(salesReturns.status, "cancelled")))
    .orderBy(sql`${salesReturns.date} desc`, sql`${salesReturns.id} desc`);
}

/** Order header used by the return form (customer, project). */
export async function orderHeader(db: DbOrTx, orderId: number) {
  const [o] = await db.select({ id: salesOrders.id, number: salesOrders.number, customerId: salesOrders.customerId, projectId: salesOrders.projectId, status: salesOrders.status })
    .from(salesOrders).where(eq(salesOrders.id, orderId));
  return o ?? null;
}
