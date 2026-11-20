import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, like } from "drizzle-orm";
import { alerts, salesOrderLines } from "@/db/schema";
import { runAgents } from "@/lib/agents";
import { pendingDeliveryLines, recomputeOrderStatus } from "@/lib/orders";
import { todayIST } from "@/lib/format";
import { freshSeededDb, scalar, type TestDb } from "./helpers";

let t: TestDb;
beforeAll(async () => { t = await freshSeededDb(); });
afterAll(async () => { await t?.close(); });

describe("pendingDeliveryLines", () => {
  it("returns the seeded overdue lines, most overdue first", async () => {
    const today = todayIST();
    const lines = await pendingDeliveryLines(t.db, { today });
    const overdue = lines.filter((l) => (l.daysOverdue ?? 0) > 0);
    expect(overdue.length).toBeGreaterThan(0);

    const expected = await t.client.query<{ id: number }>(`
      SELECT l.id FROM sales_order_lines l JOIN sales_orders o ON o.id = l.order_id
      WHERE o.status IN ('open','partial') AND l.delivery_status IN ('pending','ordered','in_transit','partial')
        AND l.delivered_qty < l.qty AND coalesce(l.expected_date, o.expected_delivery) < $1`, [today]);
    expect(overdue.map((l) => l.lineId).sort((a, b) => a - b)).toEqual(expected.rows.map((r) => r.id).sort((a, b) => a - b));

    for (const l of lines) {
      expect(l.pendingQty).toBeGreaterThan(0);
      expect(l.pendingQty).toBeCloseTo(l.qty - l.deliveredQty, 6);
    }
    // sort: daysOverdue non-increasing among dated lines
    const dated = lines.filter((l) => l.expectedDate);
    for (let i = 1; i < dated.length; i++) expect(dated[i - 1].expectedDate! <= dated[i].expectedDate!).toBe(true);
  });
});

describe("runAgents", () => {
  it("is idempotent: a second run creates no new alerts and no new e-mails", async () => {
    const first = await runAgents(t.db, { trigger: "manual" });
    expect(first.totals.errors).toBe(0);
    expect(first.totals.alertsCreated).toBeGreaterThan(0);
    const alertsAfter1 = await scalar(t.client, `SELECT count(*) FROM alerts`);
    const emailsAfter1 = await scalar(t.client, `SELECT count(*) FROM email_outbox`);

    const second = await runAgents(t.db, { trigger: "manual" });
    expect(second.totals.errors).toBe(0);
    expect(second.totals.alertsCreated).toBe(0);
    expect(second.totals.emailsQueued).toBe(0);
    expect(await scalar(t.client, `SELECT count(*) FROM alerts`)).toBe(alertsAfter1);
    expect(await scalar(t.client, `SELECT count(*) FROM email_outbox`)).toBe(emailsAfter1);
    // no duplicate dedupe keys
    expect(await scalar(t.client, `SELECT count(*) FROM (SELECT dedupe_key FROM alerts GROUP BY 1 HAVING count(*) > 1) x`)).toBe(0);
  });

  it("auto-resolves the pending-delivery alert once the line is delivered (AG-13)", async () => {
    const open = await t.db.select().from(alerts).where(and(like(alerts.dedupeKey, "pd:line:%"), eq(alerts.status, "open")));
    expect(open.length).toBeGreaterThan(0);
    const alert = open[0];
    const lineId = Number(alert.dedupeKey.split(":")[2]);
    const [line] = await t.db.select().from(salesOrderLines).where(eq(salesOrderLines.id, lineId));
    expect(line).toBeTruthy();

    await t.db.update(salesOrderLines).set({ deliveredQty: line.qty, deliveryStatus: "delivered" }).where(eq(salesOrderLines.id, lineId));
    await recomputeOrderStatus(t.db, line.orderId);

    const res = await runAgents(t.db, { trigger: "manual" });
    expect(res.totals.errors).toBe(0);
    const [after] = await t.db.select().from(alerts).where(eq(alerts.id, alert.id));
    expect(after.status).toBe("done");
    expect(after.resolvedAt).toBeTruthy();
    // other pending-delivery alerts stay open
    const stillOpen = await t.db.select().from(alerts).where(and(like(alerts.dedupeKey, "pd:line:%"), eq(alerts.status, "open")));
    expect(stillOpen.length).toBe(open.length - 1);
  });
});
