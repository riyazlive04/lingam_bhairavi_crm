/**
 * AMC (annual maintenance contracts) and service call domain helpers. Maintainer: Sirah Digital.
 *
 * Pure helpers (checklists, visit scheduling, billing periods, SLA) are safe on client and server and are
 * unit tested in tests/unit/amc.test.ts. `amcSummary(db)` is the dashboard query.
 * Business rule 19 (CONVENTIONS.md): visits are scheduled evenly between start and end on create;
 * service call dueBy = raisedAt + contract.responseHours (48 h without a contract);
 * renewal creates a new contract with renewalOf and marks the old one renewed.
 */
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { amcContracts, amcVisits, serviceCalls } from "@/db/schema";
import { SYSTEMS } from "./constants";
import { addDays, addMonths, daysBetween, round2, todayIST } from "./format";

type DbLike = Pick<DB, "select">;

// ---------------------------------------------------------------- systems covered by an AMC
/** System keys offered on an AMC (SYSTEMS minus "spares"; new and refill extinguishers are one AMC system). */
export const AMC_SYSTEMS = {
  hydrant_sprinkler: "Hydrant & Sprinkler",
  fire_alarm: "Fire Alarm (FAS)",
  pa_system: "PA / Voice Evacuation",
  extinguisher_refill: "Fire Extinguishers",
  general: "Pump House / General",
} as const;
export type AmcSystem = keyof typeof AMC_SYSTEMS;
export const AMC_SYSTEM_KEYS = Object.keys(AMC_SYSTEMS) as [AmcSystem, ...AmcSystem[]];

/** Map any SYSTEMS key (e.g. from a quotation) to the AMC system key, or null when it is not serviceable. */
export function toAmcSystem(key: string | null | undefined): AmcSystem | null {
  if (!key) return null;
  if (key === "extinguisher_new") return "extinguisher_refill";
  return key in AMC_SYSTEMS ? (key as AmcSystem) : null;
}

export function systemLabel(key: string): string {
  return (AMC_SYSTEMS as Record<string, string>)[key] ?? (SYSTEMS as Record<string, string>)[key] ?? key.replace(/_/g, " ");
}

// ---------------------------------------------------------------- statuses & options
export const AMC_STATUSES = ["active", "expired", "renewed", "cancelled", "draft"] as const;
export const VISIT_STATUSES = ["scheduled", "done", "missed", "cancelled"] as const;
export const CALL_STATUSES = ["open", "assigned", "in_progress", "resolved", "closed"] as const;
export type CallStatus = (typeof CALL_STATUSES)[number];
export const CALL_PRIORITIES = { low: "Low", normal: "Normal", high: "High", critical: "Critical" } as const;
export type CallPriority = keyof typeof CALL_PRIORITIES;
export const PRIORITY_TONE: Record<CallPriority, "gray" | "blue" | "amber" | "red"> = { low: "gray", normal: "blue", high: "amber", critical: "red" };
export const COVERAGE = { comprehensive: "Comprehensive (parts included)", non_comprehensive: "Non-comprehensive (labour only)" } as const;
export type Coverage = keyof typeof COVERAGE;

export const BILLING_FREQUENCIES = {
  monthly: "Monthly", quarterly: "Quarterly", half_yearly: "Half-yearly", yearly: "Yearly", one_time: "One time (full value)",
} as const;
export type BillingFrequency = keyof typeof BILLING_FREQUENCIES;
const PERIOD_MONTHS: Record<Exclude<BillingFrequency, "one_time">, number> = { monthly: 1, quarterly: 3, half_yearly: 6, yearly: 12 };

/** Response time without a contract (rule 19). */
export const DEFAULT_RESPONSE_HOURS = 48;
/** Calls that still need work (the SLA clock is running). */
export const OPEN_CALL_STATUSES = ["open", "assigned", "in_progress"] as const;

/** Stored status, corrected for contracts whose end date passed before the agent marked them expired. */
export function effectiveAmcStatus(status: string, endDate: string, today: string = todayIST()): string {
  return status === "active" && endDate < today ? "expired" : status;
}

