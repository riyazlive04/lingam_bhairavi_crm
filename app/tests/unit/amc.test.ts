import { describe, expect, it } from "vitest";
import {
  annualisedValue, billingSchedule, checklistItemsFor, checklistSectionsFor, currentBillingPeriod, defaultEndDate, defaultScope,
  effectiveAmcStatus, expiryInfo, fmtDuration, periodAmount, renewalDates, scheduleVisits, serviceDueBy, slaState, toAmcSystem, visitCount,
} from "@/lib/amc";

describe("visit scheduling (rule 19)", () => {
  it("spreads quarterly visits evenly over a one-year contract", () => {
    const v = scheduleVisits("2026-12-01", "2027-11-30", 4);
    expect(v).toEqual(["2027-01-15", "2027-04-16", "2027-07-16", "2027-10-15"]);
    // all within the term, strictly increasing
    for (let i = 0; i < v.length; i++) {
      expect(v[i] >= "2026-12-01" && v[i] <= "2027-11-30").toBe(true);
      if (i) expect(v[i] > v[i - 1]).toBe(true);
    }
  });
  it("handles monthly, yearly and zero visits", () => {
    expect(scheduleVisits("2026-04-01", "2027-03-31", 12)).toHaveLength(12);
    expect(scheduleVisits("2026-04-01", "2027-03-31", 1)).toEqual(["2026-09-30"]);
    expect(scheduleVisits("2026-04-01", "2027-03-31", 0)).toEqual([]);
    expect(scheduleVisits("2026-04-01", "2026-03-31", 4)).toEqual([]);
  });
  it("pro-rates visits for shorter or longer terms", () => {
    expect(visitCount("2026-01-01", "2026-06-30", 4)).toBe(2);
    expect(visitCount("2026-01-01", "2027-12-31", 4)).toBe(8);
    expect(visitCount("2026-01-01", "2026-01-10", 4)).toBe(1);
  });
  it("same-day contract puts the single visit on that day", () => {
    expect(scheduleVisits("2026-05-05", "2026-05-05", 4)).toEqual(["2026-05-05"]);
  });
});

describe("contract dates", () => {
  it("defaults the end date to one year less a day", () => {
    expect(defaultEndDate("2026-12-01")).toBe("2027-11-30");
    expect(defaultEndDate("2028-02-29")).toBe("2029-02-27");
  });
  it("renewal starts the day after the old end", () => {
    expect(renewalDates("2027-11-30")).toEqual({ startDate: "2027-12-01", endDate: "2028-11-30" });
  });
  it("expiry tone: amber under 30 days, red once expired", () => {
    expect(expiryInfo("2026-12-16", "2026-11-26").tone).toBe("amber");
    expect(expiryInfo("2027-01-30", "2026-11-26").tone).toBe("gray");
    expect(expiryInfo("2026-11-20", "2026-11-26")).toMatchObject({ tone: "red", days: -6 });
    expect(effectiveAmcStatus("active", "2026-11-20", "2026-11-26")).toBe("expired");
    expect(effectiveAmcStatus("renewed", "2026-11-20", "2026-11-26")).toBe("renewed");
  });
});

describe("billing period amount", () => {
  it("splits the value equally by frequency", () => {
    expect(periodAmount(120000, "quarterly", "2026-12-01", "2027-11-30")).toBe(30000);
    expect(periodAmount(120000, "monthly", "2026-12-01", "2027-11-30")).toBe(10000);
    expect(periodAmount(120000, "half_yearly", "2026-12-01", "2027-11-30")).toBe(60000);
    expect(periodAmount(120000, "yearly", "2026-12-01", "2027-11-30")).toBe(120000);
    expect(periodAmount(120000, "one_time", "2026-12-01", "2027-11-30")).toBe(120000);
  });
  it("last period absorbs rounding so the total equals the value", () => {
    const s = billingSchedule("2026-12-01", "2027-11-30", 100000, "monthly");
    expect(s).toHaveLength(12);
    expect(s.reduce((a, p) => a + p.amount, 0)).toBeCloseTo(100000, 2);
    expect(s[0]).toMatchObject({ from: "2026-12-01", to: "2026-12-31" });
    expect(s[11]).toMatchObject({ from: "2027-11-01", to: "2027-11-30" });
  });
  it("finds the current period", () => {
    const p = currentBillingPeriod("2026-12-01", "2027-11-30", 120000, "quarterly", "2027-04-10");
    expect(p).toMatchObject({ index: 2, from: "2027-03-01", to: "2027-05-31", amount: 30000 });
    expect(currentBillingPeriod("2026-12-01", "2027-11-30", 120000, "quarterly", "2026-11-26")?.index).toBe(1);
    expect(currentBillingPeriod("2026-12-01", "2027-11-30", 120000, "quarterly", "2027-12-01")).toBeNull();
  });
  it("annualises multi-year contracts only", () => {
    expect(annualisedValue(100000, "2026-01-01", "2026-12-31")).toBe(100000);
    expect(annualisedValue(200000, "2026-01-01", "2027-12-31")).toBeCloseTo(100068.5, 0);
    expect(annualisedValue(100000, "2028-01-01", "2028-12-31")).toBe(100000); // leap year
    expect(annualisedValue(50000, "2026-01-01", "2026-06-30")).toBe(50000);
  });
});

