import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { payments, purchaseReturns, salesOrderLines, salesReturnLines, salesReturns } from "@/db/schema";
import { seedReturnsAndAdvances } from "@/db/seed-v2/returns-advances";
import { customerLedger, customerOutstanding, vendorOutstanding } from "@/lib/billing";
import { ReturnError, postSalesReturn } from "@/lib/returns";
import type { Tx } from "@/lib/orders";
import { freshSeededDb, scalar, type TestDb } from "./helpers";

let t: TestDb;
beforeAll(async () => { t = await freshSeededDb(); });
afterAll(async () => { await t?.close(); });

describe("seedReturnsAndAdvances and posting rules 12 to 15", () => {
  it("backfills delivery costs and creates the demo documents once", async () => {
    // seed() already runs seedReturnsAndAdvances (src/db/seed-v2)
    expect(await scalar(t.client, `SELECT count(*) FROM sales_returns`)).toBe(2);
    expect(await scalar(t.client, `SELECT count(*) FROM purchase_returns`)).toBe(1);
    expect(await scalar(t.client, `SELECT count(*) FROM payments WHERE is_advance`)).toBe(2);
    expect(await scalar(t.client, `SELECT count(*) FROM delivery_lines dl JOIN sales_order_lines l ON l.id = dl.order_line_id
      JOIN items i ON i.id = l.item_id WHERE dl.cost_rate = 0 AND coalesce(i.last_purchase_rate, i.list_price, 0) > 0`)).toBe(0);
    const again = await seedReturnsAndAdvances(t.db);
    expect(again).toMatchObject({ customerReturns: 0, vendorReturns: 0, advances: 0 });
    expect(await scalar(t.client, `SELECT count(*) FROM sales_returns`)).toBe(2);
  });

  it("posted credit note: returnedQty, restock at delivery cost, CN number, adjustment, no double posting", async () => {
    const [cn] = await t.db.select().from(salesReturns).where(eq(salesReturns.status, "posted"));
    expect(cn.number).toMatch(/^LBE\/CN\/\d{4}-\d{2}\/\d{4}$/);
    const [line] = await t.db.select().from(salesReturnLines).where(eq(salesReturnLines.returnId, cn.id));
    const [ol] = await t.db.select().from(salesOrderLines).where(eq(salesOrderLines.id, line.orderLineId!));
    expect(Number(ol.returnedQty)).toBeCloseTo(Number(line.qty), 6);
    expect(ol.deliveryStatus).not.toBe("delivered");
    expect(ol.remarks ?? "").toContain(cn.number);
    expect(Number(line.costRate)).toBeGreaterThan(0);
    expect(await scalar(t.client, "SELECT count(*) FROM stock_movements WHERE type = 'sales_return' AND ref_id = $1 AND qty = $2 AND rate = $3",
      [cn.id, line.qty, line.costRate])).toBe(1);
    expect(Number(cn.adjustedAmount)).toBeGreaterThan(0);
    await expect(t.db.transaction((tx) => postSalesReturn(tx as Tx, cn.id, null))).rejects.toBeInstanceOf(ReturnError);
  });

  it("debit note moved stock out and reduces net payable", async () => {
    const [dn] = await t.db.select().from(purchaseReturns);
    expect(dn.status).toBe("posted");
    expect(await scalar(t.client, "SELECT count(*) FROM stock_movements WHERE type = 'purchase_return' AND ref_id = $1 AND qty < 0", [dn.id])).toBe(1);
    const v = (await vendorOutstanding(t.db)).find((r) => r.partyId === dn.vendorId)!;
    expect(v.debitNotes).toBeCloseTo(Number(dn.total), 2);
    expect(v.netDue).toBeCloseTo(v.invoicesDue - v.debitNotes, 2);
  });

  it("advance partly applied; customer net due matches the ledger closing balance", async () => {
    const advs = await t.db.select().from(payments).where(eq(payments.isAdvance, true));
    expect(advs).toHaveLength(2);
    const applied = advs.find((a) => Number(a.allocatedAmount) > 0)!;
    expect(Number(applied.allocatedAmount)).toBeLessThan(Number(applied.amount));
    expect(await scalar(t.client, "SELECT coalesce(sum(amount),0) FROM payment_allocations WHERE payment_id = $1", [applied.id]))
      .toBeCloseTo(Number(applied.allocatedAmount), 2);
    const rows = await customerOutstanding(t.db);
    const [cn] = await t.db.select().from(salesReturns).where(eq(salesReturns.status, "posted"));
    for (const cid of new Set([...advs.map((a) => a.customerId!), cn.customerId])) {
      const r = rows.find((x) => x.partyId === cid)!;
      expect(r.netDue).toBeCloseTo(r.invoicesDue - r.creditNotes - r.advances, 2);
      const ledger = await customerLedger(t.db, cid);
      expect(ledger.closing).toBeCloseTo(r.netDue, 0);
    }
  });
});