/** Days left on a contract and the tone to show it in (amber under 30 days, red once expired). */
export function expiryInfo(endDate: string, today: string = todayIST()): { days: number; tone: "red" | "amber" | "gray"; label: string } {
  const days = daysBetween(today, endDate);
  if (days < 0) return { days, tone: "red", label: `Expired ${-days} day${days === -1 ? "" : "s"} ago` };
  if (days === 0) return { days, tone: "amber", label: "Expires today" };
  if (days < 30) return { days, tone: "amber", label: `${days} day${days === 1 ? "" : "s"} left` };
  return { days, tone: "gray", label: `${days} days left` };
}

// ---------------------------------------------------------------- checklists
export type ChecklistSection = { key: string; title: string; items: string[] };
export type ChecklistResult = { item: string; ok: boolean; remark?: string };

/** Default preventive maintenance checklists (Indian fire safety AMC practice). */
export const CHECKLISTS = {
  pump_house: {
    key: "pump_house", title: "Pump house",
    items: [
      "Main electric pump run test",
      "Jockey pump run test and cut-in / cut-out pressure",
      "Diesel engine pump run test (fuel, battery, coolant)",
      "Auto start on pressure drop",
      "Pressure gauge readings (delivery header)",
      "Pressure switches and control panel indications",
      "Gland packing, leaks and vibration",
      "Fire water tank level and make-up valve",
      "Valves in pump house fully open and locked",
    ],
  },
  hydrant: {
    key: "hydrant", title: "Hydrant system",
    items: [
      "Landing / hydrant valves operation and spindle",
      "Hose reels: drum rotation, hose and shut-off nozzle",
      "Canvas hoses: condition, couplings and rolling",
      "Branch pipes and nozzles available",
      "Fire brigade inlet (4-way / 2-way) caps and non-return valve",
      "Hose boxes: glass, door and signage",
      "Pipeline leaks, corrosion and painting",
      "Pressure at the farthest hydrant point",
    ],
  },
  sprinkler: {
    key: "sprinkler", title: "Sprinkler system",
    items: [
      "Installation control valve set: valve open and locked",
      "Alarm gong / water motor gong test",
      "Inspector's test connection flow test",
      "Flow switches signal to the panel",
      "Sprinkler heads: no paint, damage, corrosion or obstruction",
      "Pressure gauges above and below the alarm valve",
      "Spare sprinkler heads and spanner in the cabinet",
    ],
  },
  fire_alarm: {
    key: "fire_alarm", title: "Fire alarm system",
    items: [
      "Panel: no faults, disablements or earth faults",
      "Panel batteries: voltage and charger",
      "Detector sensitivity test and cleaning (sample)",
      "Manual call points (MCP) test",
      "Hooters and strobes audible and visible",
      "Response indicators working",
      "Cause and effect test (AHU trip, lift homing, door release)",
      "Event log reviewed and cleared",
    ],
  },
  pa_system: {
    key: "pa_system", title: "PA / Voice evacuation",
    items: [
      "Amplifier output and health",
      "Zone selection and all zones test",
      "Speakers working in every zone",
      "Fireman microphone and pre-recorded evacuation message",
      "Battery backup changeover",
      "Interface with fire alarm panel",
    ],
  },
  extinguisher: {
    key: "extinguisher", title: "Fire extinguishers",
    items: [
      "Pressure gauge in the green band (stored pressure types)",
      "Safety pin and tamper seal intact",
      "CO2 cylinders weighed (no more than 10% loss)",
      "Hose, horn and nozzle condition",
      "Body: no dents, rust or damage",
      "Refill due date and HPT due date checked",
      "Mounted at the right height with signage and access clear",
    ],
  },
} satisfies Record<string, ChecklistSection>;

/** Checklist sections for a set of contract systems (pump house appears once even if two systems need it). */
export function checklistSectionsFor(systems: readonly string[]): ChecklistSection[] {
  const set = new Set(systems.map((s) => toAmcSystem(s)).filter((s): s is AmcSystem => !!s));
  const out: ChecklistSection[] = [];
  if (set.has("hydrant_sprinkler") || set.has("general")) out.push(CHECKLISTS.pump_house);
  if (set.has("hydrant_sprinkler")) out.push(CHECKLISTS.hydrant, CHECKLISTS.sprinkler);
  if (set.has("fire_alarm")) out.push(CHECKLISTS.fire_alarm);
  if (set.has("pa_system")) out.push(CHECKLISTS.pa_system);
  if (set.has("extinguisher_refill")) out.push(CHECKLISTS.extinguisher);
  return out;
}

