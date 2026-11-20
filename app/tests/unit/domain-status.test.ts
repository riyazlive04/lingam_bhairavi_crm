import { describe, expect, it } from "vitest";
import { computeNextDue, refillBucket } from "@/lib/refills";
import { computePurchaseTotals, lineAmount, purchaseOutstanding } from "@/lib/purchasing";
import { lineStatusFor, orderStatusFor } from "@/lib/orders";
import { ageingBucket, invoiceStatusFor, outstandingOf } from "@/lib/billing";

describe("refills (rule 8)", () => {
  it("computeNextDue (RF-1, RF-2, RF-3)", () => {
    expect(computeNextDue("2025-12-01", 12)).toBe("2026-12-01");
    expect(computeNextDue("2025-12-01", 36)).toBe("2028-12-01");
    expect(computeNextDue("2026-12-03", 12)).toBe("2027-12-03");
  });
  it("refillBucket: RF-1 enters the 10-day window on 21-11-2026, not 20-11", () => {
    expect(refillBucket("2026-12-01", "2026-11-21")).toBe("due10");
    expect(refillBucket("2026-12-01", "2026-11-20")).toBe("due30");
    expect(refillBucket("2026-11-20", "2026-11-21")).toBe("overdue");
    expect(refillBucket("2026-11-21", "2026-11-21")).toBe("due10");
    expect(refillBucket("2026-12-21", "2026-11-21")).toBe("due30");
    expect(refillBucket("2026-12-22", "2026-11-21")).toBe("later");
  });
});

describe("computePurchaseTotals", () => {
  it("sums line amounts and GST, skipping zero-qty lines", () => {
    const t = computePurchaseTotals([
      { qty: 10, rate: 1650, gstRate: 18 },
      { qty: 0, rate: 100, gstRate: 18 },
      { qty: 3, rate: 33.33, gstRate: 12 },
    ]);
    expect(t).toEqual({ subtotal: 16599.99, taxAmount: 2982, total: 19581.99 });
    expect(computePurchaseTotals([])).toEqual({ subtotal: 0, taxAmount: 0, total: 0 });
  });
  it("lineAmount / purchaseOutstanding", () => {
    expect(lineAmount({ qty: 2.5, rate: 10.01 })).toBe(25.03);
    expect(purchaseOutstanding({ total: 100, paidAmount: 120 })).toBe(0);
    expect(purchaseOutstanding({ total: 100, paidAmount: 40.5 })).toBe(59.5);
  });
});

describe("lineStatusFor / orderStatusFor (rule 7)", () => {
  it("line status from delivered qty", () => {
    expect(lineStatusFor(10, 10, "pending")).toBe("delivered");
    expect(lineStatusFor(10, 12, "pending")).toBe("delivered");
    expect(lineStatusFor(10, 4, "in_transit")).toBe("partial");
    expect(lineStatusFor(10, 0, "in_transit")).toBe("in_transit");
    expect(lineStatusFor(10, 0, "partial")).toBe("pending");
    expect(lineStatusFor(10, 0, "delivered")).toBe("pending");
    expect(lineStatusFor(10, 10, "cancelled")).toBe("cancelled");
    expect(lineStatusFor(0.3, 0.1 + 0.2, "pending")).toBe("delivered"); // float tolerance
  });
  it("order status from lines (SO-1, SO-5)", () => {
    const d = { deliveryStatus: "delivered", deliveredQty: 5 };
    const p = { deliveryStatus: "pending", deliveredQty: 0 };
    const c = { deliveryStatus: "cancelled", deliveredQty: 0 };
    expect(orderStatusFor([...Array(9).fill(d), p], "open")).toBe("partial");
    expect(orderStatusFor([d, d, c], "partial")).toBe("delivered");
    expect(orderStatusFor([p, p], "open")).toBe("open");
    expect(orderStatusFor([c], "open")).toBe("open");
    expect(orderStatusFor([d], "closed")).toBe("closed");
    expect(orderStatusFor([p], "cancelled")).toBe("cancelled");
  });
});

describe("invoiceStatusFor / ageingBucket (rule 6)", () => {
  it("paid within ₹0.50 tolerance", () => {
    expect(invoiceStatusFor(1000, 999.5, "issued")).toBe("paid");
    expect(invoiceStatusFor(1000, 999.4, "issued")).toBe("partially_paid");
    expect(invoiceStatusFor(362496, 100000, "issued")).toBe("partially_paid"); // SI-2
    expect(invoiceStatusFor(1000, 0, "partially_paid")).toBe("issued");
    expect(invoiceStatusFor(1000, 1000, "cancelled")).toBe("cancelled");
    expect(invoiceStatusFor(1000, 1000, "draft")).toBe("draft");
    expect(outstandingOf(362496, 100000)).toBe(262496);
    expect(outstandingOf(100, 200)).toBe(0);
  });
  it("ageing buckets (OS-1: 45 days → 31 to 60)", () => {
    expect(ageingBucket(-1)).toBe("notDue");
    expect(ageingBucket(0)).toBe("d0_30");
    expect(ageingBucket(30)).toBe("d0_30");
    expect(ageingBucket(31)).toBe("d31_60");
    expect(ageingBucket(45)).toBe("d31_60");
    expect(ageingBucket(90)).toBe("d61_90");
    expect(ageingBucket(91)).toBe("d90p");
  });
});