describe("service call SLA (rule 19)", () => {
  const raised = new Date("2026-11-26T04:30:00Z");
  it("dueBy = raisedAt + response hours, 48 h without a contract", () => {
    expect(serviceDueBy(raised, 24).toISOString()).toBe("2026-11-27T04:30:00.000Z");
    expect(serviceDueBy(raised, 4).toISOString()).toBe("2026-11-26T08:30:00.000Z");
    expect(serviceDueBy(raised, null).toISOString()).toBe("2026-11-28T04:30:00.000Z");
    expect(serviceDueBy(raised).toISOString()).toBe("2026-11-28T04:30:00.000Z");
  });
  it("counts down, warns when due soon and flags a breach", () => {
    const dueBy = serviceDueBy(raised, 4);
    expect(slaState({ status: "open", dueBy }, new Date("2026-11-26T05:30:00Z"))).toMatchObject({ state: "running", minutesLeft: 180, label: "3 h 0 m left" });
    expect(slaState({ status: "assigned", dueBy }, new Date("2026-11-26T07:30:00Z")).state).toBe("due_soon");
    expect(slaState({ status: "in_progress", dueBy }, new Date("2026-11-26T09:00:00Z"))).toMatchObject({ state: "breached", label: "Overdue by 30 m" });
    expect(slaState({ status: "resolved", dueBy, resolvedAt: new Date("2026-11-26T08:00:00Z") }).state).toBe("met");
    expect(slaState({ status: "resolved", dueBy, resolvedAt: new Date("2026-11-26T10:30:00Z") }).label).toBe("Resolved 2 h 0 m late");
    expect(slaState({ status: "open", dueBy: null }).state).toBe("none");
  });
  it("formats durations", () => {
    expect(fmtDuration(45)).toBe("45 m");
    expect(fmtDuration(-125)).toBe("2 h 5 m");
    expect(fmtDuration(60 * 50)).toBe("2 d 2 h");
  });
});

describe("checklists and scope", () => {
  it("builds system-specific checklists with the pump house once", () => {
    const keys = checklistSectionsFor(["hydrant_sprinkler", "general", "fire_alarm"]).map((s) => s.key);
    expect(keys).toEqual(["pump_house", "hydrant", "sprinkler", "fire_alarm"]);
    expect(checklistSectionsFor(["extinguisher_new"]).map((s) => s.key)).toEqual(["extinguisher"]);
    expect(checklistSectionsFor(["spares"])).toEqual([]);
    expect(checklistItemsFor(["pa_system"])[0]).toBe("PA / Voice evacuation: Amplifier output and health");
  });
  it("maps systems and writes a default scope", () => {
    expect(toAmcSystem("extinguisher_new")).toBe("extinguisher_refill");
    expect(toAmcSystem("spares")).toBeNull();
    const s = defaultScope(["fire_alarm"], "comprehensive");
    expect(s).toContain("Fire alarm system");
    expect(s).toContain("Comprehensive cover");
    expect(defaultScope([])).toBe("");
    expect(/[\u2013\u2014]/.test(defaultScope(["hydrant_sprinkler", "fire_alarm", "pa_system", "extinguisher_refill", "general"]))).toBe(false);
  });
});
