import { describe, expect, it } from "vitest";
import {
  approvalAfterChange, approvalBlocks, approvalReasons, costAgeDays, costSnapshot, isCostStale, needsApproval, parseApprovalMode,
} from "@/lib/pricing";

describe("costSnapshot (rule 10)", () => {
  it("takes date and vendor from the last purchase", () => {
    expect(costSnapshot({ lastPurchaseRate: 2460, lastPurchaseDate: "2026-03-07", lastPurchaseVendorId: 4, listPrice: 2300 }))
      .toEqual({ costRate: 2460, costDate: "2026-03-07", costVendorId: 4, costSource: "purchase" });
  });
  it("falls back to the list price with no date", () => {
    expect(costSnapshot({ lastPurchaseRate: null, lastPurchaseDate: null, lastPurchaseVendorId: null, listPrice: 1600 }))
      .toEqual({ costRate: 1600, costDate: null, costVendorId: null, costSource: "list" });
  });
});

describe("stale prices", () => {
  it("uses 7 days for volatile items and 90 for others", () => {
    expect(costAgeDays("2026-11-18", "2026-11-26")).toBe(8);
    expect(isCostStale("2026-11-18", true, "2026-11-26")).toBe(true);
    expect(isCostStale("2026-11-19", true, "2026-11-26")).toBe(false);
    expect(isCostStale("2026-11-18", false, "2026-11-26")).toBe(false);
    expect(isCostStale("2026-08-27", false, "2026-11-26")).toBe(true);
  });
  it("never flags an undated cost", () => {
    expect(isCostStale(null, true, "2026-11-26")).toBe(false);
  });
});

describe("approval needed (rule 11)", () => {
  const healthy = [{ qty: 10, supplyRate: 140, erectionRate: 20, costRate: 100 }];
  const low = [{ qty: 10, supplyRate: 110, costRate: 100 }];
  const below = [{ qty: 10, supplyRate: 90, costRate: 100 }];
  const opts = { mode: "below_margin" as const, minMarginPct: 15 };
  it("off never needs approval, all always does", () => {
    expect(needsApproval(below, { ...opts, mode: "off" })).toBe(false);
    expect(needsApproval(healthy, { ...opts, mode: "all" })).toBe(true);
  });
  it("below_margin flags lines below cost or under the minimum", () => {
    expect(approvalReasons(healthy, opts)).toEqual([]);
    expect(approvalReasons(low, opts)[0]).toMatch(/under the 15% minimum margin/);
    expect(approvalReasons(below, opts)[0]).toMatch(/below cost/);
  });
  it("ignores zero-qty lines and lines without a cost", () => {
    expect(needsApproval([{ qty: 0, supplyRate: 1, costRate: 100 }, { qty: 5, supplyRate: 10, costRate: 0 }], opts)).toBe(false);
  });
  it("a big discount can push the whole quote under the minimum", () => {
    expect(needsApproval(healthy, { ...opts, discountPct: 20 })).toBe(true);
  });
  it("defaults the mode to below_margin", () => {
    expect(parseApprovalMode(undefined)).toBe("below_margin");
    expect(parseApprovalMode("all")).toBe("all");
    expect(parseApprovalMode("junk")).toBe("below_margin");
  });
});

describe("approval transitions", () => {
  it("blocks sending until approved when needed", () => {
    expect(approvalBlocks(true, "not_required")).toBe(true);
    expect(approvalBlocks(true, "pending")).toBe(true);
    expect(approvalBlocks(true, "approved")).toBe(false);
    expect(approvalBlocks(false, "rejected")).toBe(false);
  });
  it("editing an approved quote resets it to pending, or clears it when no longer needed", () => {
    expect(approvalAfterChange("approved", true)).toBe("pending");
    expect(approvalAfterChange("approved", false)).toBe("not_required");
    expect(approvalAfterChange("pending", true)).toBe("pending");
    expect(approvalAfterChange("rejected", true)).toBe("rejected");
    expect(approvalAfterChange("rejected", false)).toBe("not_required");
    expect(approvalAfterChange("not_required", true)).toBe("not_required");
  });
});
