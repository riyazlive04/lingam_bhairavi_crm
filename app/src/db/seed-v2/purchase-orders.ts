/**
 * Version 2 demo data: vendor purchase orders (rule 16) and the quotation cost-date backfill (rule 10).
 * Maintainer: Sirah Digital.
 *
 * Both functions are idempotent and safe on an existing database:
 *  - seedPurchaseOrders returns early when purchase_orders already has rows.
 *  - backfillQuoteCostDates only touches quotation lines whose cost source was never recorded.
 *
 * Goods receipts are made the real way: a draft purchase invoice linked to the PO is posted with
 * postPurchaseInvoice, which updates the PO's received qty, prices, vendor rates and stock in one transaction.
 */
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, notInArray } from "drizzle-orm";
import type { DB } from "../index";
import * as s from "../schema";
import { postPurchaseInvoice } from "../../lib/purchasing";
import { markSoLinesOrdered } from "../../lib/purchase-orders";
import { nextNumber } from "../../lib/sequence";
import { addDays, round2, todayIST } from "../../lib/format";

type ItemRow = typeof s.items.$inferSelect;
type Line = { itemId: number; qty: number; rate: number; gstRate: number; salesOrderLineId?: number | null; description?: string | null };

const costOf = (it: ItemRow) => round2(Number(it.lastPurchaseRate ?? it.listPrice ?? 0) || 100);

