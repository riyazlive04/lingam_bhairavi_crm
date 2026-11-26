import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { purchaseInvoiceLines, purchaseInvoices, purchaseOrderLines, purchaseOrders, quotationLines, salesOrderLines } from "@/db/schema";
import { backfillQuoteCostDates, seedPurchaseOrders } from "@/db/seed-v2/purchase-orders";
import { postPurchaseInvoice } from "@/lib/purchasing";
import { invoicePrefillFromPo } from "@/lib/purchase-orders";
import { round2, todayIST } from "@/lib/format";
import { freshSeededDb, type TestDb } from "./helpers";

let t: TestDb;
beforeAll(async () => { t = await freshSeededDb(); });
afterAll(async () => { await t?.close(); });

describe("seedPurchaseOrders + backfillQuoteCostDates", () => {
  it("creates sent/partial, received, draft and cancelled POs once", async () => {
    // seed() already runs seedPurchaseOrders (src/db/seed-v2); a second call must be a no-op
    const again = await seedPurchaseOrders(t.db);
    expect(again.created).toBe(0);
    const pos = await t.db.select().from(purchaseOrders);
    expect(pos.length).toBeGreaterThanOrEqual(3);
    const statuses = pos.map((p) => p.status).sort();
    expect(statuses).toContain("received");
    expect(statuses).toContain("draft");
    expect(statuses).toContain("cancelled");
    const linked = pos.find((p) => p.salesOrderId != null);
    expect(linked, "a PO against a sales order").toBeTruthy();
    expect(["partial", "sent"]).toContain(linked!.status);
    // its SO lines are marked ordered
    const ls = await t.db.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.poId, linked!.id));
    const sol = await t.db.select().from(salesOrderLines).where(eq(salesOrderLines.id, ls[0].salesOrderLineId!));
    expect(sol[0].deliveryStatus).toBe("ordered");
  });

  it("backfills cost dates on old quotation lines, idempotently", async () => {
    // seed() already ran the backfill: every line has a cost source and a rerun changes nothing
    const sourced = await t.db.select({ id: quotationLines.id }).from(quotationLines).where(eq(quotationLines.costSource, "purchase"));
    expect(sourced.length).toBeGreaterThan(0);
    const left = await t.db.select({ id: quotationLines.id }).from(quotationLines).where(isNull(quotationLines.costSource));
    expect(left.length).toBe(0);
    expect(await backfillQuoteCostDates(t.db)).toBe(0);
  });
});

describe("posting a bill raised from a PO (rule 16)", () => {
  it("adds received qty and moves the PO to partial, then received", async () => {
    const [po] = await t.db.select().from(purchaseOrders).where(eq(purchaseOrders.status, "draft"));
    expect(po, "seeded draft PO").toBeTruthy();
    await t.db.update(purchaseOrders).set({ status: "sent" }).where(eq(purchaseOrders.id, po.id));
    const pre = await invoicePrefillFromPo(t.db, po.id);
    expect(pre!.lines.length).toBeGreaterThan(0);

    async function bill(no: string, qtyOf: (q: number) => number) {
      const [inv] = await t.db.insert(purchaseInvoices).values({
        vendorId: po.vendorId, invoiceNo: no, invoiceDate: todayIST(), purchaseOrderId: po.id, status: "draft",
      }).returning();
      await t.db.insert(purchaseInvoiceLines).values(pre!.lines.map((l) => ({
        invoiceId: inv.id, itemId: l.itemId, qty: qtyOf(l.qty), rate: l.rate, gstRate: l.gstRate, amount: round2(qtyOf(l.qty) * l.rate), poLineId: l.poLineId,
      })));
      return postPurchaseInvoice(t.db, inv.id, null);
    }

    const r1 = await bill("QA-PO-1", (q) => q / 2);
    expect(r1.purchaseOrders).toEqual([{ poId: po.id, status: "partial", changed: true }]);
    const mid = await t.db.select().from(purchaseOrderLines).where(eq(purchaseOrderLines.poId, po.id));
    expect(mid.every((l) => Math.abs(l.receivedQty - l.qty / 2) < 1e-9)).toBe(true);

    const r2 = await bill("QA-PO-2", (q) => q / 2);
    expect(r2.purchaseOrders[0].status).toBe("received");
    const [after] = await t.db.select().from(purchaseOrders).where(eq(purchaseOrders.id, po.id));
    expect(after.status).toBe("received");
    expect((await invoicePrefillFromPo(t.db, po.id))!.lines.length).toBe(0);
  });

  it("draft bills are subtracted from the next prefill", async () => {
    const [po] = await t.db.select().from(purchaseOrders).where(and(eq(purchaseOrders.status, "partial")));
    if (!po) return; // seeded SO-linked PO may have had a single line of qty 1
    const before = await invoicePrefillFromPo(t.db, po.id);
    const l = before!.lines[0];
    const [inv] = await t.db.insert(purchaseInvoices).values({ vendorId: po.vendorId, invoiceNo: "QA-PO-DRAFT", invoiceDate: todayIST(), purchaseOrderId: po.id, status: "draft" }).returning();
    await t.db.insert(purchaseInvoiceLines).values({ invoiceId: inv.id, itemId: l.itemId, qty: l.qty, rate: l.rate, gstRate: l.gstRate, amount: round2(l.qty * l.rate), poLineId: l.poLineId });
    const afterDraft = await invoicePrefillFromPo(t.db, po.id);
    expect(afterDraft!.lines.find((x) => x.poLineId === l.poLineId)).toBeUndefined();
  });
});
