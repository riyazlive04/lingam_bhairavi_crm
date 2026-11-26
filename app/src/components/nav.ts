/**
 * Navigation model shared by the sidebar, the mobile tab bar, the quick create menu and the
 * command palette. Groups follow the jobs people do (sell, deliver, buy, money...), not the
 * database tables. Every item keeps its own RBAC module. Maintainer: Sirah Digital.
 */
import {
  LayoutDashboard, FileText, PhoneCall, ListChecks, Truck, FolderKanban, Receipt, ShoppingCart, Package,
  Building2, Users, Warehouse, FireExtinguisher, Wallet, Bot, Mail, NotebookPen, Settings, Bell, LifeBuoy, Undo2,
  ClipboardList, Wrench, LineChart, FileSpreadsheet, HandCoins, Headset, Menu,
  type LucideIcon,
} from "lucide-react";
import { canRead, canWrite, type Module } from "@/lib/rbac";
import type { Role } from "@/lib/constants";

/** module null = open to every signed-in user. */
export type NavItem = { href: string; label: string; icon: LucideIcon; module: Module | null; keywords?: string };
/** `id` is stable (used as the localStorage key for the collapsed state); `group` is the visible label. */
export type NavGroup = { id: string; group: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  { id: "home", group: "Home", items: [
    { href: "/", label: "Home", icon: LayoutDashboard, module: "dashboard", keywords: "dashboard summary kpi today" },
  ] },
  { id: "sell", group: "Sell", items: [
    { href: "/quotations", label: "Quotations", icon: FileText, module: "quotations", keywords: "quote estimate offer approval" },
    { href: "/boq-import", label: "Import BOQ", icon: FileSpreadsheet, module: "quotations", keywords: "excel consultant upload boq" },
    { href: "/follow-ups", label: "Follow-ups", icon: PhoneCall, module: "followups", keywords: "call reminder" },
    { href: "/customers", label: "Customers", icon: Users, module: "customers", keywords: "clients" },
    { href: "/boq-templates", label: "BOQ templates", icon: ListChecks, module: "boq", keywords: "bill of quantities standard" },
  ] },
  { id: "deliver", group: "Deliver", items: [
    { href: "/orders", label: "Orders & delivery", icon: Truck, module: "orders", keywords: "customer po sales order challan dispatch" },
    { href: "/returns", label: "Returns", icon: Undo2, module: "returns", keywords: "credit note debit note sales return" },
  ] },
  { id: "buy", group: "Buy", items: [
    { href: "/purchase-orders", label: "Purchase orders", icon: ClipboardList, module: "purchaseOrders", keywords: "vendor po indent" },
    { href: "/purchases", label: "Purchase invoices", icon: ShoppingCart, module: "purchases", keywords: "bills supplier" },
    { href: "/vendors", label: "Vendors", icon: Building2, module: "vendors", keywords: "suppliers" },
    { href: "/items", label: "Item & price master", icon: Package, module: "items", keywords: "price master rate products" },
    { href: "/stock", label: "Stock", icon: Warehouse, module: "stock", keywords: "inventory store" },
  ] },
  { id: "money", group: "Money", items: [
    { href: "/billing", label: "Billing & outstanding", icon: Wallet, module: "billing", keywords: "invoice receivables payables payments" },
    { href: "/billing/advances", label: "Advances", icon: HandCoins, module: "billing", keywords: "advance receipt deposit" },
    { href: "/reports", label: "Reports & profit", icon: LineChart, module: "reports", keywords: "p&l profit loss margin monthly" },
    { href: "/emails", label: "Email outbox", icon: Mail, module: "emails", keywords: "mail" },
  ] },
  { id: "projects", group: "Projects & site", items: [
    { href: "/projects", label: "Projects", icon: FolderKanban, module: "projects", keywords: "site margin costing" },
    { href: "/expenses", label: "Expenses", icon: Receipt, module: "expenses", keywords: "voucher claim" },
  ] },
  { id: "service", group: "Service", items: [
    { href: "/amc", label: "AMC", icon: Wrench, module: "amc", keywords: "annual maintenance contract visits" },
    { href: "/service-calls", label: "Service calls", icon: Headset, module: "amc", keywords: "breakdown complaint ticket" },
    { href: "/refills", label: "Refills", icon: FireExtinguisher, module: "refills", keywords: "extinguisher refill tracker" },
  ] },
  { id: "automation", group: "Automation", items: [
    { href: "/alerts", label: "Alerts", icon: Bell, module: "agents", keywords: "notifications attention" },
    { href: "/agents", label: "Automation agents", icon: Bot, module: "agents", keywords: "rules automation" },
  ] },
  { id: "admin", group: "Admin", items: [
    { href: "/meeting-notes", label: "Meeting notes", icon: NotebookPen, module: "meetings", keywords: "minutes" },
    { href: "/settings", label: "Settings & users", icon: Settings, module: "settings", keywords: "configuration users" },
    { href: "/help", label: "Help", icon: LifeBuoy, module: null, keywords: "manual how to guide support" },
  ] },
];

