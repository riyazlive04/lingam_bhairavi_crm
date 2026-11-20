import { describe, expect, it } from "vitest";
import {
  budgetUsedPct, bucketAgeing, computeNextReminderDue, describeDue, isDueWithin, isOverdue, isReminderDue, mergeParams,
  projectActualCost, reconcileExisting, severityForLateness, toISTDate,
} from "@/lib/agents/rules";

const today = "2026-11-21";

describe("isOverdue / isDueWithin", () => {
  it("strictly before today (minus grace)", () => {
    expect(isOverdue("2026-11-20", today)).toBe(true);
    expect(isOverdue("2026-11-21", today)).toBe(false);
    expect(isOverdue("2026-11-20", today, 1)).toBe(false);
    expect(isOverdue("2026-11-19", today, 1)).toBe(true);
    expect(isOverdue(null, today)).toBe(false);
    expect(isOverdue("2026-11-20", today, -5)).toBe(true); // negative grace ignored
  });
  it("isDueWithin inclusive window", () => {
    expect(isDueWithin("2026-11-21", today, 4)).toBe(true);
    expect(isDueWithin("2026-11-25", today, 4)).toBe(true);
    expect(isDueWithin("2026-11-26", today, 4)).toBe(false);
    expect(isDueWithin("2026-11-20", today, 4)).toBe(false);
  });
});

describe("bucketAgeing", () => {
  it("buckets by days past due", () => {
    expect(bucketAgeing(-3)).toBe("current");
    expect(bucketAgeing(0)).toBe("current");
    expect(bucketAgeing(1)).toBe("1-30");
    expect(bucketAgeing(30)).toBe("1-30");
    expect(bucketAgeing(31)).toBe("31-60");
    expect(bucketAgeing(45)).toBe("31-60");
    expect(bucketAgeing(60)).toBe("31-60");
    expect(bucketAgeing(61)).toBe("61-90");
    expect(bucketAgeing(90)).toBe("61-90");
    expect(bucketAgeing(91)).toBe("90+");
  });
});

describe("computeNextReminderDue / isReminderDue", () => {
  const base = { dueDate: "2026-11-01", firstReminderDaysOverdue: 0, repeatEveryDays: 7, maxReminders: 4 };
  it("first reminder on due date + offset", () => {
    expect(computeNextReminderDue({ ...base, lastReminderAt: null, reminderCount: 0 })).toBe("2026-11-01");
    expect(computeNextReminderDue({ ...base, firstReminderDaysOverdue: 3, lastReminderAt: null, reminderCount: 0 })).toBe("2026-11-04");
  });
  it("repeat after last reminder", () => {
    expect(computeNextReminderDue({ ...base, lastReminderAt: "2026-11-10", reminderCount: 1 })).toBe("2026-11-17");
    // 20:00 UTC is already the next IST calendar day
    expect(computeNextReminderDue({ ...base, lastReminderAt: new Date("2026-11-10T20:00:00Z"), reminderCount: 1 })).toBe("2026-11-18");
  });
  it("stops after maxReminders (AG-6)", () => {
    expect(computeNextReminderDue({ ...base, lastReminderAt: "2026-11-10", reminderCount: 4 })).toBeNull();
    expect(isReminderDue({ ...base, lastReminderAt: "2026-10-01", reminderCount: 4, today })).toBe(false);
  });
  it("isReminderDue compares with today", () => {
    expect(isReminderDue({ ...base, lastReminderAt: "2026-11-10", reminderCount: 1, today: "2026-11-16" })).toBe(false);
    expect(isReminderDue({ ...base, lastReminderAt: "2026-11-10", reminderCount: 1, today: "2026-11-17" })).toBe(true);
    expect(isReminderDue({ ...base, dueDate: today, lastReminderAt: null, reminderCount: 0, today })).toBe(true); // AG-5
  });
});

describe("reconcileExisting", () => {
  it("open stays", () => {
    expect(reconcileExisting({ status: "open", severity: "info", snoozedUntil: null }, { severity: "critical" }, today)).toBe("keep");
  });
  it("snoozed reopens when snooze expires", () => {
    expect(reconcileExisting({ status: "snoozed", severity: "warning", snoozedUntil: "2026-11-25" }, { severity: "warning" }, today)).toBe("keep");
    expect(reconcileExisting({ status: "snoozed", severity: "warning", snoozedUntil: "2026-11-21" }, { severity: "warning" }, today)).toBe("reopen");
    expect(reconcileExisting({ status: "snoozed", severity: "warning", snoozedUntil: null }, { severity: "warning" }, today)).toBe("reopen");
  });
  it("done reopens only on escalation", () => {
    expect(reconcileExisting({ status: "done", severity: "warning", snoozedUntil: null }, { severity: "warning" }, today)).toBe("keep");
    expect(reconcileExisting({ status: "done", severity: "warning", snoozedUntil: null }, { severity: "critical" }, today)).toBe("reopen");
    expect(reconcileExisting({ status: "done", severity: "critical", snoozedUntil: null }, { severity: "info" }, today)).toBe("keep");
  });
});

describe("budget / cost helpers", () => {
  it("budgetUsedPct", () => {
    expect(budgetUsedPct(560000, 700000)).toBe(80); // PR-2
    expect(budgetUsedPct(700000, 700000)).toBe(100); // AG-12
    expect(budgetUsedPct(5, 0)).toBe(0);
  });
  it("projectActualCost (rule 5)", () => {
    expect(projectActualCost(400000, 10000, 2000)).toBe(392000);
    expect(projectActualCost(400000, -10000, 0)).toBe(390000);
  });
  it("severityForLateness (AG-3)", () => {
    expect(severityForLateness(8)).toBe("critical");
    expect(severityForLateness(7)).toBe("warning");
    expect(severityForLateness(0)).toBe("info");
  });
  it("describeDue / toISTDate / mergeParams", () => {
    expect(describeDue("2026-11-16", today)).toBe("5 days overdue");
    expect(describeDue(today, today)).toBe("due today");
    expect(describeDue("2026-11-22", today)).toBe("due in 1 day");
    expect(toISTDate("2026-11-21T19:00:00Z")).toBe("2026-11-22");
    expect(toISTDate("bad")).toBeNull();
    expect(mergeParams({ a: 1, b: 2 }, { a: "5", b: "x", c: 9 })).toEqual({ a: 5, b: 2 });
  });
});