/** Flat checklist item labels, "Section: item", the form stored in amc_visits.checklist[].item. */
export function checklistItemsFor(systems: readonly string[]): string[] {
  return checklistSectionsFor(systems).flatMap((s) => s.items.map((i) => `${s.title}: ${i}`));
}

export function checklistStats(list: readonly ChecklistResult[]): { total: number; ok: number; notOk: number } {
  const ok = list.filter((c) => c.ok).length;
  return { total: list.length, ok, notOk: list.length - ok };
}

// ---------------------------------------------------------------- scope text
/** Building blocks of the default scope text (exported so the client form can compose it without a server round trip). */
export const SCOPE_PARTS = {
  systems: {
    hydrant_sprinkler:
      "Hydrant and sprinkler system: preventive maintenance of pumps (main, jockey, diesel), hydrant valves, hose reels, hoses, branch pipes, fire brigade inlet, installation control valve, alarm gong, flow switches and sprinkler heads. Run tests and pressure checks every visit.",
    fire_alarm:
      "Fire alarm system: panel health and battery check, detector testing and cleaning on a rotating sample, manual call point and hooter / strobe testing, response indicators and cause and effect test.",
    pa_system:
      "PA / voice evacuation system: amplifier and zone testing, speaker check in every zone, fireman microphone and pre-recorded message test, battery backup changeover.",
    extinguisher_refill:
      "Fire extinguishers: visual inspection, pressure and seal check, CO2 weighing, hose and nozzle check, and tracking of refill and hydraulic pressure test dates. Refilling and spares are charged separately unless stated.",
    general:
      "Pump house and general fire safety equipment: pump run tests, panel checks, valve exercise, leak and corrosion inspection.",
  } satisfies Record<AmcSystem, string>,
  coverage: {
    comprehensive: "Comprehensive cover: spares and consumables needed for repairs are included, except damage, misuse and extinguisher refilling.",
    non_comprehensive: "Non-comprehensive cover: labour for visits and breakdown calls is included. Spares and consumables are quoted and charged separately.",
  } satisfies Record<Coverage, string>,
  footer: "A visit report with checklist results and recommendations is shared after every visit.",
};
export type ScopeParts = typeof SCOPE_PARTS;

/** Compose scope text from parts (pure; used by defaultScope and by the contract form on the client). */
export function composeScope(parts: ScopeParts, systems: readonly string[], coverage: string): string {
  const keys = [...new Set(systems.map((s) => toAmcSystem(s)).filter((s): s is AmcSystem => !!s))];
  if (!keys.length) return "";
  const cov = (parts.coverage as Record<string, string>)[coverage] ?? parts.coverage.non_comprehensive;
  return [...keys.map((k) => parts.systems[k]), cov, parts.footer].map((l) => `- ${l}`).join("\n");
}

/** Sensible default scope of work for the selected systems. */
export function defaultScope(systems: readonly string[], coverage: string = "non_comprehensive"): string {
  return composeScope(SCOPE_PARTS, systems, coverage);
}

// ---------------------------------------------------------------- visit scheduling (rule 19)
/** Number of preventive visits for a contract term, pro rata to visitsPerYear (at least 1 when visitsPerYear > 0). */
export function visitCount(startDate: string, endDate: string, visitsPerYear: number): number {
  if (!(visitsPerYear > 0) || endDate < startDate) return 0;
  const days = daysBetween(startDate, endDate) + 1;
  return Math.max(1, Math.round((visitsPerYear * days) / 365));
}

/**
 * Visit dates spread evenly over the contract: the term is split into equal slots and each visit is
 * placed in the middle of its slot (quarterly on a 1-year contract → about 1.5, 4.5, 7.5 and 10.5 months in).
 */
export function scheduleVisits(startDate: string, endDate: string, visitsPerYear: number): string[] {
  const n = visitCount(startDate, endDate, visitsPerYear);
  if (!n) return [];
  const span = daysBetween(startDate, endDate);
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(addDays(startDate, Math.min(span, Math.floor((span * (2 * i + 1)) / (2 * n)))));
  return out;
}

