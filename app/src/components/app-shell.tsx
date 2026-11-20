"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  LayoutDashboard, FileText, PhoneCall, ListChecks, Truck, FolderKanban, Receipt, ShoppingCart, Package,
  Building2, Users, Warehouse, FireExtinguisher, Wallet, Bot, Mail, NotebookPen, Settings, Menu, X, LogOut, Bell,
} from "lucide-react";
import clsx from "clsx";
import { canRead, type Module } from "@/lib/rbac";
import { ROLES, type Role } from "@/lib/constants";

type NavItem = { href: string; label: string; icon: typeof FileText; module: Module };
const NAV: { group: string; items: NavItem[] }[] = [
  { group: "Overview", items: [
    { href: "/", label: "Dashboard", icon: LayoutDashboard, module: "dashboard" },
    { href: "/agents", label: "Automation Agents", icon: Bot, module: "agents" },
  ] },
  { group: "Sales", items: [
    { href: "/quotations", label: "Quotations", icon: FileText, module: "quotations" },
    { href: "/follow-ups", label: "Follow-ups", icon: PhoneCall, module: "followups" },
    { href: "/boq-templates", label: "BOQ Templates", icon: ListChecks, module: "boq" },
    { href: "/orders", label: "Orders & Delivery", icon: Truck, module: "orders" },
    { href: "/customers", label: "Customers", icon: Users, module: "customers" },
    { href: "/refills", label: "Refill Tracker", icon: FireExtinguisher, module: "refills" },
  ] },
  { group: "Projects", items: [
    { href: "/projects", label: "Projects & Costing", icon: FolderKanban, module: "projects" },
    { href: "/expenses", label: "Expenses", icon: Receipt, module: "expenses" },
  ] },
  { group: "Purchase & Stock", items: [
    { href: "/purchases", label: "Purchase Invoices", icon: ShoppingCart, module: "purchases" },
    { href: "/items", label: "Item & Price Master", icon: Package, module: "items" },
    { href: "/vendors", label: "Vendors", icon: Building2, module: "vendors" },
    { href: "/stock", label: "Stock", icon: Warehouse, module: "stock" },
  ] },
  { group: "Accounts", items: [
    { href: "/billing", label: "Billing & Outstanding", icon: Wallet, module: "billing" },
    { href: "/emails", label: "Email Outbox", icon: Mail, module: "emails" },
  ] },
  { group: "Admin", items: [
    { href: "/meeting-notes", label: "Meeting Notes", icon: NotebookPen, module: "meetings" },
    { href: "/settings", label: "Settings & Users", icon: Settings, module: "settings" },
  ] },
];

export function AppShell({ user, alertCount, demo, children }: { user: { name: string; role: Role }; alertCount: number; demo: boolean; children: ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

  const nav = (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Main">
      {NAV.map((g) => {
        const items = g.items.filter((i) => canRead(user.role, i.module));
        if (!items.length) return null;
        return (
          <div key={g.group}>
            <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{g.group}</div>
            <ul className="space-y-0.5">
              {items.map((i) => (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    onClick={() => setOpen(false)}
                    aria-current={isActive(i.href) ? "page" : undefined}
                    className={clsx(
                      "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors",
                      isActive(i.href) ? "bg-brand-50 font-medium text-brand-700 dark:bg-brand-800/30 dark:text-brand-200" : "text-ink-soft hover:bg-muted hover:text-ink",
                    )}
                  >
                    <i.icon className="h-4 w-4 shrink-0" aria-hidden />
                    {i.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );

  const brand = (
    <Link href="/" className="flex items-center gap-2 px-4 py-4">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">LB</span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold text-ink">Linga Bhairavi</span>
        <span className="block text-[11px] text-ink-soft">Fire Safety CRM</span>
      </span>
    </Link>
  );

  const footer = (
    <div className="border-t border-line p-3">
      <div className="px-2 text-sm font-medium text-ink">{user.name}</div>
      <div className="px-2 text-xs text-ink-soft">{ROLES[user.role]}</div>
      <form action="/api/auth/logout" method="post" className="mt-2">
        <button className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-ink-soft hover:bg-muted hover:text-ink">
          <LogOut className="h-4 w-4" aria-hidden /> Sign out
        </button>
      </form>
    </div>
  );

  return (
    <div className="min-h-dvh">
      {/* desktop sidebar */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface lg:flex">
        {brand}{nav}{footer}
      </aside>
      {/* mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-surface shadow-xl">
            <div className="flex items-center justify-between pr-2">{brand}
              <button aria-label="Close menu" onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-muted"><X className="h-5 w-5" /></button>
            </div>
            {nav}{footer}
          </aside>
        </div>
      )}
      <div className="lg:pl-60 print:pl-0">
        <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur">
          <button aria-label="Open menu" onClick={() => setOpen(true)} className="rounded-lg p-2 hover:bg-muted lg:hidden"><Menu className="h-5 w-5" /></button>
          <div className="flex-1 truncate text-sm text-ink-soft">
            {demo && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">Demo data</span>}
          </div>
          <Link href="/alerts" className="relative rounded-lg p-2 text-ink-soft hover:bg-muted hover:text-ink" aria-label={`${alertCount} open alerts`}>
            <Bell className="h-5 w-5" />
            {alertCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold text-white">
                {alertCount > 99 ? "99+" : alertCount}
              </span>
            )}
          </Link>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
