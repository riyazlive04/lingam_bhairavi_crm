/**
 * Version 2 demo seed: AMC contracts, preventive visits and service calls.
 * Idempotent: returns at once if amc_contracts already has rows. Dates are relative to today (IST),
 * so the demo always shows one contract expiring in 20 days, one lapsed, visits due in 5 days, one missed
 * visit and one service call past its SLA. Does not import server-only modules (safe in scripts and tests).
 */
import { asc, count, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "../index";
import { amcContracts, amcVisits, customers, projects, serviceCalls, users } from "../schema";
import { addDays, addMonths, financialYear, todayIST } from "@/lib/format";
import { checklistItemsFor, defaultEndDate, defaultScope, scheduleVisits, serviceDueBy, type ChecklistResult } from "@/lib/amc";

/** Same numbering as lib/sequence nextNumber (sequences table), without the server-only import. */
async function nextNo(db: DB, kind: "amc" | "service_call", prefix: string, date: string) {
  const fy = financialYear(date);
  const r = await db.execute(sql`INSERT INTO sequences(key, value) VALUES (${`${kind}:${fy}`}, 1)
    ON CONFLICT (key) DO UPDATE SET value = sequences.value + 1 RETURNING value`);
  const n = Number((r as unknown as { rows: { value: number }[] }).rows[0].value);
  return `${prefix}/${fy}/${String(n).padStart(4, "0")}`;
}

const REMARKS = [
  "Gland packing leaking, needs replacement",
  "Battery voltage low, replacement recommended",
  "Two detectors dusty, cleaned and retested",
  "Hose reel nozzle missing, quote sent",
  "Paint peeling near the valve, corrosion starting",
  "Hooter in store area weak",
];

function checklistResults(systems: string[], seedNo: number): ChecklistResult[] {
  return checklistItemsFor(systems).map((item, i) => {
    const bad = (seedNo * 7 + i) % 13 === 4;
    return bad ? { item, ok: false, remark: REMARKS[(seedNo + i) % REMARKS.length] } : { item, ok: true };
  });
}

type Plan = {
  customerName: string;
  systems: string[];
  start: string;
  end: string;
  value: number;
  billingFrequency: string;
  visitsPerYear: number;
  coverage: "comprehensive" | "non_comprehensive";
  responseHours: number;
  status: "active" | "expired";
  engineer: 0 | 1;
  /** index of a past visit to leave as missed */
  missed?: number;
  /** index of a past visit to leave scheduled (overdue) */
  overdue?: number;
  /** move the first future visit to today + N days */
  nextIn?: number;
};

export async function seedAmc(db: DB): Promise<void> {
  const [{ n }] = await db.select({ n: count() }).from(amcContracts);
  if (Number(n) > 0) return;

  const today = todayIST();
  const allCustomers = await db.select({ id: customers.id, name: customers.name, address: customers.address, city: customers.city })
    .from(customers).where(eq(customers.active, true)).orderBy(asc(customers.id));
  if (allCustomers.length === 0) return;
  const staff = await db.select({ id: users.id, role: users.role }).from(users).where(inArray(users.role, ["engineer", "sales", "admin"])).orderBy(asc(users.id));
  const engineers = staff.filter((u) => u.role === "engineer").map((u) => u.id);
  const salesId = staff.find((u) => u.role === "sales")?.id ?? staff.find((u) => u.role === "admin")?.id ?? null;
  const eng = (i: 0 | 1) => engineers[i] ?? engineers[0] ?? null;

  const used = new Set<number>();
  const pick = (name: string) => {
    const c = allCustomers.find((x) => x.name === name && !used.has(x.id)) ?? allCustomers.find((x) => !used.has(x.id)) ?? allCustomers[0];
    used.add(c.id);
    return c;
  };

  const expEnd = addDays(today, 20);
  const lapsedEnd = addDays(today, -15);
  const plans: Plan[] = [
    { // expires in 20 days, renewal reminder
      customerName: "Hosur Precision Castings Pvt Ltd", systems: ["hydrant_sprinkler", "general"],
      start: addMonths(addDays(expEnd, 1), -12), end: expEnd, value: 145000, billingFrequency: "quarterly", visitsPerYear: 4,
      coverage: "non_comprehensive", responseHours: 24, status: "active", engineer: 0, overdue: 3,
    },
    { // lapsed 15 days ago, not renewed
      customerName: "Annapoorna Textiles Pvt Ltd", systems: ["extinguisher_refill"],
      start: addMonths(addDays(lapsedEnd, 1), -12), end: lapsedEnd, value: 28000, billingFrequency: "yearly", visitsPerYear: 2,
      coverage: "non_comprehensive", responseHours: 48, status: "expired", engineer: 1,
    },
    { // fire alarm + PA, next visit in 5 days
      customerName: "Velan Multispeciality Hospital", systems: ["fire_alarm", "pa_system"],
      start: addDays(today, -100), end: defaultEndDate(addDays(today, -100)), value: 96000, billingFrequency: "quarterly", visitsPerYear: 4,
      coverage: "non_comprehensive", responseHours: 8, status: "active", engineer: 0, nextIn: 5,
    },
    { // extinguishers, one missed visit
      customerName: "Tamil Nadu Bearings Ltd", systems: ["extinguisher_refill", "fire_alarm"],
      start: addDays(today, -230), end: defaultEndDate(addDays(today, -230)), value: 64000, billingFrequency: "half_yearly", visitsPerYear: 4,
      coverage: "non_comprehensive", responseHours: 24, status: "active", engineer: 1, missed: 0,
    },
    { // new comprehensive contract, monthly billing
      customerName: "Sunrise Tech Parks Pvt Ltd", systems: ["hydrant_sprinkler", "fire_alarm", "pa_system"],
      start: addDays(today, -30), end: defaultEndDate(addDays(today, -30)), value: 420000, billingFrequency: "monthly", visitsPerYear: 4,
      coverage: "comprehensive", responseHours: 6, status: "active", engineer: 0,
    },
  ];

  const contracts: { id: number; customerId: number; responseHours: number; projectId: number | null }[] = [];
  let seedNo = 1;
  for (const p of plans) {
    const cu = pick(p.customerName);
    const [proj] = await db.select({ id: projects.id, siteAddress: projects.siteAddress }).from(projects).where(eq(projects.customerId, cu.id)).limit(1);
    const number = await nextNo(db, "amc", "LBE/AMC", p.start < today ? today : p.start);
    const engineerId = eng(p.engineer);
    const [row] = await db.insert(amcContracts).values({
      number, customerId: cu.id, projectId: proj?.id ?? null,
      siteAddress: proj?.siteAddress ?? ([cu.address, cu.city].filter(Boolean).join(", ") || null),
      systems: p.systems, scope: defaultScope(p.systems, p.coverage), startDate: p.start, endDate: p.end, value: p.value,
      billingFrequency: p.billingFrequency, visitsPerYear: p.visitsPerYear, coverage: p.coverage, responseHours: p.responseHours,
      engineerId, status: p.status, nextBillingDate: p.start, createdBy: salesId,
      notes: p.status === "expired" ? "Customer asked for a revised quote before renewing." : null,
    }).returning({ id: amcContracts.id });
    contracts.push({ id: row.id, customerId: cu.id, responseHours: p.responseHours, projectId: proj?.id ?? null });

    const dates = scheduleVisits(p.start, p.end, p.visitsPerYear);
    const firstFuture = dates.findIndex((d) => d >= today);
    const values = dates.map((d, i) => {
      let scheduledDate = d;
      if (p.nextIn != null && i === firstFuture) scheduledDate = addDays(today, p.nextIn);
      const past = scheduledDate < today;
      if (past && i === p.missed) {
        return { contractId: row.id, scheduledDate, status: "missed", engineerId, findings: "Missed: site closed for annual shutdown" };
      }
      if (past && i !== p.overdue) {
        const results = checklistResults(p.systems, seedNo++);
        const bad = results.filter((r) => !r.ok).length;
        return {
          contractId: row.id, scheduledDate, status: "done", doneDate: addDays(scheduledDate, i % 2), engineerId, checklist: results,
          findings: bad ? `${bad} item${bad === 1 ? "" : "s"} need attention. All other checks normal.` : "All systems normal. Pumps tested on auto and manual.",
          recommendations: bad ? "Quotation for the spares will be shared. Fix before the next visit." : null,
          customerSignoff: ["R. Saravanan", "K. Venkatesh", "Admin office", "Security supervisor"][i % 4],
        };
      }
      return { contractId: row.id, scheduledDate, status: "scheduled", engineerId };
    });
    if (values.length) await db.insert(amcVisits).values(values);
  }

  // ---------------------------------------------------------------- service calls
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);
  const [hosur, lapsed, hospital, bearings, techPark] = contracts;
  const walkIn = pick("Green Valley Apartments Owners Association");
  type Call = Omit<typeof serviceCalls.$inferInsert, "number">;
  const calls: Call[] = [
    { // SLA breached: 8 h response, raised 11 h ago, still in progress
      customerId: hospital.customerId, contractId: hospital.id, projectId: hospital.projectId, raisedAt: hoursAgo(11), dueBy: serviceDueBy(hoursAgo(11), hospital.responseHours),
      reportedBy: "Biomedical engineer, ICU block", priority: "critical", system: "fire_alarm", status: "in_progress", engineerId: eng(0),
      description: "Fire alarm panel showing fault on loop 2. ICU corridor detectors not responding.",
    },
    {
      customerId: hosur.customerId, contractId: hosur.id, projectId: hosur.projectId, raisedAt: hoursAgo(2), dueBy: serviceDueBy(hoursAgo(2), hosur.responseHours),
      reportedBy: "K. Venkatesh, plant manager", priority: "high", system: "hydrant_sprinkler", status: "open",
      description: "Jockey pump starting every few minutes. Pressure drops overnight.",
    },
    {
      customerId: techPark.customerId, contractId: techPark.id, projectId: techPark.projectId, raisedAt: hoursAgo(3), dueBy: serviceDueBy(hoursAgo(3), techPark.responseHours),
      reportedBy: "Facility desk, Tower B", priority: "normal", system: "pa_system", status: "assigned", engineerId: eng(1),
      description: "No sound from PA speakers on floors 4 and 5 during the weekly test.",
    },
    { // resolved, chargeable (no AMC)
      customerId: walkIn.id, contractId: null, raisedAt: hoursAgo(80), dueBy: serviceDueBy(hoursAgo(80), null), resolvedAt: hoursAgo(60),
      reportedBy: "M. Rajasekar, secretary", priority: "normal", system: "hydrant_sprinkler", status: "resolved", engineerId: eng(1),
      description: "Hose reel drum jammed at block C and one landing valve leaking.",
      resolution: "Serviced the hose reel drum, replaced the landing valve gland and washer. Tested at working pressure.",
      chargeable: true, chargeAmount: 4500,
    },
    { // resolved within SLA under AMC
      customerId: bearings.customerId, contractId: bearings.id, projectId: bearings.projectId, raisedAt: hoursAgo(50), dueBy: serviceDueBy(hoursAgo(50), bearings.responseHours), resolvedAt: hoursAgo(40),
      reportedBy: "V. Ilango, safety officer", priority: "normal", system: "fire_alarm", status: "resolved", engineerId: eng(1),
      description: "Hooter sounding at night with no fire. Panel shows MCP 14 activated.",
      resolution: "MCP 14 glass was cracked. Replaced the glass element and reset the panel. Tested OK.",
      chargeable: false, chargeAmount: 0,
    },
    { // lapsed AMC, so no contract, 48 h
      customerId: lapsed.customerId, contractId: null, raisedAt: hoursAgo(10), dueBy: serviceDueBy(hoursAgo(10), null),
      reportedBy: "P. Gopinath, director", priority: "high", system: "extinguisher_refill", status: "open", chargeable: true,
      description: "Six CO2 extinguishers in the boiler area show low weight after the fire drill. Need refilling.",
    },
  ];
  for (const c of calls) {
    const number = await nextNo(db, "service_call", "LBE/SC", today);
    await db.insert(serviceCalls).values({ ...c, number, chargeable: c.chargeable ?? !c.contractId, createdBy: salesId });
  }
}
