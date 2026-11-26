/** Navigation model shared by the sidebar and the command palette. Maintainer: Sirah Digital. */
import {
  LayoutDashboard, FileText, PhoneCall, ListChecks, Truck, FolderKanban, Receipt, ShoppingCart, Package,
  Building2, Users, Warehouse, FireExtinguisher, Wallet, Bot, Mail, NotebookPen, Settings, Bell, LifeBuoy, Undo2, ClipboardList, Wrench, LineChart, FileSpreadsheet,
  type LucideIcon,
} from "lucide-react";
import { canRead, type Module } from "@/lib/rbac";
import type { Role } from "@/lib/constants";

/** module null = open to every signed-in user. */
export type NavItem = { href: string; label: string; icon: LucideIcon; module: Module | null; keywords?: string };
export type NavGroup = { group: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  { group: "Overview", items: [
    { href: "/", label: "Dashboard", icon: LayoutDashboard, module: "dashboard", keywords: "home summary kpi" },
    { href: "/alerts", label: "Alerts", icon: Bell, module: "agents", keywords: "notifications attention" },
    { href: "/agents", label: "Automation Agents", icon: Bot, module: "agents", keywords: "rules automation" },
  ] },
  { group: "Sales", items: [
    { href: "/quotations", label: "Quotations", icon: FileText, module: "quotations", keywords: "quote estimate offer" },
    { href: "/boq-import", label: "Import BOQ", icon: FileSpreadsheet, module: "quotations", keywords: "excel consultant upload boq" },
    { href: "/follow-ups", label: "Follow-ups", icon: PhoneCall, module: "followups", keywords: "call reminder" },
    { href: "/boq-templates", label: "BOQ Templates", icon: ListChecks, module: "boq", keywords: "bill of quantities" },
    { href: "/orders", label: "Orders & Delivery", icon: Truck, module: "orders", keywords: "po purchase order challan dispatch" },
    { href: "/customers", label: "Customers", icon: Users, module: "customers", keywords: "clients" },
    { href: "/returns", label: "Returns", icon: Undo2, module: "returns", keywords: "credit note debit note sales return" },
    { href: "/refills", label: "Refill Tracker", icon: FireExtinguisher, module: "refills", keywords: "extinguisher refill" },
  ] },
  { group: "Service", items: [
    { href: "/amc", label: "AMC Contracts", icon: Wrench, module: "amc", keywords: "annual maintenance contract visits" },
    { href: "/service-calls", label: "Service Calls", icon: PhoneCall, module: "amc", keywords: "breakdown complaint ticket" },
  ] },
  { group: "Projects", items: [
    { href: "/projects", label: "Projects & Costing", icon: FolderKanban, module: "projects", keywords: "site margin" },
    { href: "/expenses", label: "Expenses", icon: Receipt, module: "expenses", keywords: "voucher claim" },
  ] },
  { group: "Purchase & Stock", items: [
    { href: "/purchase-orders", label: "Purchase Orders", icon: ClipboardList, module: "purchaseOrders", keywords: "vendor po indent" },
    { href: "/purchases", label: "Purchase Invoices", icon: ShoppingCart, module: "purchases", keywords: "bills supplier" },
    { href: "/items", label: "Item & Price Master", icon: Package, module: "items", keywords: "price master rate products" },
    { href: "/vendors", label: "Vendors", icon: Building2, module: "vendors", keywords: "suppliers" },
    { href: "/stock", label: "Stock", icon: Warehouse, module: "stock", keywords: "inventory store" },
  ] },
  { group: "Accounts", items: [
    { href: "/billing", label: "Billing & Outstanding", icon: Wallet, module: "billing", keywords: "invoice receivables payments" },
    { href: "/reports", label: "Profit & Reports", icon: LineChart, module: "reports", keywords: "p&l profit loss margin monthly" },
    { href: "/emails", label: "Email Outbox", icon: Mail, module: "emails", keywords: "mail" },
  ] },
  { group: "Admin", items: [
    { href: "/meeting-notes", label: "Meeting Notes", icon: NotebookPen, module: "meetings", keywords: "minutes" },
    { href: "/settings", label: "Settings & Users", icon: Settings, module: "settings", keywords: "configuration users" },
  ] },
  { group: "Support", items: [
    { href: "/help", label: "Help & Guides", icon: LifeBuoy, module: null, keywords: "manual how to guide support" },
  ] },
];

export const canSee = (role: Role, i: NavItem) => i.module == null || canRead(role, i.module);

export function navFor(role: Role): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => canSee(role, i)) })).filter((g) => g.items.length);
}

/** Best-matching nav entry for a pathname (longest prefix wins). */
export function navMatch(path: string): { group: string; item: NavItem } | null {
  let best: { group: string; item: NavItem } | null = null;
  for (const g of NAV) for (const i of g.items) {
    const hit = i.href === "/" ? path === "/" : path === i.href || path.startsWith(i.href + "/");
    if (hit && (!best || i.href.length > best.item.href.length)) best = { group: g.group, item: i };
  }
  return best;
}