export const canSee = (role: Role, i: NavItem) => i.module == null || canRead(role, i.module);

export function navFor(role: Role): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => canSee(role, i)) })).filter((g) => g.items.length);
}

/** Best-matching nav entry for a pathname (longest prefix wins, so /billing/advances beats /billing). */
export function navMatch(path: string): { group: string; item: NavItem } | null {
  let best: { group: string; item: NavItem } | null = null;
  for (const g of NAV) for (const i of g.items) {
    const hit = i.href === "/" ? path === "/" : path === i.href || path.startsWith(i.href + "/");
    if (hit && (!best || i.href.length > best.item.href.length)) best = { group: g.group, item: i };
  }
  return best;
}

// ---------------------------------------------------------------- quick create (top bar "New" menu)

/** Shown only when the user can WRITE the module. Also listed in the command palette. */
export type QuickCreate = { href: string; label: string; icon: LucideIcon; module: Module; keywords?: string };
export const QUICK_CREATE: QuickCreate[] = [
  { href: "/quotations/new", label: "New quotation", icon: FileText, module: "quotations", keywords: "quote create" },
  { href: "/boq-import", label: "Import BOQ", icon: FileSpreadsheet, module: "quotations", keywords: "excel upload" },
  { href: "/billing/payments", label: "Record payment", icon: Wallet, module: "billing", keywords: "receipt collect pay" },
  { href: "/billing/advances", label: "Record advance", icon: HandCoins, module: "billing", keywords: "deposit" },
  { href: "/expenses/new", label: "New expense", icon: Receipt, module: "expenses", keywords: "voucher claim" },
  { href: "/service-calls/new", label: "New service call", icon: Headset, module: "amc", keywords: "complaint breakdown ticket" },
];
export const quickCreateFor = (role: Role) => QUICK_CREATE.filter((q) => canWrite(role, q.module));

// ---------------------------------------------------------------- mobile bottom tab bar

/** Preferred phone destinations per role (first 4 the role can read are shown, then "More"). */
const MOBILE_PREF: Record<Role, string[]> = {
  admin: ["/", "/quotations", "/orders", "/billing"],
  sales: ["/", "/quotations", "/follow-ups", "/orders"],
  purchase: ["/", "/purchase-orders", "/purchases", "/stock"],
  accounts: ["/", "/billing", "/expenses", "/reports"],
  engineer: ["/", "/projects", "/expenses", "/service-calls"],
  store: ["/", "/orders", "/stock", "/returns"],
};
/** Fallback order when a preferred page is not readable for some reason. */
const MOBILE_FALLBACK = ["/", "/quotations", "/orders", "/projects", "/expenses", "/stock", "/billing", "/alerts"];

export function mobileTabsFor(role: Role): NavItem[] {
  const all = new Map(NAV.flatMap((g) => g.items).map((i) => [i.href, i]));
  const out: NavItem[] = [];
  for (const href of [...MOBILE_PREF[role], ...MOBILE_FALLBACK]) {
    const it = all.get(href);
    if (it && canSee(role, it) && !out.includes(it)) out.push(it);
    if (out.length === 4) break;
  }
  return out;
}
export const MORE_ICON = Menu;
