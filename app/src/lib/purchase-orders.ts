/**
 * Vendor purchase orders (CONVENTIONS rule 16). Maintainer: Sirah Digital.
 *
 * - A PO can be raised against a customer's sales order: its lines carry `salesOrderLineId`, and sending the PO marks
 *   those SO lines `ordered` (when they were `pending`).
 * - A purchase invoice can be raised from a PO (lines carry `poLineId`). When that invoice is POSTED,
 *   `applyPoReceipts` (called from postPurchaseInvoice inside the same transaction) adds the qty to
 *   `purchase_order_lines.receivedQty` and moves the PO to `partial` / `received`.
 *
 * The pure helpers at the top have no DB access and are unit-tested.
 */
import "server-only";
import { and, asc, eq, inArray, ne, notInArray, sql } from "drizzle-orm";
import type { DB } from "@/db";
import {
  items, purchaseInvoiceLines, purchaseInvoices, purchaseOrderLines, purchaseOrders, salesOrderLines, salesOrders, settings,
} from "@/db/schema";
import { round2 } from "./format";
import type { Executor } from "./items";

// ---------------------------------------------------------------- statuses
export const PO_STATUSES = ["draft", "sent", "partial", "received", "closed", "cancelled"] as const;
export type PoStatus = (typeof PO_STATUSES)[number];
export const PO_STATUS_LABEL: Record<PoStatus, string> = {
  draft: "Draft", sent: "Sent", partial: "Partly received", received: "Received", closed: "Closed", cancelled: "Cancelled",
};
export const PO_STATUS_TONE: Record<PoStatus, "gray" | "blue" | "amber" | "green" | "red" | "violet"> = {
  draft: "gray", sent: "blue", partial: "amber", received: "green", closed: "violet", cancelled: "red",
};
export const isPoStatus = (s: unknown): s is PoStatus => typeof s === "string" && (PO_STATUSES as readonly string[]).includes(s);
/** POs that goods can still be received (billed) against. */
export const RECEIVABLE_PO_STATUSES: readonly PoStatus[] = ["sent", "partial"];
/** POs that are "live" for the SO line they were bought for. */
export const ACTIVE_PO_STATUSES: readonly PoStatus[] = ["draft", "sent", "partial", "received"];

const EPS = 1e-6;

// ---------------------------------------------------------------- pure helpers
export type PoQtyLine = { qty: number; receivedQty: number };

/**
 * Rule 16: status after receipts. Draft, closed and cancelled POs keep their status (receipts are still recorded).
 * All quantified lines fully received → received; anything received → partial; nothing → sent.
 */
export function computePoStatus(current: string, lines: readonly PoQtyLine[]): PoStatus {
  if (current === "draft" || current === "closed" || current === "cancelled") return current;
  const active = lines.filter((l) => Number(l.qty) > 0);
  if (active.length && active.every((l) => Number(l.receivedQty) >= Number(l.qty) - EPS)) return "received";
  if (active.some((l) => Number(l.receivedQty) > EPS)) return "partial";
  return "sent";
}

/** % of ordered quantity received (over-receipts count as 100% for that line). */
export function poReceivedPct(lines: readonly PoQtyLine[]): number {
  let ordered = 0, received = 0;
  for (const l of lines) {
    const q = Math.max(0, Number(l.qty) || 0);
    ordered += q;
    received += Math.min(q, Math.max(0, Number(l.receivedQty) || 0));
  }
  return ordered > 0 ? Math.round((received / ordered) * 100) : 0;
}

/** Quantity still to be received on a PO line. */
export const pendingReceipt = (l: PoQtyLine) => round2(Math.max(0, Number(l.qty) - Number(l.receivedQty)));

export const poLineAmount = (l: { qty: number; rate: number }) => round2(Number(l.qty) * Number(l.rate));

