/**
 * Version 2 demo data: customer returns (credit notes, rule 13), a return to vendor (debit note, rule 14)
 * and customer advances (rule 15). Also backfills delivery_lines.costRate (rule 12) for older deliveries.
 * Maintainer: Sirah Digital.
 *
 * Idempotent: the cost backfill only touches rows still at 0, and the demo documents are created only
 * when sales_returns is empty. Documents are posted through the same lib functions the app uses, so
 * order quantities, stock and invoice balances stay consistent with the seeded orders and invoices.
 */
import { and, asc, count, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import type { DB } from "../index";
import * as s from "../schema";
import { adjustCreditNote, draftNumber, postPurchaseReturn, postSalesReturn, returnTotals } from "../../lib/returns";
import { applyAdvanceToInvoice } from "../../lib/billing";
import { round2, todayIST } from "../../lib/format";
import type { Tx } from "../../lib/orders";

/** Rule 12 backfill: deliveries recorded before version 2 get the item's latest cost (rule 1). Returns rows updated. */
export async function backfillDeliveryCosts(db: DB): Promise<number> {
  const r = await db.execute(sql`
    UPDATE delivery_lines dl SET cost_rate = round(coalesce(i.last_purchase_rate, i.list_price, 0)::numeric, 2)::double precision
    FROM sales_order_lines l JOIN items i ON i.id = l.item_id
    WHERE dl.order_line_id = l.id AND dl.cost_rate = 0 AND coalesce(i.last_purchase_rate, i.list_price, 0) > 0`);
  return Number((r as unknown as { affectedRows?: number; rowCount?: number }).affectedRows ?? (r as unknown as { rowCount?: number }).rowCount ?? 0);
}

type SeedResult = { customerReturns: number; vendorReturns: number; advances: number; costsBackfilled: number };

export async function seedReturnsAndAdvances(db: DB): Promise<SeedResult> {
  const costsBackfilled = await backfillDeliveryCosts(db);
  const [{ n }] = await db.select({ n: count() }).from(s.salesReturns);
  if (Number(n) > 0) return { customerReturns: 0, vendorReturns: 0, advances: 0, costsBackfilled };

  const [admin] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.role, "admin")).limit(1);
  const [acct] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.role, "accounts")).limit(1);
  const userId = acct?.id ?? admin?.id ?? null;
  const today = todayIST();
  const out: SeedResult = { customerReturns: 0, vendorReturns: 0, advances: 0, costsBackfilled };

  // candidate order lines: delivered, linked to an item, on an open invoice of the same order
  const cands = await db
    .select({ ol: s.salesOrderLines, orderId: s.salesOrders.id, customerId: s.salesOrders.customerId, projectId: s.salesOrders.projectId, inv: s.salesInvoices, gst: s.salesInvoiceLines.gstRate })
    .from(s.salesInvoiceLines)
    .innerJoin(s.salesInvoices, eq(s.salesInvoices.id, s.salesInvoiceLines.invoiceId))
    .innerJoin(s.salesOrderLines, eq(s.salesOrderLines.id, s.salesInvoiceLines.orderLineId))
    .innerJoin(s.salesOrders, eq(s.salesOrders.id, s.salesOrderLines.orderId))
    .where(and(
      inArray(s.salesInvoices.status, ["issued", "partially_paid"]),
      gt(s.salesOrderLines.deliveredQty, 1), sql`${s.salesOrderLines.itemId} is not null`, sql`${s.salesOrderLines.returnedQty} = 0`,
      sql`${s.salesInvoices.total} - ${s.salesInvoices.paidAmount} > 1000`,
    ))
    .orderBy(desc(s.salesInvoices.invoiceDate), asc(s.salesOrderLines.id))
    .limit(40);

  async function createSalesReturn(tx: Tx, c: (typeof cands)[number], q: number, reason: string, notes: string, date: string) {
    const t = returnTotals([{ qty: q, rate: Number(c.ol.rate), gstRate: Number(c.gst) }]);
    const [r] = await tx.insert(s.salesReturns).values({
      number: `DRAFT-CN-seed-${c.ol.id}`, customerId: c.customerId, orderId: c.orderId, salesInvoiceId: c.inv.id, projectId: c.projectId,
      date, reason, notes, subtotal: t.subtotal, taxAmount: t.taxAmount, total: t.total, status: "draft", createdBy: userId,
    }).returning({ id: s.salesReturns.id });
    await tx.update(s.salesReturns).set({ number: draftNumber("CN", r.id) }).where(eq(s.salesReturns.id, r.id));
    await tx.insert(s.salesReturnLines).values({
      returnId: r.id, orderLineId: c.ol.id, itemId: c.ol.itemId, description: c.ol.description, qty: q, rate: t.lines[0].rate,
      gstRate: Number(c.gst), amount: t.lines[0].amount, restock: true, costRate: 0,
    });
    return r.id;
  }

  // 1) posted, restocked, damaged; adjusted against its invoice
  const first = cands[0];
  if (first) {
    const q = Math.min(2, Math.floor(Number(first.ol.deliveredQty) / 2)) || 1;
    await db.transaction(async (tx) => {
      const id = await createSalesReturn(tx as Tx, first, q, "damaged", "Damaged in transit, customer sent photos. Units checked and put back in stock after repacking.", today);
      await postSalesReturn(tx as Tx, id, userId);
      const [r] = await tx.select({ total: s.salesReturns.total }).from(s.salesReturns).where(eq(s.salesReturns.id, id));
      const [inv] = await tx.select({ total: s.salesInvoices.total, paid: s.salesInvoices.paidAmount }).from(s.salesInvoices).where(eq(s.salesInvoices.id, first.inv.id));
      const amt = round2(Math.min(Number(r.total), Number(inv.total) - Number(inv.paid)));
      if (amt > 0) await adjustCreditNote(tx as Tx, id, first.inv.id, amt);
    });
    out.customerReturns++;
  }
  // 2) draft, excess supply, different order
  const second = cands.find((c) => first && c.orderId !== first.orderId);
  if (second) {
    await db.transaction(async (tx) => {
      await createSalesReturn(tx as Tx, second, 1, "excess", "Site says one unit extra. Collect on the next trip, then post.", today);
    });
    out.customerReturns++;
  }

  // 3) vendor return: posted bill without project, item with stock on hand
  const bills = await db
    .select({ pi: s.purchaseInvoices, line: s.purchaseInvoiceLines })
    .from(s.purchaseInvoiceLines)
    .innerJoin(s.purchaseInvoices, eq(s.purchaseInvoices.id, s.purchaseInvoiceLines.invoiceId))
    .where(and(eq(s.purchaseInvoices.status, "posted"), isNull(s.purchaseInvoices.projectId), gt(s.purchaseInvoiceLines.qty, 1)))
    .orderBy(desc(s.purchaseInvoices.invoiceDate))
    .limit(50);
  const stock = bills.length
    ? await db.select({ itemId: s.stockMovements.itemId, q: sql<number>`coalesce(sum(${s.stockMovements.qty}),0)`.mapWith(Number) })
      .from(s.stockMovements).where(inArray(s.stockMovements.itemId, [...new Set(bills.map((b) => b.line.itemId))])).groupBy(s.stockMovements.itemId)
    : [];
  const onHand = new Map(stock.map((x) => [x.itemId, Number(x.q)]));
  const bill = bills.find((b) => (onHand.get(b.line.itemId) ?? 0) >= 1);
  if (bill) {
    await db.transaction(async (tx) => {
      const t = returnTotals([{ qty: 1, rate: Number(bill.line.rate), gstRate: Number(bill.line.gstRate) }]);
      const [r] = await tx.insert(s.purchaseReturns).values({
        number: `DRAFT-DN-seed-${bill.line.id}`, vendorId: bill.pi.vendorId, purchaseInvoiceId: bill.pi.id, date: today,
        reason: "Quality issue: unit failed our incoming check. Returned for replacement.", subtotal: t.subtotal, taxAmount: t.taxAmount, total: t.total,
        status: "draft", createdBy: userId,
      }).returning({ id: s.purchaseReturns.id });
      await tx.update(s.purchaseReturns).set({ number: draftNumber("DN", r.id) }).where(eq(s.purchaseReturns.id, r.id));
      await tx.insert(s.purchaseReturnLines).values({
        returnId: r.id, itemId: bill.line.itemId, purchaseInvoiceLineId: bill.line.id, qty: 1, rate: t.lines[0].rate, gstRate: Number(bill.line.gstRate), amount: t.lines[0].amount,
      });
      await postPurchaseReturn(tx as Tx, r.id, userId);
    });
    out.vendorReturns++;
  }

  // 4) advances: one on an open order (unused), one applied in part to an open invoice of another customer
  const openOrders = await db.select().from(s.salesOrders).where(inArray(s.salesOrders.status, ["open", "partial"])).orderBy(desc(s.salesOrders.orderDate)).limit(20);
  const o1 = openOrders.find((o) => o.projectId) ?? openOrders[0];
  if (o1) {
    await db.insert(s.payments).values({
      direction: "in", customerId: o1.customerId, isAdvance: true, orderId: o1.id, projectId: o1.projectId, amount: round2(Math.max(5000, Number(o1.total) * 0.5)),
      date: today, mode: "bank", reference: "NEFT ADV 50%", notes: "50% advance as per quotation terms", allocatedAmount: 0, createdBy: userId,
    });
    out.advances++;
  }
  const openInvs = await db.select().from(s.salesInvoices)
    .where(and(inArray(s.salesInvoices.status, ["issued", "partially_paid"]), sql`${s.salesInvoices.total} - ${s.salesInvoices.paidAmount} > 2000`))
    .orderBy(desc(s.salesInvoices.invoiceDate)).limit(20);
  const inv2 = openInvs.find((i) => !o1 || i.customerId !== o1.customerId) ?? openInvs[0];
  if (inv2) {
    const due = round2(Number(inv2.total) - Number(inv2.paidAmount));
    const amount = round2(Math.max(2000, Math.round(due * 0.8 / 100) * 100));
    await db.transaction(async (tx) => {
      const [p] = await tx.insert(s.payments).values({
        direction: "in", customerId: inv2.customerId, isAdvance: true, orderId: inv2.orderId, projectId: inv2.projectId, amount,
        date: inv2.invoiceDate, mode: "upi", reference: "UPI ADV", notes: "Advance received before billing", allocatedAmount: 0, createdBy: userId,
      }).returning({ id: s.payments.id });
      await applyAdvanceToInvoice(tx as Tx, { paymentId: p.id, invoiceId: inv2.id, amount: round2(Math.min(due, amount) * 0.6), date: today, userId });
    });
    out.advances++;
  }
  return out;
}
