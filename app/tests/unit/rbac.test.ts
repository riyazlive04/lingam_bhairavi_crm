import { describe, expect, it } from "vitest";
import { ACCESS, canApproveExpenses, canRead, canSeeCost, canWrite, moduleForPath, type Module } from "@/lib/rbac";
import type { Role } from "@/lib/constants";

const ROLES: Role[] = ["admin", "sales", "purchase", "accounts", "engineer", "store"];
const MODULES = Object.keys(ACCESS) as Module[];

describe("RBAC matrix", () => {
  it("admin can read and write every module", () => {
    for (const m of MODULES) {
      expect(canRead("admin", m)).toBe(true);
      expect(canWrite("admin", m)).toBe(true);
    }
  });
  it("write implies read for every role/module", () => {
    for (const m of MODULES) for (const r of ROLES) if (canWrite(r, m)) expect(canRead(r, m), `${r}/${m}`).toBe(true);
  });
  it("engineer cannot read billing, quotations or purchases", () => {
    expect(canRead("engineer", "billing")).toBe(false);
    expect(canRead("engineer", "quotations")).toBe(false);
    expect(canRead("engineer", "purchases")).toBe(false);
    expect(canRead("engineer", "projects")).toBe(true);
    expect(canWrite("engineer", "expenses")).toBe(true);
  });
  it("store cannot see cost, quotations, billing or vendors", () => {
    expect(canSeeCost("store")).toBe(false);
    expect(canSeeCost("engineer")).toBe(false);
    expect(canSeeCost("purchase")).toBe(true);
    expect(canRead("store", "quotations")).toBe(false);
    expect(canRead("store", "billing")).toBe(false);
    expect(canRead("store", "vendors")).toBe(false);
    expect(canWrite("store", "orders")).toBe(true);
  });
  it("accounts can write billing and approve expenses; sales/engineer cannot approve", () => {
    expect(canWrite("accounts", "billing")).toBe(true);
    expect(canApproveExpenses("accounts")).toBe(true);
    expect(canApproveExpenses("admin")).toBe(true);
    expect(canApproveExpenses("sales")).toBe(false);
    expect(canApproveExpenses("engineer")).toBe(false);
    expect(canWrite("accounts", "quotations")).toBe(false);
  });
  it("sales cannot open purchase invoices or billing (L-2)", () => {
    expect(canRead("sales", "purchases")).toBe(false);
    expect(canRead("sales", "billing")).toBe(false);
  });
  it("only admin reads settings / users", () => {
    for (const r of ROLES.filter((x) => x !== "admin")) {
      expect(canRead(r, "settings")).toBe(false);
      expect(canRead(r, "users")).toBe(false);
    }
  });
  it("undefined role has no access", () => {
    expect(canRead(undefined, "dashboard")).toBe(false);
    expect(canWrite(undefined, "expenses")).toBe(false);
    expect(canSeeCost(undefined)).toBe(false);
  });
});

describe("moduleForPath", () => {
  it("maps URL prefixes", () => {
    expect(moduleForPath("/")).toBe("dashboard");
    expect(moduleForPath("/billing/invoices/3")).toBe("billing");
    expect(moduleForPath("/alerts")).toBe("agents");
    expect(moduleForPath("/meeting-notes/new")).toBe("meetings");
    expect(moduleForPath("/purchases")).toBe("purchases");
    expect(moduleForPath("/purchasesX")).toBeNull();
    expect(moduleForPath("/unknown")).toBeNull();
  });
});