/** PO totals (pre-tax subtotal, GST, total). Lines with qty ≤ 0 are ignored. */
export function computePoTotals(lines: readonly { qty: number; rate: number; gstRate: number }[]) {
  let subtotal = 0, taxAmount = 0;
  for (const l of lines) {
    if (!(Number(l.qty) > 0)) continue;
    const amt = poLineAmount(l);
    subtotal += amt;
    taxAmount += (amt * (Number(l.gstRate) || 0)) / 100;
  }
  subtotal = round2(subtotal);
  taxAmount = round2(taxAmount);
  return { subtotal, taxAmount, total: round2(subtotal + taxAmount) };
}

/**
 * Quantity of a customer SO line that still needs buying. Cancelled / delivered lines need nothing.
 * Rule 16 prefill is qty − deliveredQty; quantity already on live POs for the line is also covered, so we take
 * the larger of delivered and already-ordered (goods on a PO are usually what gets delivered).
 */
export function soLineToOrder(l: { qty: number; deliveredQty: number; deliveryStatus: string }, alreadyOrdered = 0): number {
  if (l.deliveryStatus === "cancelled" || l.deliveryStatus === "delivered") return 0;
  const covered = Math.max(Number(l.deliveredQty) || 0, Number(alreadyOrdered) || 0);
  return round2(Math.max(0, Number(l.qty) - covered));
}

/** Default rate for a PO / bill line: this vendor's last rate (vendor_items), else the item's latest cost. */
export function defaultBuyRate(vendorRate: number | null | undefined, latestCost: number | null | undefined): number {
  const v = Number(vendorRate);
  if (vendorRate != null && Number.isFinite(v) && v > 0) return round2(v);
  const c = Number(latestCost);
  return latestCost != null && Number.isFinite(c) ? round2(c) : 0;
}

export const DEFAULT_PO_TERMS = [
  "Please quote our PO number on your invoice, delivery challan and all correspondence.",
  "Material must match the make, size and specification stated. Test certificates to accompany the supply.",
  "Prices are firm for this order. GST extra as applicable.",
  "Delivery to our store at Hosur unless a site address is given above.",
  "Payment as per agreed credit terms from the date of receipt of material and a correct invoice.",
].join("\n");

/** PO terms: settings company.poTerms when set, else the defaults above. */
export async function getPoTerms(db: Executor): Promise<string> {
  try {
    const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, "company"));
    const v = row?.value && typeof row.value === "object" ? (row.value as Record<string, unknown>).poTerms : null;
    return typeof v === "string" && v.trim() ? v : DEFAULT_PO_TERMS;
  } catch {
    return DEFAULT_PO_TERMS;
  }
}

// ---------------------------------------------------------------- receipts (called while posting a purchase invoice)
export type PoReceiptResult = { poId: number; status: PoStatus; changed: boolean };

/**
 * Rule 16: add posted invoice quantities to their PO lines and recompute each touched PO's status.
 * Must run inside the posting transaction (`tx`). Lines without poLineId are ignored. Unknown PO lines are ignored
 * (the invoice still posts; the link is validated when the bill is saved).
 */
export async function applyPoReceipts(tx: Executor, lines: readonly { poLineId: number | null; qty: number }[]): Promise<PoReceiptResult[]> {
  const byLine = new Map<number, number>();
  for (const l of lines) {
    if (l.poLineId == null || !(Number(l.qty) > 0)) continue;
    byLine.set(l.poLineId, round2((byLine.get(l.poLineId) ?? 0) + Number(l.qty)));
  }
  if (!byLine.size) return [];
  const poIds = new Set<number>();
  for (const [poLineId, q] of byLine) {
    const r = await tx.update(purchaseOrderLines)
      .set({ receivedQty: sql`${purchaseOrderLines.receivedQty} + ${q}` })
      .where(eq(purchaseOrderLines.id, poLineId))
      .returning({ poId: purchaseOrderLines.poId });
    if (r[0]) poIds.add(r[0].poId);
  }
  return recomputePoStatuses(tx, [...poIds]);
}

