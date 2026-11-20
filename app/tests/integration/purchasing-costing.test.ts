import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { expenseAllocations, expenses, items, priceHistory, projects, purchaseInvoiceLines, purchaseInvoices, stockMovements, vendorItems, vendors } from "@/db/schema";
import { PurchaseError, postPurchaseInvoice } from "@/lib/purchasing";
import { projectCost } from "@/lib/costing";
import { addDays, round2, todayIST } from "@/lib/format";
import { freshSeededDb, scalar, type TestDb } from "./helpers";

let t: TestDb;
beforeAll(async () => { t = await freshSeededDb(); });
afterAll(async () => { await t?.close(); });

async function draftInvoice(opts: { vendorId: number; itemId: number; qty: number; rate: number; date: string; invoiceNo: string; projectId?: number }) {
  const [inv] = await t.db.insert(purchaseInvoices).values({
    vendorId: opts.vendorId, invoiceNo: opts.invoiceNo, invoiceDate: opts.date, dueDate: addDays(opts.date, 30),
    projectId: opts.projectId ?? null, status: "draft",
  }).returning();
  await t.db.insert(purchaseInvoiceLines).values({
    invoiceId: inv.id, itemId: opts.itemId, qty: opts.qty, rate: opts.rate, gstRate: 18, amount: round2(opts.qty * opts.rate),
  });
  return inv.id;
}
const stockOf = (itemId: number) => scalar(t.client, `SELECT coalesce(sum(qty),0) FROM stock_movements WHERE item_id = $1`, [itemId]);

describe("postPurchaseInvoice (rule 4)", () => {
  it("updates latest cost, price history, vendor items and stock; rejects a second post", async () => {
    const today = todayIST();
    const [item] = await t.db.select().from(items).where(eq(items.code, "HS-PGI-100"));
    expect(item, "seeded item HS-PGI-100").toBeTruthy();
    const [vendor] = await t.db.select().from(vendors).limit(1);
    const oldRate = Number(item.lastPurchaseRate ?? item.listPrice ?? 100);
    const newRate = round2(oldRate * 1.2 + 1);
    const stockBefore = await stockOf(item.id);

    const id = await draftInvoice({ vendorId: vendor.id, itemId: item.id, qty: 7, rate: newRate, date: today, invoiceNo: "QA-PI-001" });
    const res = await postPurchaseInvoice(t.db, id, null);
    expect(res.itemsUpdated).toBe(1);
    expect(res.lines).toBe(1);

    const [after] = await t.db.select().from(items).where(eq(items.id, item.id));
    expect(Number(after.lastPurchaseRate)).toBe(newRate);
    expect(after.lastPurchaseDate).toBe(today);
    expect(after.lastPurchaseVendorId).toBe(vendor.id);

    const ph = await t.db.select().from(priceHistory).where(and(eq(priceHistory.refType, "purchase_invoice"), eq(priceHistory.refId, id)));
    expect(ph).toHaveLength(1);
    expect(ph[0]).toMatchObject({ kind: "purchase", itemId: item.id, vendorId: vendor.id, date: today });
    expect(Number(ph[0].rate)).toBe(newRate);

    const [vi] = await t.db.select().from(vendorItems).where(and(eq(vendorItems.vendorId, vendor.id), eq(vendorItems.itemId, item.id)));
    expect(Number(vi.lastRate)).toBe(newRate);
    expect(vi.lastDate).toBe(today);

    expect(await stockOf(item.id)).toBeCloseTo(stockBefore + 7, 6);

    const [inv] = await t.db.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, id));
    expect(inv.status).toBe("posted");
    expect(Number(inv.subtotal)).toBe(round2(7 * newRate));
    expect(Number(inv.total)).toBe(round2(7 * newRate * 1.18));

    await expect(postPurchaseInvoice(t.db, id, null)).rejects.toBeInstanceOf(PurchaseError);
    // nothing duplicated by the rejected second post
    expect(await stockOf(item.id)).toBeCloseTo(stockBefore + 7, 6);
    expect(await t.db.select().from(priceHistory).where(and(eq(priceHistory.refType, "purchase_invoice"), eq(priceHistory.refId, id)))).toHaveLength(1);
  });

  it("an older-dated invoice does not replace the latest rate (PM-2)", async () => {
    const [item] = await t.db.select().from(items).where(eq(items.code, "HS-PGI-100"));
    const [vendor] = await t.db.select().from(vendors).limit(1);
    const latest = Number(item.lastPurchaseRate);
    const id = await draftInvoice({ vendorId: vendor.id, itemId: item.id, qty: 1, rate: round2(latest / 2), date: addDays(todayIST(), -30), invoiceNo: "QA-PI-OLD" });
    const res = await postPurchaseInvoice(t.db, id, null);
    expect(res.itemsUpdated).toBe(0);
    const [after] = await t.db.select().from(items).where(eq(items.id, item.id));
    expect(Number(after.lastPurchaseRate)).toBe(latest);
    const [vi] = await t.db.select().from(vendorItems).where(and(eq(vendorItems.vendorId, vendor.id), eq(vendorItems.itemId, item.id)));
    expect(Number(vi.lastRate)).toBe(latest);
  });

  it("project-tagged invoice issues material to the project and raises its material cost (PI-3)", async () => {
    const [project] = await t.db.select().from(projects).limit(1);
    const [vendor] = await t.db.select().from(vendors).limit(1);
    const [item] = await t.db.select().from(items).where(eq(items.code, "HS-PGI-100"));
    const before = (await projectCost(t.db, project.id))!;
    const stockBefore = await stockOf(item.id);

    const id = await draftInvoice({ vendorId: vendor.id, itemId: item.id, qty: 3, rate: 1000, date: todayIST(), invoiceNo: "QA-PI-PRJ", projectId: project.id });
    await postPurchaseInvoice(t.db, id, null);

    const mv = await t.db.select().from(stockMovements).where(and(eq(stockMovements.refType, "purchase_invoice"), eq(stockMovements.refId, id)));
    expect(mv.map((m) => m.type).sort()).toEqual(["issue_project", "purchase_in"]);
    const issue = mv.find((m) => m.type === "issue_project")!;
    expect(Number(issue.qty)).toBe(-3);
    expect(issue.projectId).toBe(project.id);
    expect(await stockOf(item.id)).toBeCloseTo(stockBefore, 6); // in and straight out to site

    const after = (await projectCost(t.db, project.id))!;
    expect(round2(after.materials - before.materials)).toBe(3000); // taxable value, GST excluded
    expect(round2(after.actualCost - before.actualCost)).toBe(3000);
    expect(round2(before.margin - after.margin)).toBe(3000);
  });
});

