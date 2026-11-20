/** Role-based access control matrix. Maintainer: Sirah Digital. Edge-safe (no server imports). */
import type { Role } from "./constants";

export type Module =
  | "dashboard" | "quotations" | "followups" | "boq" | "orders" | "projects" | "expenses" | "purchases"
  | "items" | "vendors" | "customers" | "stock" | "refills" | "billing" | "agents" | "emails"
  | "meetings" | "settings" | "users";

type Access = { read: Role[]; write: Role[] };
const ALL: Role[] = ["admin", "sales", "purchase", "accounts", "engineer", "store"];

export const ACCESS: Record<Module, Access> = {
  dashboard: { read: ALL, write: ["admin"] },
  quotations: { read: ["admin", "sales", "accounts", "purchase"], write: ["admin", "sales"] },
  followups: { read: ["admin", "sales"], write: ["admin", "sales"] },
  boq: { read: ["admin", "sales", "purchase"], write: ["admin", "sales"] },
  orders: { read: ["admin", "sales", "purchase", "accounts", "store", "engineer"], write: ["admin", "sales", "store"] },
  projects: { read: ["admin", "sales", "accounts", "engineer", "purchase"], write: ["admin", "engineer"] },
  // everyone can submit expense vouchers; approval is restricted in code via canApproveExpenses
  expenses: { read: ALL, write: ALL },
  purchases: { read: ["admin", "purchase", "accounts", "store"], write: ["admin", "purchase", "accounts"] },
  items: { read: ALL, write: ["admin", "purchase"] },
  vendors: { read: ["admin", "purchase", "accounts"], write: ["admin", "purchase"] },
  customers: { read: ["admin", "sales", "accounts", "engineer"], write: ["admin", "sales", "accounts"] },
  stock: { read: ["admin", "store", "purchase", "engineer", "sales"], write: ["admin", "store"] },
  refills: { read: ["admin", "sales", "engineer", "accounts"], write: ["admin", "sales", "engineer"] },
  billing: { read: ["admin", "accounts"], write: ["admin", "accounts"] },
  agents: { read: ALL, write: ["admin"] },
  emails: { read: ["admin", "accounts"], write: ["admin", "accounts"] },
  meetings: { read: ["admin", "sales"], write: ["admin"] },
  settings: { read: ["admin"], write: ["admin"] },
  users: { read: ["admin"], write: ["admin"] },
};

export const canRead = (role: Role | undefined, m: Module) => !!role && ACCESS[m].read.includes(role);
export const canWrite = (role: Role | undefined, m: Module) => !!role && ACCESS[m].write.includes(role);
export const canApproveExpenses = (role: Role | undefined) => role === "admin" || role === "accounts";
/** Buying price / margin visibility (engineers & store must not see buying prices). */
export const canSeeCost = (role: Role | undefined) => role === "admin" || role === "purchase" || role === "accounts" || role === "sales";

/** URL prefix → module (used by middleware & nav). */
export const ROUTE_MODULES: [string, Module][] = [
  ["/quotations", "quotations"], ["/follow-ups", "followups"], ["/boq-templates", "boq"], ["/orders", "orders"],
  ["/projects", "projects"], ["/expenses", "expenses"], ["/purchases", "purchases"], ["/items", "items"],
  ["/vendors", "vendors"], ["/customers", "customers"], ["/stock", "stock"], ["/refills", "refills"],
  ["/billing", "billing"], ["/agents", "agents"], ["/alerts", "agents"], ["/emails", "emails"],
  ["/meeting-notes", "meetings"], ["/settings", "settings"],
];
export function moduleForPath(path: string): Module | null {
  for (const [p, m] of ROUTE_MODULES) if (path === p || path.startsWith(p + "/")) return m;
  return path === "/" ? "dashboard" : null;
}