/** Recompute and store the status of the given POs from their lines. */
export async function recomputePoStatuses(tx: Executor, poIds: number[]): Promise<PoReceiptResult[]> {
  if (!poIds.length) return [];
  const [pos, ls] = await Promise.all([
    tx.select({ id: purchaseOrders.id, status: purchaseOrders.status }).from(purchaseOrders).where(inArray(purchaseOrders.id, poIds)),
    tx.select({ poId: purchaseOrderLines.poId, qty: purchaseOrderLines.qty, receivedQty: purchaseOrderLines.receivedQty })
      .from(purchaseOrderLines).where(inArray(purchaseOrderLines.poId, poIds)),
  ]);
  const out: PoReceiptResult[] = [];
  for (const po of pos) {
    const next = computePoStatus(po.status, ls.filter((l) => l.poId === po.id));
    const changed = next !== po.status;
    if (changed) await tx.update(purchaseOrders).set({ status: next }).where(eq(purchaseOrders.id, po.id));
    out.push({ poId: po.id, status: next, changed });
  }
  return out;
}

// ---------------------------------------------------------------- sales order links
/** Sending a PO marks its SO lines `ordered` when they were still `pending` (rule 16). Returns lines updated. */
export async function markSoLinesOrdered(tx: Executor, poId: number): Promise<number> {
  const ls = await tx.select({ sol: purchaseOrderLines.salesOrderLineId }).from(purchaseOrderLines).where(eq(purchaseOrderLines.poId, poId));
  const ids = [...new Set(ls.map((l) => l.sol).filter((x): x is number => x != null))];
  if (!ids.length) return 0;
  const r = await tx.update(salesOrderLines).set({ deliveryStatus: "ordered" })
    .where(and(inArray(salesOrderLines.id, ids), eq(salesOrderLines.deliveryStatus, "pending"))).returning({ id: salesOrderLines.id });
  return r.length;
}

/** Cancelling a PO puts its SO lines back to `pending` when they were `ordered` and no other live PO covers them. */
export async function revertSoLinesOrdered(tx: Executor, poId: number): Promise<number> {
  const ls = await tx.select({ sol: purchaseOrderLines.salesOrderLineId }).from(purchaseOrderLines).where(eq(purchaseOrderLines.poId, poId));
  const ids = [...new Set(ls.map((l) => l.sol).filter((x): x is number => x != null))];
  if (!ids.length) return 0;
  const other = await tx.select({ sol: purchaseOrderLines.salesOrderLineId }).from(purchaseOrderLines)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderLines.poId))
    .where(and(inArray(purchaseOrderLines.salesOrderLineId, ids), ne(purchaseOrders.id, poId), inArray(purchaseOrders.status, ["sent", "partial", "received"])));
  const stillCovered = new Set(other.map((o) => o.sol));
  const revert = ids.filter((i) => !stillCovered.has(i));
  if (!revert.length) return 0;
  const r = await tx.update(salesOrderLines).set({ deliveryStatus: "pending" })
    .where(and(inArray(salesOrderLines.id, revert), eq(salesOrderLines.deliveryStatus, "ordered"))).returning({ id: salesOrderLines.id });
  return r.length;
}

/** Qty already on live POs per SO line (optionally excluding one PO, e.g. the one being edited). */
export async function orderedQtyBySoLine(db: Executor, soLineIds: number[], exceptPoId?: number): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (!soLineIds.length) return out;
  const rows = await db.select({ sol: purchaseOrderLines.salesOrderLineId, qty: sql<number>`coalesce(sum(${purchaseOrderLines.qty}),0)`.mapWith(Number) })
    .from(purchaseOrderLines).innerJoin(purchaseOrders, eq(purchaseOrders.id, purchaseOrderLines.poId))
    .where(and(inArray(purchaseOrderLines.salesOrderLineId, soLineIds), inArray(purchaseOrders.status, [...ACTIVE_PO_STATUSES]),
      exceptPoId ? ne(purchaseOrders.id, exceptPoId) : undefined))
    .groupBy(purchaseOrderLines.salesOrderLineId);
  for (const r of rows) if (r.sol != null) out.set(r.sol, Number(r.qty));
  return out;
}

