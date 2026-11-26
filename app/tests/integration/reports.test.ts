import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { customers, items, paymentAllocations, payments, projects, salesInvoices, salesReturns, stockMovements, users } from "@/db/schema";
import { projectCost } from "@/lib/costing";
import { projectCosts } from "@/lib/agents/hygiene";
import {
  customerProfitability, itemMargins, last12Months, monthlyPnl, orderPnl, orderProfitability, projectBuyVsSell, projectProfitability,
} from "@/lib/reports";
import { loadProjectHistory } from "@/app/(app)/projects/_lib/history";
import { addDays, round2, todayIST } from "@/lib/format";
import { freshSeededDb, type TestDb } from "./helpers";

let t: TestDb;
beforeAll(async () => { t = await freshSeededDb(); });
afterAll(async () => { await t?.close(); });

describe("report loaders run on the seeded database", () => {
  it("monthly P&L, orders, projects, customers, items", async () => {
    const today = todayIST();
    const pnl = await monthlyPnl(t.db, last12Months(today));
    expect(pnl.months).toHaveLength(12);
    expect(pnl.total.sales).toBeGreaterThan(0);
    expect(round2(pnl.months.reduce((a, m) => a + m.netProfit, 0))).toBeCloseTo(pnl.total.netProfit, 0);

    const orders = await orderProfitability(t.db, {});
    expect(orders.length).toBeGreaterThan(0);
    const one = await orderPnl(t.db, { orderId: orders[0].orderId });
    expect(one?.revenue).toBe(orders[0].revenue);
    expect(await orderPnl(t.db, { orderId: 999999 })).toBeNull();

    const pp = await projectProfitability(t.db);
    expect(pp.length).toBeGreaterThan(0);
    const cp = await customerProfitability(t.db);
    expect(cp.length).toBeGreaterThan(0);
    const im = await itemMargins(t.db, { today });
    expect(im.length).toBeGreaterThan(0);
    expect(await itemMargins(t.db, { today, q: "zzzz-no-such-item" })).toEqual([]);

    const [p] = await t.db.select().from(projects).limit(1);
    const bvs = await projectBuyVsSell(t.db, { projectId: p.id });
    expect(Array.isArray(bvs)).toBe(true);
    const [admin] = await t.db.select().from(users).where(eq(users.role, "admin")).limit(1);
    const feed = await loadProjectHistory(t.db, p, { id: admin.id, name: admin.name, email: admin.email, role: "admin" }, true);
    expect(feed.length).toBeGreaterThan(0);
    for (let i = 1; i < feed.length; i++) expect(feed[i - 1].sortAt >= feed[i].sortAt).toBe(true);
    const eng = await loadProjectHistory(t.db, p, { id: admin.id, name: admin.name, email: admin.email, role: "engineer" }, false);
    expect(eng.filter((e) => e.type !== "expense").every((e) => e.amount == null)).toBe(true);
  });
});

describe("project cost with returns, credit notes and advances (rules 13 and 15)", () => {
  it("restocked returns cut cost, credit notes cut invoiced, advances count as received once", async () => {
    const [p] = await t.db.select().from(projects).limit(1);
    const [cust] = await t.db.select().from(customers).where(eq(customers.id, p.customerId));
    const [item] = await t.db.select().from(items).limit(1);
    const today = todayIST();
    const before = (await projectCost(t.db, p.id))!;
    const hygBefore = (await projectCosts(t.db, [p.id])).get(p.id)!;

    // customer return put back in stock for this project, with a posted credit note
    await t.db.insert(stockMovements).values({ itemId: item.id, qty: 2, type: "sales_return", rate: 500, projectId: p.id, date: today });
    const [cn] = await t.db.insert(salesReturns).values({
      number: "QA-CN-1", customerId: cust.id, projectId: p.id, date: today, subtotal: 1200, taxAmount: 216, total: 1416, status: "posted",
    }).returning();
    // a project invoice, an advance of 5000 and 3000 of it applied to the invoice
    const [inv] = await t.db.insert(salesInvoices).values({
      number: "QA-INV-ADV", customerId: cust.id, projectId: p.id, invoiceDate: today, dueDate: addDays(today, 30),
      subtotal: 10000, taxAmount: 1800, total: 11800, paidAmount: 3000, status: "partially_paid",
    }).returning();
    const [adv] = await t.db.insert(payments).values({
      direction: "in", customerId: cust.id, amount: 5000, date: today, mode: "bank", isAdvance: true, projectId: p.id, allocatedAmount: 3000,
    }).returning();
    await t.db.insert(paymentAllocations).values({ paymentId: adv.id, salesInvoiceId: inv.id, amount: 3000, date: today });

    const after = (await projectCost(t.db, p.id))!;
    expect(round2(after.customerReturns - before.customerReturns)).toBe(1000);
    expect(round2(before.actualCost - after.actualCost)).toBe(1000);
    expect(round2(after.creditNotes - before.creditNotes)).toBe(1200);
    expect(round2(after.invoiced - before.invoiced)).toBe(round2(10000 - 1200));
    expect(round2(after.advances - before.advances)).toBe(5000);
    expect(round2(after.received - before.received)).toBe(5000); // the 3000 applied is not counted twice
    // net due: invoice open 8800, less credit note 1416, less unused advance 2000
    expect(round2(after.netDue - before.netDue)).toBe(round2(8800 - 1416 - 2000));

    const hygAfter = (await projectCosts(t.db, [p.id])).get(p.id)!;
    expect(round2(hygBefore.actual - hygAfter.actual)).toBe(1000);
    expect(round2(hygAfter.actual)).toBe(after.actualCost);

    // credit-note adjustment against the invoice is not cash
    await t.db.update(salesInvoices).set({ paidAmount: 4416 }).where(eq(salesInvoices.id, inv.id));
    await t.db.update(salesReturns).set({ adjustedAmount: 1416 }).where(eq(salesReturns.id, cn.id));
    const adjusted = (await projectCost(t.db, p.id))!;
    expect(adjusted.received).toBe(after.received);
    expect(adjusted.netDue).toBe(after.netDue);
  });
});