/** Creates ~4 demo POs (sent + partly received against a sales order, received, draft, cancelled). */
export async function seedPurchaseOrders(db: DB): Promise<{ created: number }> {
  const [{ n }] = await db.select({ n: count() }).from(s.purchaseOrders);
  if (Number(n) > 0) return { created: 0 };

  const vendors = await db.select().from(s.vendors).where(eq(s.vendors.active, true)).orderBy(asc(s.vendors.id));
  if (!vendors.length) return { created: 0 };
  const [buyer] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.role, "purchase")).limit(1);
  const [admin] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.role, "admin")).limit(1);
  const userId = buyer?.id ?? admin?.id ?? null;
  const vi = await db.select().from(s.vendorItems);
  const vendorRate = (vendorId: number, itemId: number) => vi.find((r) => r.vendorId === vendorId && r.itemId === itemId)?.lastRate ?? null;
  const itemsOfVendor = (vendorId: number) => vi.filter((r) => r.vendorId === vendorId).map((r) => r.itemId);
  const allItems = await db.select().from(s.items).where(eq(s.items.active, true));
  const itemById = new Map(allItems.map((i) => [i.id, i]));
  const today = todayIST();
  const ago = (d: number) => addDays(today, -d);

  async function createPo(o: {
    vendorId: number; poDate: string; expectedDate: string; status: "draft" | "sent" | "cancelled"; lines: Line[];
    salesOrderId?: number | null; projectId?: number | null; notes?: string | null;
  }) {
    const ls = o.lines.filter((l) => l.qty > 0 && itemById.has(l.itemId));
    if (!ls.length) return null;
    const subtotal = round2(ls.reduce((a, l) => a + round2(l.qty * l.rate), 0));
    const taxAmount = round2(ls.reduce((a, l) => a + (round2(l.qty * l.rate) * l.gstRate) / 100, 0));
    const number = await nextNumber(db, "purchase_order", o.poDate);
    const [po] = await db.insert(s.purchaseOrders).values({
      number, vendorId: o.vendorId, salesOrderId: o.salesOrderId ?? null, projectId: o.projectId ?? null, poDate: o.poDate, expectedDate: o.expectedDate,
      status: o.status, subtotal, taxAmount, total: round2(subtotal + taxAmount), notes: o.notes ?? null, createdBy: userId,
    }).returning();
    const lineRows = await db.insert(s.purchaseOrderLines).values(ls.map((l, i) => ({
      poId: po.id, sortOrder: i + 1, itemId: l.itemId, description: l.description ?? null, qty: l.qty, rate: l.rate, gstRate: l.gstRate,
      amount: round2(l.qty * l.rate), salesOrderLineId: l.salesOrderLineId ?? null,
    }))).returning();
    if (o.status === "sent") await markSoLinesOrdered(db, po.id);
    return { po, lines: lineRows };
  }

  /** Raise and post a bill for part (or all) of a PO, exactly as the app does. */
  async function receive(po: typeof s.purchaseOrders.$inferSelect, lines: (typeof s.purchaseOrderLines.$inferSelect)[], qtyOf: (l: typeof s.purchaseOrderLines.$inferSelect) => number, date: string, invoiceNo: string) {
    const take = lines.map((l) => ({ l, q: qtyOf(l) })).filter((x) => x.q > 0);
    if (!take.length) return;
    const subtotal = round2(take.reduce((a, x) => a + round2(x.q * x.l.rate), 0));
    const taxAmount = round2(take.reduce((a, x) => a + (round2(x.q * x.l.rate) * x.l.gstRate) / 100, 0));
    const vendor = vendors.find((v) => v.id === po.vendorId);
    const [inv] = await db.insert(s.purchaseInvoices).values({
      vendorId: po.vendorId, invoiceNo, invoiceDate: date, dueDate: addDays(date, vendor?.paymentTermsDays ?? 30), projectId: po.projectId,
      purchaseOrderId: po.id, subtotal, taxAmount, total: round2(subtotal + taxAmount), status: "draft", createdBy: userId,
      notes: `Against ${po.number}`,
    }).returning({ id: s.purchaseInvoices.id });
    await db.insert(s.purchaseInvoiceLines).values(take.map((x) => ({
      invoiceId: inv.id, itemId: x.l.itemId, qty: x.q, rate: x.l.rate, gstRate: x.l.gstRate, amount: round2(x.q * x.l.rate), poLineId: x.l.id,
    })));
    await postPurchaseInvoice(db, inv.id, userId);
  }

  const used = new Set<number>();
  const pickVendor = (prefer: (v: typeof vendors[number]) => number) => {
    const ranked = vendors.filter((v) => !used.has(v.id)).map((v) => ({ v, score: prefer(v) })).sort((a, b) => b.score - a.score);
    const v = (ranked[0] ?? { v: vendors[0] }).v;
    used.add(v.id);
    return v;
  };
  let created = 0;

  // 1) Sent and partly received, raised against a customer sales order's pending lines.
  const openSo = await db.select({ so: s.salesOrders }).from(s.salesOrders)
    .where(inArray(s.salesOrders.status, ["open", "partial"])).orderBy(desc(s.salesOrders.orderDate), desc(s.salesOrders.id)).limit(20);
  for (const { so } of openSo) {
    const sol = (await db.select().from(s.salesOrderLines)
      .where(and(eq(s.salesOrderLines.orderId, so.id), isNotNull(s.salesOrderLines.itemId), notInArray(s.salesOrderLines.deliveryStatus, ["delivered", "cancelled"])))
      .orderBy(asc(s.salesOrderLines.sortOrder)))
      .filter((l) => l.qty - l.deliveredQty > 0 && itemById.has(l.itemId!))
      .slice(0, 4);
    if (!sol.length) continue;
    const soItems = new Set(sol.map((l) => l.itemId!));
    const v = pickVendor((x) => itemsOfVendor(x.id).filter((i) => soItems.has(i)).length);
    const r = await createPo({
      vendorId: v.id, poDate: ago(10), expectedDate: addDays(today, 5), status: "sent", salesOrderId: so.id, projectId: so.projectId,
      notes: `Material for customer order ${so.number}`,
      lines: sol.map((l) => {
        const it = itemById.get(l.itemId!)!;
        return { itemId: it.id, qty: round2(l.qty - l.deliveredQty), rate: round2(vendorRate(v.id, it.id) ?? costOf(it)), gstRate: it.gstRate, salesOrderLineId: l.id };
      }),
    });
    if (r) {
      created++;
      // first line half delivered, the rest still to come
      await receive(r.po, r.lines, (l) => (l.id === r.lines[0].id ? (r.lines.length > 1 ? Math.max(1, Math.floor(l.qty / 2)) : Math.floor(l.qty / 2)) : 0), ago(3), `${v.name.slice(0, 3).toUpperCase()}/26-27/${4100 + r.po.id}`);
    }
    break;
  }

  // 2) Received in full: stock replenishment from a regular supplier.
  {
    const v = pickVendor((x) => itemsOfVendor(x.id).length);
    const ids = itemsOfVendor(v.id).filter((i) => itemById.has(i)).slice(0, 3);
    const its = (ids.length ? ids : allItems.slice(0, 3).map((i) => i.id)).map((i) => itemById.get(i)!).filter(Boolean);
    const r = await createPo({
      vendorId: v.id, poDate: ago(28), expectedDate: ago(21), status: "sent", notes: "Stock replenishment",
      lines: its.map((it, k) => ({ itemId: it.id, qty: [20, 50, 10][k] ?? 10, rate: round2(vendorRate(v.id, it.id) ?? costOf(it)), gstRate: it.gstRate })),
    });
    if (r) {
      created++;
      await receive(r.po, r.lines, (l) => l.qty, ago(22), `${v.name.slice(0, 3).toUpperCase()}/26-27/${4200 + r.po.id}`);
    }
  }

  // 3) Draft, not yet sent.
  {
    const v = pickVendor((x) => itemsOfVendor(x.id).length);
    const ids = itemsOfVendor(v.id).filter((i) => itemById.has(i)).slice(0, 2);
    const its = (ids.length ? ids : allItems.slice(3, 5).map((i) => i.id)).map((i) => itemById.get(i)!).filter(Boolean);
    const r = await createPo({
      vendorId: v.id, poDate: ago(1), expectedDate: addDays(today, 10), status: "draft", notes: "Rates to be confirmed on call before sending",
      lines: its.map((it, k) => ({ itemId: it.id, qty: [12, 6][k] ?? 6, rate: round2(vendorRate(v.id, it.id) ?? costOf(it)), gstRate: it.gstRate })),
    });
    if (r) created++;
  }

  // 4) Cancelled.
  {
    const v = pickVendor(() => 0);
    const ids = itemsOfVendor(v.id).filter((i) => itemById.has(i)).slice(0, 1);
    const its = (ids.length ? ids : allItems.slice(5, 6).map((i) => i.id)).map((i) => itemById.get(i)!).filter(Boolean);
    const r = await createPo({
      vendorId: v.id, poDate: ago(18), expectedDate: ago(11), status: "cancelled", notes: "Cancelled: vendor could not meet the delivery date",
      lines: its.map((it) => ({ itemId: it.id, qty: 8, rate: round2(vendorRate(v.id, it.id) ?? costOf(it)), gstRate: it.gstRate })),
    });
    if (r) created++;
  }
  return { created };
}