export type SoPrefillLine = {
  salesOrderLineId: number; itemId: number; description: string; soQty: number; deliveredQty: number; alreadyOrdered: number;
  toOrder: number; uom: string; gstRate: number;
};

/** Pending lines of a sales order for a new PO (?salesOrderId=). Lines without an item master link can't be bought on a PO. */
export async function soPrefill(db: DB, salesOrderId: number) {
  const [so] = await db.select().from(salesOrders).where(eq(salesOrders.id, salesOrderId));
  if (!so) return null;
  const ls = await db.select({ l: salesOrderLines, gstRate: items.gstRate, itemUom: items.uom })
    .from(salesOrderLines).leftJoin(items, eq(items.id, salesOrderLines.itemId))
    .where(and(eq(salesOrderLines.orderId, salesOrderId), notInArray(salesOrderLines.deliveryStatus, ["cancelled", "delivered"])))
    .orderBy(asc(salesOrderLines.sortOrder), asc(salesOrderLines.id));
  const ordered = await orderedQtyBySoLine(db, ls.map((x) => x.l.id));
  const lines: SoPrefillLine[] = [];
  let noItem = 0, covered = 0;
  for (const { l, gstRate, itemUom } of ls) {
    if (l.itemId == null) { noItem++; continue; }
    const already = ordered.get(l.id) ?? 0;
    const toOrder = soLineToOrder(l, already);
    if (toOrder <= 0) { covered++; continue; }
    lines.push({
      salesOrderLineId: l.id, itemId: l.itemId, description: l.description, soQty: l.qty, deliveredQty: l.deliveredQty, alreadyOrdered: already,
      toOrder, uom: itemUom ?? l.uom, gstRate: gstRate ?? 18,
    });
  }
  return { so, lines, noItem, covered };
}

export type InvoicePrefillLine = { poLineId: number; itemId: number; description: string; qty: number; rate: number; gstRate: number; ordered: number; received: number; onDrafts: number };

/**
 * Lines for a new purchase invoice raised from a PO (/purchases/new?po=): qty = qty − receivedQty, less what is already
 * on other draft bills for the same PO line (so two drafts don't double count).
 */
export async function invoicePrefillFromPo(db: DB, poId: number) {
  const [po] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, poId));
  if (!po) return null;
  const ls = await db.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.poId, poId)).orderBy(asc(purchaseOrderLines.sortOrder), asc(purchaseOrderLines.id));
  const drafts = ls.length ? await db.select({ poLineId: purchaseInvoiceLines.poLineId, qty: sql<number>`coalesce(sum(${purchaseInvoiceLines.qty}),0)`.mapWith(Number) })
    .from(purchaseInvoiceLines).innerJoin(purchaseInvoices, eq(purchaseInvoices.id, purchaseInvoiceLines.invoiceId))
    .where(and(inArray(purchaseInvoiceLines.poLineId, ls.map((l) => l.id)), eq(purchaseInvoices.status, "draft")))
    .groupBy(purchaseInvoiceLines.poLineId) : [];
  const onDraft = new Map(drafts.map((d) => [d.poLineId, Number(d.qty)]));
  const lines: InvoicePrefillLine[] = [];
  for (const l of ls) {
    const d = onDraft.get(l.id) ?? 0;
    const qty = round2(Math.max(0, l.qty - l.receivedQty - d));
    if (qty <= 0) continue;
    lines.push({ poLineId: l.id, itemId: l.itemId, description: l.description ?? "", qty, rate: l.rate, gstRate: l.gstRate, ordered: l.qty, received: l.receivedQty, onDrafts: d });
  }
  return { po, lines, draftBills: drafts.length > 0 };
}
