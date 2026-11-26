import { describe, expect, it } from "vitest";
import {
  gstSummary, isIntraState, maxAdjustable, noteBalance, returnTotals, returnableQty, vendorReturnableQty, weightedCost,
} from "@/lib/returns";
import { applyCredits, netDueOf, receiptNumber, type PartyOutstanding } from "@/lib/billing";
import { lineStatusFor, netDeliveredQty, orderStatusFor, pendingQtyOf } from "@/lib/orders";

describe("returnable qty (rules 13, 14)", () => {
  it("customer side is delivered minus returned, never negative", () => {
    expect(returnableQty(10, 0)).toBe(10);
    expect(returnableQty(10, 3)).toBe(7);
    expect(returnableQty(10, 10)).toBe(0);
    expect(returnableQty(2, 5)).toBe(0);
    expect(returnableQty(0.3, 0.1)).toBeCloseTo(0.2, 6);
  });
  it("vendor side is billed minus returned, capped by stock on hand", () => {
    expect(vendorReturnableQty(10, 2)).toBe(8);
    expect(vendorReturnableQty(10, 2, 5)).toBe(5);
    expect(vendorReturnableQty(10, 2, 50)).toBe(8);
    expect(vendorReturnableQty(10, 2, -3)).toBe(0);
    expect(vendorReturnableQty(3, 4)).toBe(0);
  });
});

describe("note totals and balances", () => {
  it("drops zero lines and adds GST per line", () => {
    const t = returnTotals([{ qty: 2, rate: 1000, gstRate: 18 }, { qty: 0, rate: 500, gstRate: 18 }, { qty: 1, rate: 99.999, gstRate: 12 }]);
    expect(t.lines).toHaveLength(2);
    expect(t.subtotal).toBe(2100);
    expect(t.taxAmount).toBe(372);
    expect(t.total).toBe(2472);
  });
  it("balance and max adjustable", () => {
    expect(noteBalance(1000, 400)).toBe(600);
    expect(noteBalance(1000, 1200)).toBe(0);
    expect(maxAdjustable(600, 250)).toBe(250);
    expect(maxAdjustable(600, 900)).toBe(600);
    expect(maxAdjustable(0, 900)).toBe(0);
  });
  it("GST split: CGST/SGST halves intra state, IGST otherwise", () => {
    const lines = [{ amount: 1000, gstRate: 18 }, { amount: 500, gstRate: 18 }, { amount: 100, gstRate: 5 }];
    const intra = gstSummary(lines, true);
    expect(intra.map((r) => r.rate)).toEqual([5, 18]);
    expect(intra[1]).toMatchObject({ taxable: 1500, tax: 270, cgst: 135, sgst: 135, igst: 0 });
    const inter = gstSummary(lines, false);
    expect(inter[1]).toMatchObject({ igst: 270, cgst: 0, sgst: 0 });
    expect(isIntraState({ gstin: "33AAAAA0000A1Z5", state: "Tamil Nadu" }, { gstin: "29BBBBB0000B1Z5", state: "Karnataka" })).toBe(false);
    expect(isIntraState({ gstin: "33AAAAA0000A1Z5" }, { gstin: "33CCCCC0000C1Z5" })).toBe(true);
    expect(isIntraState({ state: "Tamil Nadu" }, { state: " tamil nadu " })).toBe(true);
    expect(isIntraState({ state: "Tamil Nadu" }, { state: null })).toBe(true);
  });
  it("weighted delivery cost ignores rows without a cost", () => {
    expect(weightedCost([{ qty: 2, costRate: 100 }, { qty: 2, costRate: 200 }])).toBe(150);
    expect(weightedCost([{ qty: 5, costRate: 0 }, { qty: 1, costRate: 80 }])).toBe(80);
    expect(weightedCost([{ qty: 5, costRate: 0 }])).toBeNull();
  });
});

describe("net delivered (rule 13) and line status", () => {
  it("returned goods no longer count as delivered", () => {
    expect(netDeliveredQty(10, 2)).toBe(8);
    expect(netDeliveredQty(10, null)).toBe(10);
    expect(pendingQtyOf({ qty: 10, deliveredQty: 10, returnedQty: 3 })).toBe(3);
    expect(pendingQtyOf({ qty: 10, deliveredQty: 4 })).toBe(6);
    expect(lineStatusFor(10, netDeliveredQty(10, 10), "delivered")).toBe("pending");
    expect(lineStatusFor(10, netDeliveredQty(10, 3), "delivered")).toBe("partial");
    expect(lineStatusFor(10, netDeliveredQty(13, 3), "partial")).toBe("delivered");
    expect(orderStatusFor([{ deliveryStatus: "pending", deliveredQty: netDeliveredQty(5, 5) }], "delivered")).toBe("open");
  });
});

describe("outstanding math (rules 13 to 15)", () => {
  const row = (partyId: number, outstanding: number): PartyOutstanding => ({
    partyId, name: `P${partyId}`, email: null, phone: null, invoiceCount: 1, outstanding, overdue: 0, dueNext7: 0,
    ageing: { notDue: outstanding, d0_30: 0, d31_60: 0, d61_90: 0, d90p: 0 }, maxDaysOverdue: 0, oldestDueDate: null,
    invoicesDue: outstanding, creditNotes: 0, debitNotes: 0, advances: 0, netDue: outstanding,
  });
  it("net due = invoices - credit notes - advances", () => {
    expect(netDueOf(10000, 1500, 2500)).toBe(6000);
    expect(netDueOf(1000, 0, 1500)).toBe(-500);
  });
  it("folds credits into party rows and adds credit-only parties", () => {
    const parties = new Map([[1, { name: "A", email: null, phone: null }], [2, { name: "B", email: null, phone: null }]]);
    const out = applyCredits([row(1, 10000)], [
      { partyId: 1, creditNotes: 1000 }, { partyId: 1, advances: 2500 }, { partyId: 2, advances: 4000 },
    ], parties);
    expect(out.find((r) => r.partyId === 1)).toMatchObject({ outstanding: 10000, invoicesDue: 10000, creditNotes: 1000, advances: 2500, netDue: 6500 });
    expect(out.find((r) => r.partyId === 2)).toMatchObject({ name: "B", invoiceCount: 0, outstanding: 0, advances: 4000, netDue: -4000 });
  });
  it("vendor debit notes reduce net payable", () => {
    const out = applyCredits([row(7, 5000)], [{ partyId: 7, debitNotes: 1200 }], new Map());
    expect(out[0]).toMatchObject({ debitNotes: 1200, netDue: 3800 });
  });
  it("receipt numbers are computed from the id and financial year", () => {
    expect(receiptNumber({ id: 42, date: "2026-11-20" })).toBe("LBE/RCPT/2026-27/0042");
    expect(receiptNumber({ id: 7, date: "2027-02-01" })).toBe("LBE/RCPT/2026-27/0007");
    expect(receiptNumber({ id: 12345, date: "2027-04-01" })).toBe("LBE/RCPT/2027-28/12345");
  });
});