/** Default contract end: one year less a day after the start (2026-12-01 → 2027-11-30). */
export function defaultEndDate(startDate: string, years = 1): string {
  return addDays(addMonths(startDate, 12 * years), -1);
}

/** Dates for a renewal: starts the day after the old end, same length as one year. */
export function renewalDates(oldEndDate: string): { startDate: string; endDate: string } {
  const startDate = addDays(oldEndDate, 1);
  return { startDate, endDate: defaultEndDate(startDate) };
}

// ---------------------------------------------------------------- billing
export type BillingPeriod = { index: number; from: string; to: string; amount: number };

/**
 * Billing periods for the contract term. Contract value (excl. GST) is split equally across periods;
 * the last period absorbs rounding so the total always equals the value. `one_time` is a single period.
 */
export function billingSchedule(startDate: string, endDate: string, value: number, frequency: string): BillingPeriod[] {
  if (endDate < startDate) return [];
  const v = round2(Math.max(0, Number(value) || 0));
  const months = (PERIOD_MONTHS as Record<string, number>)[frequency];
  const ranges: { from: string; to: string }[] = [];
  if (!months) ranges.push({ from: startDate, to: endDate });
  else {
    for (let i = 0; ranges.length < 600; i++) {
      const from = addMonths(startDate, months * i);
      if (from > endDate) break;
      const next = addDays(addMonths(startDate, months * (i + 1)), -1);
      ranges.push({ from, to: next < endDate ? next : endDate });
    }
  }
  const each = round2(v / ranges.length);
  return ranges.map((r, i) => ({ index: i + 1, ...r, amount: i === ranges.length - 1 ? round2(v - each * (ranges.length - 1)) : each }));
}

/** Amount billable per period for a contract (the figure shown as "amount due this period"). */
export function periodAmount(value: number, frequency: string, startDate: string, endDate: string): number {
  return billingSchedule(startDate, endDate, value, frequency)[0]?.amount ?? 0;
}

/** The billing period containing `today` (first period if the contract has not started, null after it ends). */
export function currentBillingPeriod(startDate: string, endDate: string, value: number, frequency: string, today: string = todayIST()): BillingPeriod | null {
  const periods = billingSchedule(startDate, endDate, value, frequency);
  if (!periods.length || today > endDate) return null;
  if (today < startDate) return periods[0];
  return periods.find((p) => p.from <= today && today <= p.to) ?? null;
}

/** Contract value per year: contracts of a year or less count at face value, longer ones are scaled to 12 months. */
export function annualisedValue(value: number, startDate: string, endDate: string): number {
  const days = daysBetween(startDate, endDate) + 1;
  if (days <= 0) return 0;
  return round2((Number(value) || 0) * (days <= 366 ? 1 : 365.25 / days));
}

// ---------------------------------------------------------------- service call SLA (rule 19)
/** dueBy = raisedAt + responseHours (48 h when there is no contract). */
export function serviceDueBy(raisedAt: Date, responseHours?: number | null): Date {
  const h = responseHours != null && responseHours > 0 ? responseHours : DEFAULT_RESPONSE_HOURS;
  return new Date(raisedAt.getTime() + h * 3600_000);
}

export type SlaState = { state: "met" | "breached" | "running" | "due_soon" | "none"; minutesLeft: number | null; label: string };

/** "3 h 20 m" style duration for a number of minutes. */
export function fmtDuration(minutes: number): string {
  const m = Math.max(0, Math.round(Math.abs(minutes)));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  if (d) return `${d} d ${h} h`;
  if (h) return `${h} h ${mm} m`;
  return `${mm} m`;
}

/**
 * SLA status of a call. Open calls count down to dueBy (due soon under 2 hours, breached after it).
 * Resolved/closed calls report whether they were resolved in time.
 */
