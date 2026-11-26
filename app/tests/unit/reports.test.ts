import { describe, expect, it } from "vitest";
import {
  buyVsSell, deliveredPctOf, financialYearOptions, fyBounds, isFyLabel, last12Months, marginOf, monthKeys, orderProfit, pnlLine,
  sortOrders, sumPnl, weightedAvg,
} from "@/lib/reports";

describe("financial year helpers", () => {
  it("fyBounds gives April to March", () => {
    expect(fyBounds("2026-27")).toEqual({ from: "2026-04-01", to: "2027-03-31" });
    expect(fyBounds("1999-00")).toEqual({ from: "1999-04-01", to: "2000-03-31" });
    expect(() => fyBounds("2026")).toThrow();
  });
  it("isFyLabel accepts only consecutive years", () => {
    expect(isFyLabel("2026-27")).toBe(true);
    expect(isFyLabel("1999-00")).toBe(true);
    expect(isFyLabel("2026-28")).toBe(false);
    expect(isFyLabel("abc")).toBe(false);
    expect(isFyLabel(undefined)).toBe(false);
  });
  it("financialYearOptions starts with the current FY", () => {
    expect(financialYearOptions("2026-11-26", 3)).toEqual(["2026-27", "2025-26", "2024-25"]);
    expect(financialYearOptions("2027-03-31", 1)).toEqual(["2026-27"]);
    expect(financialYearOptions("2027-04-01", 1)).toEqual(["2027-28"]);
  });
  it("monthKeys covers a FY and crosses the year end", () => {
    const k = monthKeys("2026-04-01", "2027-03-31");
    expect(k).toHaveLength(12);
    expect(k[0]).toBe("2026-04");
    expect(k[8]).toBe("2026-12");
    expect(k[9]).toBe("2027-01");
    expect(k.at(-1)).toBe("2027-03");
    expect(monthKeys("2026-05-10", "2026-05-20")).toEqual(["2026-05"]);
    expect(monthKeys("2026-06-01", "2026-05-01")).toEqual([]);
  });
  it("last12Months ends this month", () => {
    const r = last12Months("2026-11-26");
    expect(r).toEqual({ from: "2025-12-01", to: "2026-11-26" });
    expect(monthKeys(r.from, r.to)).toHaveLength(12);
    expect(last12Months("2026-01-05").from).toBe("2025-02-01");
  });
});

describe("margin maths", () => {
  it("marginOf is profit over revenue, 0 without revenue", () => {
    expect(marginOf(25, 100)).toBe(25);
    expect(marginOf(-10, 40)).toBe(-25);
    expect(marginOf(10, 0)).toBe(0);
    expect(marginOf(1, 3)).toBe(33.33);
  });
  it("weightedAvg", () => {
    expect(weightedAvg(1000, 4)).toBe(250);
    expect(weightedAvg(10, 0)).toBeNull();
  });
  it("deliveredPctOf caps at 100", () => {
    expect(deliveredPctOf(10, 5)).toBe(50);
    expect(deliveredPctOf(10, 12)).toBe(100);
    expect(deliveredPctOf(0, 0)).toBe(0);
  });
});

describe("pnlLine (rule 18)", () => {
  it("sales net of credit notes, COGS = deliveries + issues − site returns − restocked returns, net after expenses", () => {
    const l = pnlLine({ invoiced: 100000, creditNotes: 5000, deliveryCost: 30000, projectIssues: 40000, siteReturns: 2000, restockedReturns: 3000, expenses: 8000 });
    expect(l.sales).toBe(95000);
    expect(l.cogs).toBe(65000);
    expect(l.grossProfit).toBe(30000);
    expect(l.netProfit).toBe(22000);
    expect(l.grossMarginPct).toBe(31.58);
    expect(l.netMarginPct).toBe(23.16);
  });
  it("a month with only expenses is a loss with 0% margin (no sales)", () => {
    const l = pnlLine({ invoiced: 0, creditNotes: 0, deliveryCost: 0, projectIssues: 0, siteReturns: 0, restockedReturns: 0, expenses: 1500 });
    expect(l.netProfit).toBe(-1500);
    expect(l.netMarginPct).toBe(0);
  });
  it("sumPnl recomputes margins on totals", () => {
    const a = { invoiced: 100, creditNotes: 0, deliveryCost: 50, projectIssues: 0, siteReturns: 0, restockedReturns: 0, expenses: 0 };
    const b = { invoiced: 300, creditNotes: 0, deliveryCost: 270, projectIssues: 0, siteReturns: 0, restockedReturns: 0, expenses: 20 };
    const t = sumPnl([a, b]);
    expect(t.sales).toBe(400);
    expect(t.grossProfit).toBe(80);
    expect(t.grossMarginPct).toBe(20);
    expect(t.netProfit).toBe(60);
  });
});

describe("orderProfit (rule 17)", () => {
  it("revenue and cost are net of returns", () => {
    expect(orderProfit({ invoiced: 50000, creditNotes: 10000, deliveryCost: 30000, returnedCost: 6000 }))
      .toEqual({ revenue: 40000, cost: 24000, grossProfit: 16000, marginPct: 40 });
  });
  it("delivered but not yet invoiced shows a loss", () => {
    const r = orderProfit({ invoiced: 0, creditNotes: 0, deliveryCost: 1000, returnedCost: 0 });
    expect(r.grossProfit).toBe(-1000);
    expect(r.marginPct).toBe(0);
  });
  it("sortOrders puts orders without revenue last on margin sorts", () => {
    const rows = [
      { orderId: 1, revenue: 0, marginPct: 0, grossProfit: -5, orderDate: "2026-01-01" },
      { orderId: 2, revenue: 100, marginPct: 30, grossProfit: 30, orderDate: "2026-02-01" },
      { orderId: 3, revenue: 100, marginPct: -5, grossProfit: -5, orderDate: "2026-03-01" },
    ];
    expect(sortOrders(rows, "margin_asc").map((r) => r.orderId)).toEqual([3, 2, 1]);
    expect(sortOrders(rows, "margin_desc").map((r) => r.orderId)).toEqual([2, 3, 1]);
    expect(sortOrders(rows, "date_desc").map((r) => r.orderId)).toEqual([3, 2, 1]);
    expect(sortOrders(rows, "profit_desc").map((r) => r.orderId)).toEqual([2, 3, 1]);
  });
});

describe("buyVsSell", () => {
  it("margin per unit and on net qty used", () => {
    const r = buyVsSell({ qtyIssued: 10, issueValue: 1000, qtyBack: 2, sellRate: 130 });
    expect(r).toMatchObject({ netQty: 8, buyRate: 100, sellRate: 130, marginPerUnit: 30, marginTotal: 240, marginPct: 23.08, belowCost: false });
  });
  it("flags selling below cost", () => {
    const r = buyVsSell({ qtyIssued: 5, issueValue: 600, qtyBack: 0, sellRate: 100 });
    expect(r.marginPerUnit).toBe(-20);
    expect(r.belowCost).toBe(true);
  });
  it("no selling rate yet means no margin, not a loss", () => {
    const r = buyVsSell({ qtyIssued: 5, issueValue: 600, qtyBack: 0, sellRate: null });
    expect(r.marginPerUnit).toBeNull();
    expect(r.belowCost).toBe(false);
  });
});
