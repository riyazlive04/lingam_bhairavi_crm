import { describe, expect, it } from "vitest";
import { computeQuoteTotals, latestCost, lineMarginPct, linePriceWarning, parsePricingSettings, suggestRates } from "@/lib/pricing";

describe("latestCost (rule 1)", () => {
  it("prefers lastPurchaseRate, falls back to listPrice, then 0", () => {
    expect(latestCost({ lastPurchaseRate: 1650, listPrice: 1600 })).toBe(1650);
    expect(latestCost({ lastPurchaseRate: null, listPrice: 1600 })).toBe(1600);
    expect(latestCost({})).toBe(0);
  });
});

describe("suggestRates (rule 2)", () => {
  const item = { lastPurchaseRate: 1650, listPrice: 1600, markupPct: 30, erectionRate: 250 };
  it("quotation markup wins over item markup (QT-1)", () => {
    expect(suggestRates(item, 40)).toEqual({ costRate: 1650, supplyRate: 2310, erectionRate: 250 });
  });
  it("falls back to item markup, then default 40%", () => {
    expect(suggestRates(item).supplyRate).toBe(2145);
    expect(suggestRates({ listPrice: 1600 }).supplyRate).toBe(2240);
    expect(suggestRates({ listPrice: 1600 }).erectionRate).toBe(0);
  });
  it("uses listPrice when no purchase rate", () => {
    expect(suggestRates({ lastPurchaseRate: null, listPrice: 1000, erectionRate: null }, 25)).toEqual({ costRate: 1000, supplyRate: 1250, erectionRate: 0 });
  });
});

describe("computeQuoteTotals (rule 3)", () => {
  const lines = [
    { qty: 120, supplyRate: 2310, erectionRate: 250, costRate: 1650 },
    { qty: 0, supplyRate: 999, erectionRate: 99, costRate: 500 }, // excluded
    { qty: -5, supplyRate: 999, erectionRate: 99, costRate: 500 }, // excluded
  ];
  it("QT-1..QT-3 worked example at 18% GST", () => {
    const t = computeQuoteTotals(lines, 0, 18);
    expect(t).toMatchObject({ supply: 277200, erection: 30000, gross: 307200, discount: 0, taxable: 307200, tax: 55296, grand: 362496, cost: 198000, lineCount: 1 });
    expect(t.marginPct).toBe(28.57);
    expect(t.tax / 2).toBe(27648); // CGST = SGST
  });
  it("applies discount on supply+erection before GST", () => {
    const t = computeQuoteTotals(lines, 10, 18);
    expect(t.discount).toBe(30720);
    expect(t.taxable).toBe(276480);
    expect(t.tax).toBe(49766.4);
    expect(t.grand).toBe(326246.4);
  });
  it("zero GST and empty input", () => {
    expect(computeQuoteTotals(lines, 0, 0).grand).toBe(307200);
    expect(computeQuoteTotals([], 5, 18)).toMatchObject({ supply: 0, grand: 0, lineCount: 0, marginPct: 0 });
  });
  it("rounds per total, not per line", () => {
    const t = computeQuoteTotals([{ qty: 3, supplyRate: 33.333, erectionRate: 0 }, { qty: 1.5, supplyRate: 10.01, erectionRate: 0 }], 0, 18);
    expect(t.supply).toBe(115.01);
    expect(t.tax).toBe(20.7);
    expect(t.grand).toBe(135.71);
  });
});

describe("linePriceWarning / lineMarginPct", () => {
  it("flags below-cost and low-margin lines (QT-5)", () => {
    expect(lineMarginPct({ supplyRate: 1800, costRate: 1650 })).toBe(8.33);
    expect(linePriceWarning({ supplyRate: 1800, costRate: 1650 }, 15)).toBe("low_margin");
    expect(linePriceWarning({ supplyRate: 1600, costRate: 1650 }, 15)).toBe("below_cost");
    expect(linePriceWarning({ supplyRate: 2310, costRate: 1650 }, 15)).toBeNull();
    expect(linePriceWarning({ supplyRate: 100, costRate: 0 }, 15)).toBeNull();
    expect(linePriceWarning({ supplyRate: 100, costRate: null }, 15)).toBeNull();
  });
});

describe("parsePricingSettings", () => {
  it("defaults 40/15/18/30 and rejects junk", () => {
    expect(parsePricingSettings(null)).toEqual({ defaultMarkupPct: 40, minMarginPct: 15, gstPct: 18, quoteValidityDays: 30, approvalMode: "below_margin" });
    expect(parsePricingSettings({ defaultMarkupPct: "35", gstPct: 500, quoteValidityDays: 0 })).toEqual({ defaultMarkupPct: 35, minMarginPct: 15, gstPct: 18, quoteValidityDays: 30, approvalMode: "below_margin" });
  });
});