/**
 * Rule 10 backfill for quotation lines saved before cost dates existed. For each item-linked line, the cost date and
 * supplier are taken from the latest purchase on or before the quotation date (price_history), else from the item's
 * last purchase when that is not after the quote date, else the line is marked as a list price. Free-text lines are
 * marked "manual". Only lines with no cost date and no cost source are touched. Returns the number of lines updated.
 */
export async function backfillQuoteCostDates(db: DB): Promise<number> {
  const rows = await db.select({ id: s.quotationLines.id, itemId: s.quotationLines.itemId, quoteDate: s.quotations.quoteDate })
    .from(s.quotationLines).innerJoin(s.quotations, eq(s.quotations.id, s.quotationLines.quotationId))
    .where(and(isNull(s.quotationLines.costDate), isNull(s.quotationLines.costSource)));
  if (!rows.length) return 0;
  const itemIds = [...new Set(rows.map((r) => r.itemId).filter((x): x is number => x != null))];
  const [hist, its] = itemIds.length ? await Promise.all([
    db.select({ itemId: s.priceHistory.itemId, date: s.priceHistory.date, vendorId: s.priceHistory.vendorId }).from(s.priceHistory)
      .where(and(eq(s.priceHistory.kind, "purchase"), inArray(s.priceHistory.itemId, itemIds)))
      .orderBy(asc(s.priceHistory.itemId), desc(s.priceHistory.date), desc(s.priceHistory.id)),
    db.select({ id: s.items.id, rate: s.items.lastPurchaseRate, date: s.items.lastPurchaseDate, vendorId: s.items.lastPurchaseVendorId }).from(s.items).where(inArray(s.items.id, itemIds)),
  ]) : [[], []];
  const histBy = new Map<number, { date: string; vendorId: number | null }[]>();
  for (const h of hist) {
    const arr = histBy.get(h.itemId) ?? [];
    arr.push({ date: h.date, vendorId: h.vendorId });
    histBy.set(h.itemId, arr);
  }
  const itemBy = new Map(its.map((i) => [i.id, i]));

  const groups = new Map<string, { costDate: string | null; costVendorId: number | null; costSource: string; ids: number[] }>();
  for (const r of rows) {
    let costDate: string | null = null, costVendorId: number | null = null, costSource = "manual";
    if (r.itemId != null) {
      const h = (histBy.get(r.itemId) ?? []).find((x) => x.date <= r.quoteDate);
      const it = itemBy.get(r.itemId);
      if (h) { costDate = h.date; costVendorId = h.vendorId; costSource = "purchase"; }
      else if (it?.rate != null && it.date && it.date <= r.quoteDate) { costDate = it.date; costVendorId = it.vendorId; costSource = "purchase"; }
      else costSource = "list";
    }
    const key = `${costDate}|${costVendorId}|${costSource}`;
    const g = groups.get(key) ?? { costDate, costVendorId, costSource, ids: [] };
    g.ids.push(r.id);
    groups.set(key, g);
  }
  let updated = 0;
  for (const g of groups.values()) {
    for (let i = 0; i < g.ids.length; i += 500) {
      const chunk = g.ids.slice(i, i + 500);
      const res = await db.update(s.quotationLines).set({ costDate: g.costDate, costVendorId: g.costVendorId, costSource: g.costSource })
        .where(and(inArray(s.quotationLines.id, chunk), isNull(s.quotationLines.costSource))).returning({ id: s.quotationLines.id });
      updated += res.length;
    }
  }
  return updated;
}
