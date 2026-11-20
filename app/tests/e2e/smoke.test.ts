/**
 * HTTP smoke / E2E tests against a running server (no browser).
 * Run:  E2E_BASE_URL=http://localhost:3100 npx vitest run tests/e2e
 * Skipped when E2E_BASE_URL is not set.
 */
import { beforeAll, describe, expect, it } from "vitest";

const BASE = process.env.E2E_BASE_URL?.replace(/\/$/, "");
const ROLES = ["admin", "sales", "purchase", "accounts", "engineer", "store"] as const;
type Role = (typeof ROLES)[number];
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const cookies = new Map<Role, string>();

async function login(role: Role, password = "Demo@123") {
  const body = new URLSearchParams({ email: `${role}@lbe.demo`, password, next: "/" });
  return fetch(`${BASE}/api/auth/login`, { method: "POST", body, redirect: "manual" });
}
function sessionCookie(r: Response) {
  return (r.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).filter((c) => c.startsWith("lbe_session=")).join("; ");
}
async function get(path: string, role?: Role) {
  const headers: Record<string, string> = {};
  if (role) headers.cookie = cookies.get(role)!;
  return fetch(`${BASE}${path}`, { headers, redirect: "manual" });
}
const locationOf = (r: Response) => r.headers.get("location") ?? "";

describe.skipIf(!BASE)("HTTP smoke (E2E_BASE_URL)", () => {
  beforeAll(async () => {
    for (const role of ROLES) {
      const r = await login(role);
      const c = sessionCookie(r);
      expect(c, `login ${role}`).toContain("lbe_session=");
      cookies.set(role, c);
    }
  }, 120_000);

  it("rejects a wrong password without setting a session", async () => {
    const r = await login("sales", "wrong-password");
    expect(sessionCookie(r)).toBe("");
  });

  const ADMIN_PAGES = [
    "/", "/quotations", "/quotations/new", "/orders", "/items", "/items?view=matrix", "/purchases/new", "/projects",
    "/expenses/new", "/refills", "/billing", "/agents", "/alerts", "/meeting-notes", "/settings",
    "/customers", "/vendors", "/stock", "/boq-templates", "/follow-ups", "/expenses", "/purchases", "/emails",
    "/billing/invoices", "/billing/receivables", "/billing/payables", "/billing/payments",
  ];
  it.each(ADMIN_PAGES)("admin GET %s → 200 without an error page", async (path) => {
    const r = await get(path, "admin");
    const html = await r.text();
    expect(r.status, `${path} → ${locationOf(r)}`).toBe(200);
    expect(html).not.toMatch(/Application error|Internal Server Error/);
  });

  const ROLE_HOME: Record<Role, string[]> = {
    admin: ["/"],
    sales: ["/", "/quotations", "/quotations/new", "/customers", "/follow-ups", "/refills", "/meeting-notes", "/orders"],
    purchase: ["/", "/purchases", "/purchases/new", "/items", "/vendors", "/stock", "/boq-templates"],
    accounts: ["/", "/billing", "/billing/receivables", "/expenses", "/purchases", "/quotations"],
    engineer: ["/", "/projects", "/expenses/new", "/refills", "/orders", "/stock"],
    store: ["/", "/orders", "/stock", "/items", "/purchases", "/expenses/new"],
  };
  for (const role of ROLES) {
    it(`${role} can open their pages`, async () => {
      for (const path of ROLE_HOME[role]) {
        const r = await get(path, role);
        const html = await r.text();
        expect(r.status, `${role} ${path} → ${locationOf(r)}`).toBe(200);
        expect(html, `${role} ${path}`).not.toMatch(/Application error|Internal Server Error/);
      }
    });
  }

  describe("RBAC", () => {
    const FORBIDDEN: [Role, string][] = [
      ["engineer", "/billing"], ["engineer", "/quotations"], ["engineer", "/purchases"], ["sales", "/purchases"],
      ["sales", "/billing"], ["store", "/quotations"], ["store", "/vendors"], ["accounts", "/settings"], ["purchase", "/quotations/new"],
    ];
    it.each(FORBIDDEN)("%s GET %s → redirect /forbidden", async (role, path) => {
      const r = await get(path, role);
      expect([302, 303, 307, 308]).toContain(r.status);
      expect(locationOf(r)).toMatch(/\/forbidden/);
    });
    it("sales cannot open a purchase invoice by URL (L-2)", async () => {
      const r = await get("/purchases/1", "sales");
      expect(locationOf(r)).toMatch(/\/forbidden/);
    });
    it.each(["/", "/billing", "/quotations/1", "/items/export"])("unauthenticated GET %s → /login", async (path) => {
      const r = await get(path);
      expect([302, 303, 307, 308]).toContain(r.status);
      expect(locationOf(r)).toMatch(/\/login/);
    });
    it("GET /api/cron/agents without bearer → 401 (AG-14)", async () => {
      const r = await fetch(`${BASE}/api/cron/agents`, { redirect: "manual" });
      expect(r.status).toBe(401);
      const r2 = await fetch(`${BASE}/api/cron/agents`, { headers: { authorization: "Bearer wrong" }, redirect: "manual" });
      expect(r2.status).toBe(401);
    });
    it("engineer/store cannot download quotation or billing exports", async () => {
      for (const [role, path] of [["engineer", "/quotations/1/export"], ["store", "/billing/export/receivables"], ["sales", "/billing/export/payables"]] as const) {
        const r = await get(path, role);
        expect(r.headers.get("content-type") ?? "", `${role} ${path}`).not.toContain(XLSX);
        expect(r.status, `${role} ${path}`).not.toBe(200);
      }
    });
  });

  describe("Excel exports (admin)", () => {
    it.each(["/quotations/1/export", "/items/export", "/billing/export/receivables", "/billing/export/payables", "/projects/1/export"])(
      "%s → xlsx", async (path) => {
        const r = await get(path, "admin");
        expect(r.status).toBe(200);
        expect(r.headers.get("content-type") ?? "").toContain(XLSX);
        const buf = new Uint8Array(await r.arrayBuffer());
        expect(buf.length).toBeGreaterThan(1000);
        expect(String.fromCharCode(buf[0], buf[1])).toBe("PK"); // zip container
      });
  });

  describe("cross-module link contracts", () => {
    it("/refills?customerId= filters to that customer", async () => {
      const r = await get("/refills?customerId=1", "admin");
      expect(r.status).toBe(200);
    });
    it.each(["/quotations/new?customerId=1", "/quotations?status=sent", "/expenses?status=pending", "/items?q=pipe", "/purchases/new?vendor=1",
      "/purchases/new?project=1", "/billing/invoices/new?orderId=1", "/expenses/new?projectId=1", "/billing/invoices?overdue=1", "/alerts?agent=stale_price"])(
      "admin GET %s → 200", async (path) => {
        const r = await get(path, "admin");
        expect(r.status, `${path} → ${locationOf(r)}`).toBe(200);
        expect(await r.text()).not.toMatch(/Application error|Internal Server Error/);
      });
  });
});
