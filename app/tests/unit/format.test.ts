import { describe, expect, it } from "vitest";
import { addDays, addMonths, daysBetween, financialYear, marginPct, moneyShort, round2 } from "@/lib/format";

describe("financialYear", () => {
  it("April starts a new FY", () => {
    expect(financialYear("2026-03-31")).toBe("2025-26");
    expect(financialYear("2026-04-01")).toBe("2026-27");
    expect(financialYear("2027-04-01")).toBe("2027-28"); // QT-6
    expect(financialYear("2026-11-21")).toBe("2026-27");
    expect(financialYear("2027-01-15")).toBe("2026-27");
  });
  it("pads the short year and wraps centuries", () => {
    expect(financialYear("2008-06-01")).toBe("2008-09");
    expect(financialYear("2099-05-01")).toBe("2099-00");
  });
});

describe("addMonths / addDays", () => {
  it("adds whole months and years (RF-1 / RF-2)", () => {
    expect(addMonths("2025-12-01", 12)).toBe("2026-12-01");
    expect(addMonths("2025-12-01", 36)).toBe("2028-12-01");
    expect(addMonths("2026-12-03", 12)).toBe("2027-12-03");
    expect(addMonths("2026-03-15", -3)).toBe("2025-12-15");
  });
  it("clamps to the last day of a shorter target month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-02-29", 12)).toBe("2029-02-28");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonths("2026-08-31", 1)).toBe("2026-09-30");
  });
  it("addDays crosses month/year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("daysBetween", () => {
  it("returns b - a in whole days", () => {
    expect(daysBetween("2026-11-01", "2026-11-21")).toBe(20);
    expect(daysBetween("2026-11-21", "2026-11-01")).toBe(-20);
    expect(daysBetween("2026-11-21", "2026-11-21")).toBe(0);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2); // leap year
  });
});

describe("round2 / marginPct", () => {
  it("rounds half-cent values up", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(55296.0000001)).toBe(55296);
    expect(round2(-1.234)).toBe(-1.23);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
  it("marginPct = (sell - cost) / sell", () => {
    expect(marginPct(100, 85)).toBe(15);
    expect(marginPct(2310, 1650)).toBeCloseTo(28.5714, 3);
    expect(marginPct(0, 10)).toBe(0);
    expect(marginPct(100, 120)).toBe(-20);
  });
});

describe("moneyShort", () => {
  it("uses Cr / L / K suffixes", () => {
    expect(moneyShort(12_500_000)).toBe("₹1.25 Cr");
    expect(moneyShort(250_000)).toBe("₹2.50 L");
    expect(moneyShort(1_500)).toBe("₹1.5 K");
    expect(moneyShort(-250_000)).toBe("₹-2.50 L");
    expect(moneyShort(999)).toMatch(/^₹\s?999$/);
    expect(moneyShort(null)).toBe("-");
  });
});