describe("projectCostSummary (rule 5): expense allocations", () => {
  it("pending allocations are excluded; approval adds exactly the allocated amount", async () => {
    const [p1, p2] = await t.db.select().from(projects).limit(2);
    const b1 = (await projectCost(t.db, p1.id))!;
    const b2 = (await projectCost(t.db, p2.id))!;

    const [exp] = await t.db.insert(expenses).values({
      voucherNo: "QA-EXP-1", date: todayIST(), category: "petrol", amount: 2000, status: "pending",
    }).returning();
    await t.db.insert(expenseAllocations).values([
      { expenseId: exp.id, projectId: p1.id, amount: 1000 },
      { expenseId: exp.id, projectId: p2.id, amount: 1000 },
    ]);

    const m1 = (await projectCost(t.db, p1.id))!;
    expect(m1.actualCost).toBe(b1.actualCost); // EX-1: not yet in project cost
    expect(m1.expenses).toBe(b1.expenses);
    expect(round2(m1.pendingExpenses - b1.pendingExpenses)).toBe(1000);

    await t.db.update(expenses).set({ status: "approved" }).where(eq(expenses.id, exp.id));
    const a1 = (await projectCost(t.db, p1.id))!;
    const a2 = (await projectCost(t.db, p2.id))!;
    expect(round2(a1.actualCost - b1.actualCost)).toBe(1000); // EX-2
    expect(round2(a2.actualCost - b2.actualCost)).toBe(1000);
    expect(round2(a1.expenses - b1.expenses)).toBe(1000);
    expect(a1.pendingExpenses).toBe(b1.pendingExpenses);

    await t.db.update(expenses).set({ status: "rejected" }).where(eq(expenses.id, exp.id));
    const r1 = (await projectCost(t.db, p1.id))!;
    expect(r1.actualCost).toBe(b1.actualCost);
    expect(r1.pendingExpenses).toBe(b1.pendingExpenses);
  });
});
