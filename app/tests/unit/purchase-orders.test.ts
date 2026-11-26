import { describe, expect, it } from "vitest";
import { computePoStatus, computePoTotals, defaultBuyRate, pendingReceipt, poReceivedPct, soLineToOrder } from "@/lib/purchase-orders";

describe("computePoStatus (rule 16)", () => {
  const lines = (...pairs: [number, number][]) => pairs.map(([qty, receivedQty]) => ({ qty, receivedQty }));
  it("sent until something is received, then partial, then received", () => {
    expect(computePoStatus("sent", lines([10, 0], [5, 0]))).toBe("sent");
    expect(computePoStatus("sent", lines([10, 4], [5, 0]))).toBe("partial");
    expect(computePoStatus("partial", lines([10, 10], [5, 2]))).toBe("partial");
    expect(computePoStatus("partial", lines([10, 10], [5, 5]))).toBe("received");
  });
  it("over-receipt still counts as received", () => {
    expect(computePoStatus("sent", lines([10, 12]))).toBe("received");
  });
  it("draft, closed and cancelled keep their status", () => {
    expect(computePoStatus("draft", lines([10, 10]))).toBe("draft");
    expect(computePoStatus("closed", lines([10, 2]))).toBe("closed");
    expect(computePoStatus("cancelled", lines([10, 0]))).toBe("cancelled");
  });
  it("ignores zero-qty lines and tolerates float noise", () => {
    expect(computePoStatus("sent", lines([0, 0], [3.3, 3.3 - 1e-9]))).toBe("received");
    expect(computePoStatus("received", lines([10, 0]))).toBe("sent");
  });
});

describe("poReceivedPct", () => {
  it("weights by quantity and caps over-receipts per line", () => {
    expect(poReceivedPct([{ qty: 10, receivedQty: 5 }, { qty: 10, receivedQty: 0 }])).toBe(25);
    expect(poReceivedPct([{ qty: 10, receivedQty: 15 }, { qty: 10, receivedQty: 0 }])).toBe(50);
    expect(poReceivedPct([])).toBe(0);
  });
  it("pendingReceipt never goes negative", () => {
    expect(pendingReceipt({ qty: 10, receivedQty: 4 })).toBe(6);
    expect(pendingReceipt({ qty: 10, receivedQty: 12 })).toBe(0);
  });
});

describe("soLineToOrder", () => {
  it("is qty minus delivered for pending lines", () => {
    expect(soLineToOrder({ qty: 120, deliveredQty: 20, deliveryStatus: "partial" })).toBe(100);
  });
  it("skips cancelled and delivered lines", () => {
    expect(soLineToOrder({ qty: 10, deliveredQty: 0, deliveryStatus: "cancelled" })).toBe(0);
    expect(soLineToOrder({ qty: 10, deliveredQty: 10, deliveryStatus: "delivered" })).toBe(0);
  });
  it("does not double-order what is already on live POs", () => {
    expect(soLineToOrder({ qty: 10, deliveredQty: 0, deliveryStatus: "ordered" }, 10)).toBe(0);
    expect(soLineToOrder({ qty: 10, deliveredQty: 3, deliveryStatus: "ordered" }, 5)).toBe(5);
    expect(soLineToOrder({ qty: 10, deliveredQty: 8, deliveryStatus: "partial" }, 5)).toBe(2);
  });
});

describe("defaultBuyRate and totals", () => {
  it("prefers the vendor's last rate, then latest cost, then 0", () => {
    expect(defaultBuyRate(2460, 2500)).toBe(2460);
    expect(defaultBuyRate(null, 2500)).toBe(2500);
    expect(defaultBuyRate(0, 2500)).toBe(2500);
    expect(defaultBuyRate(null, null)).toBe(0);
  });
  it("computes subtotal, GST and total ignoring zero-qty lines", () => {
    expect(computePoTotals([{ qty: 10, rate: 100, gstRate: 18 }, { qty: 2, rate: 50, gstRate: 12 }, { qty: 0, rate: 999, gstRate: 18 }]))
      .toEqual({ subtotal: 1100, taxAmount: 192, total: 1292 });
  });
});