export function slaState(call: { status: string; dueBy: Date | string | null; resolvedAt?: Date | string | null }, now: Date = new Date()): SlaState {
  if (!call.dueBy) return { state: "none", minutesLeft: null, label: "No SLA" };
  const due = new Date(call.dueBy).getTime();
  if (call.status === "resolved" || call.status === "closed") {
    const at = call.resolvedAt ? new Date(call.resolvedAt).getTime() : null;
    if (at == null) return { state: "met", minutesLeft: null, label: "Resolved" };
    return at <= due
      ? { state: "met", minutesLeft: null, label: "Resolved within SLA" }
      : { state: "breached", minutesLeft: null, label: `Resolved ${fmtDuration((at - due) / 60000)} late` };
  }
  const left = (due - now.getTime()) / 60000;
  if (left < 0) return { state: "breached", minutesLeft: Math.round(left), label: `Overdue by ${fmtDuration(left)}` };
  return { state: left <= 120 ? "due_soon" : "running", minutesLeft: Math.round(left), label: `${fmtDuration(left)} left` };
}

// ---------------------------------------------------------------- dashboard summary
export type AmcSummary = {
  activeContracts: number;
  /** Σ annualised value of active contracts (excl. GST) */
  annualValue: number;
  /** scheduled visits dated today … today+6 on active contracts */
  visitsDueThisWeek: number;
  /** scheduled visits dated before today on active contracts */
  visitsOverdue: number;
  /** active contracts ending today … today+30 with no renewal */
  renewalsDue30: number;
  /** active contracts whose end date has passed (not yet renewed) */
  expiredNotRenewed: number;
  openCalls: number;
  breachedCalls: number;
};

/** Headline AMC and service numbers for the dashboard and the /amc page. */
export async function amcSummary(db: DbLike, today: string = todayIST(), now: Date = new Date()): Promise<AmcSummary> {
  const week = addDays(today, 6);
  const d30 = addDays(today, 30);
  const [contracts, visits, calls] = await Promise.all([
    db.select({ value: amcContracts.value, startDate: amcContracts.startDate, endDate: amcContracts.endDate })
      .from(amcContracts).where(eq(amcContracts.status, "active")),
    db.select({
      week: sql<number>`count(*) filter (where ${amcVisits.scheduledDate} >= ${today} and ${amcVisits.scheduledDate} <= ${week})`.mapWith(Number),
      overdue: sql<number>`count(*) filter (where ${amcVisits.scheduledDate} < ${today})`.mapWith(Number),
    }).from(amcVisits).innerJoin(amcContracts, eq(amcContracts.id, amcVisits.contractId))
      .where(and(eq(amcVisits.status, "scheduled"), eq(amcContracts.status, "active"))),
    db.select({
      open: sql<number>`count(*)`.mapWith(Number),
      breached: sql<number>`count(*) filter (where ${serviceCalls.dueBy} < ${now.toISOString()}::timestamptz)`.mapWith(Number),
    }).from(serviceCalls).where(inArray(serviceCalls.status, [...OPEN_CALL_STATUSES])),
  ]);
  let activeContracts = 0, annualValue = 0, renewalsDue30 = 0, expiredNotRenewed = 0;
  for (const c of contracts) {
    if (c.endDate < today) { expiredNotRenewed++; continue; }
    activeContracts++;
    annualValue += annualisedValue(Number(c.value), c.startDate, c.endDate);
    if (c.endDate <= d30) renewalsDue30++;
  }
  return {
    activeContracts, annualValue: round2(annualValue), renewalsDue30, expiredNotRenewed,
    visitsDueThisWeek: Number(visits[0]?.week ?? 0), visitsOverdue: Number(visits[0]?.overdue ?? 0),
    openCalls: Number(calls[0]?.open ?? 0), breachedCalls: Number(calls[0]?.breached ?? 0),
  };
}

/** Active contracts of a customer that cover today (newest first), used to auto-pick the contract on a new call. */
export async function activeContractsFor(db: DbLike, customerId: number, today: string = todayIST()) {
  return db.select({ id: amcContracts.id, number: amcContracts.number, responseHours: amcContracts.responseHours, systems: amcContracts.systems, coverage: amcContracts.coverage })
    .from(amcContracts)
    .where(and(eq(amcContracts.customerId, customerId), eq(amcContracts.status, "active"), lte(amcContracts.startDate, today), gte(amcContracts.endDate, today)))
    .orderBy(sql`${amcContracts.endDate} desc`);
}
