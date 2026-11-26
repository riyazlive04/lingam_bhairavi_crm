import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import { alerts, amcContracts, amcVisits, serviceCalls } from "@/db/schema";
import { seedAmc } from "@/db/seed-v2/amc";
import { amcSummary } from "@/lib/amc";
import { runAgents } from "@/lib/agents";
import { addDays, todayIST } from "@/lib/format";
import { insertContract } from "@/app/(app)/amc/_lib/contracts";
import { freshSeededDb, scalar, type TestDb } from "./helpers";

let t: TestDb;
beforeAll(async () => { t = await freshSeededDb(); await seedAmc(t.db); });
afterAll(async () => { await t?.close(); });

describe("seedAmc", () => {
  it("seeds contracts, visits and calls, and is idempotent", async () => {
    const before = await scalar(t.client, "select count(*) from amc_contracts");
    expect(before).toBe(5);
    expect(await scalar(t.client, "select count(*) from service_calls")).toBe(6);
    await seedAmc(t.db);
    expect(await scalar(t.client, "select count(*) from amc_contracts")).toBe(5);
    const today = todayIST();
    expect(await scalar(t.client, "select count(*) from amc_visits where status = 'missed'")).toBe(1);
    expect(await scalar(t.client, "select count(*) from amc_visits where status = 'scheduled' and scheduled_date = $1", [addDays(today, 5)])).toBe(1);
    expect(await scalar(t.client, "select count(*) from amc_visits where status = 'done' and jsonb_array_length(checklist) > 0")).toBeGreaterThan(3);
    expect(await scalar(t.client, "select count(*) from amc_contracts where end_date = $1", [addDays(today, 20)])).toBe(1);
  });

  it("summary counts match the seed", async () => {
    const s = await amcSummary(t.db);
    expect(s.activeContracts).toBe(4);
    expect(s.renewalsDue30).toBe(1);
    expect(s.visitsDueThisWeek).toBeGreaterThanOrEqual(1);
    expect(s.visitsOverdue).toBeGreaterThanOrEqual(1);
    expect(s.openCalls).toBe(4);
    expect(s.breachedCalls).toBe(1);
    expect(s.annualValue).toBeGreaterThan(0);
  });
});

describe("amc_service agent", () => {
  it("raises visit, renewal and SLA alerts once", async () => {
    const first = await runAgents(t.db, { trigger: "manual" });
    expect(first.outcomes.find((o) => o.agent === "amc_service")?.status).toBe("ok");
    const rows = await t.db.select().from(alerts).where(like(alerts.dedupeKey, "amc:%"));
    expect(rows.some((a) => a.dedupeKey.startsWith("amc:sla:") && a.severity === "critical")).toBe(true);
    expect(rows.filter((a) => a.dedupeKey.startsWith("amc:renew:")).length).toBe(2); // expiring in 20 days + lapsed
    expect(rows.some((a) => a.dedupeKey.startsWith("amc:visit:"))).toBe(true);
    for (const a of rows) expect(/[\u2013\u2014]/.test(`${a.title} ${a.message ?? ""}`)).toBe(false);

    const second = await runAgents(t.db, { trigger: "manual" });
    expect(second.outcomes.find((o) => o.agent === "amc_service")?.alertsCreated).toBe(0);
  });

  it("clears the SLA alert once the call is resolved", async () => {
    const [breached] = await t.db.select().from(alerts).where(like(alerts.dedupeKey, "amc:sla:%"));
    await t.db.update(serviceCalls).set({ status: "resolved", resolvedAt: new Date(), resolution: "Fixed" }).where(eq(serviceCalls.id, breached.entityId!));
    await runAgents(t.db, { trigger: "manual" });
    const [after] = await t.db.select().from(alerts).where(eq(alerts.id, breached.id));
    expect(after.status).toBe("done");
  });
});

describe("insertContract", () => {
  it("numbers the contract and schedules visits evenly (rule 19)", async () => {
    const [c] = await t.db.select().from(amcContracts).limit(1);
    const made = await t.db.transaction((tx) => insertContract(tx, {
      customerId: c.customerId, projectId: null, siteAddress: null, systems: ["fire_alarm"], scope: null,
      startDate: "2027-01-01", endDate: "2027-12-31", value: 50000, billingFrequency: "quarterly", visitsPerYear: 4,
      coverage: "non_comprehensive", responseHours: 24, engineerId: null, notes: null,
    }, 1));
    expect(made.number).toMatch(/^LBE\/AMC\/\d{4}-\d{2}\/\d{4}$/);
    expect(made.visits).toBe(4);
    const visits = await t.db.select().from(amcVisits).where(eq(amcVisits.contractId, made.id));
    expect(visits.map((v) => v.scheduledDate).sort()).toEqual(["2027-02-15", "2027-05-17", "2027-08-16", "2027-11-15"]);
  });
});
