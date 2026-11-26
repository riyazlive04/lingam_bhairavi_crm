"use client";
/**
 * App chrome: brand sidebar with collapsible task groups (drawer on mobile), sticky top bar with
 * page context, quick create, quick search and alerts, and a bottom tab bar on phones and tablets.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Bell, ChevronDown, ChevronRight, ExternalLink, LogOut, Menu, Moon, Plus, Search, Sun, X } from "lucide-react";
import clsx from "clsx";
import { ROLES, type Role } from "@/lib/constants";
import { mobileTabsFor, navFor, navMatch, quickCreateFor } from "./nav";
import { CommandPalette } from "./command-palette";
import { ActionMenu, MenuLink } from "./patterns/action-menu";

const COLLAPSE_KEY = "lbe-nav-collapsed";

/** Collapsed sidebar groups, remembered in this browser. The group holding the current page always opens. */
function useCollapsedGroups() {
  const [collapsed, setCollapsed] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSE_KEY);
      const v: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(v)) setCollapsed(v.filter((x): x is string => typeof x === "string"));
    } catch { /* ignore broken or blocked storage */ }
  }, []);
  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);
  return { collapsed, toggle };
}

const SIRAH = "https://sirahdigital.in/";

function BrandMark({ className }: { className?: string }) {
  // Flame mark on a fire-red tile.
  return (
    <span className={clsx("grid shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm ring-1 ring-inset ring-white/10", className)} aria-hidden>
      <svg viewBox="0 0 24 24" className="h-[58%] w-[58%]" fill="currentColor">
        <path d="M12.6 2.2c.3 2.6-.8 4.3-2.2 5.9-1.5 1.7-3.2 3.4-3.2 6.4A4.9 4.9 0 0 0 12 19.5a4.9 4.9 0 0 0 4.8-5c0-1.9-.8-3.3-1.6-4.5.1 1.4-.4 2.6-1.4 3 .5-3.7-.5-7.6-1.2-10.8Z" opacity=".95" />
        <path d="M12 21.8c-3.9 0-7-2.8-7-6.6 0-1.1.3-2.2.8-3.2-.1 3.3 2.8 6.2 6.2 6.2s6.3-2.9 6.2-6.2c.5 1 .8 2.1.8 3.2 0 3.8-3.1 6.6-7 6.6Z" opacity=".55" />
      </svg>
    </span>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);
  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    setDark(t ? t === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    try { localStorage.setItem("lbe-theme", next ? "dark" : "light"); } catch { /* ignore */ }
  };
  return (
    <button type="button" onClick={toggle} aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} title="Toggle theme"
      className="grid h-9 w-9 place-items-center rounded-lg text-ink-soft hover:bg-muted hover:text-ink">
      {dark ? <Sun className="h-[18px] w-[18px]" aria-hidden /> : <Moon className="h-[18px] w-[18px]" aria-hidden />}
    </button>
  );
}

export function AppShell({ user, alertCount, demo, children }: { user: { name: string; role: Role }; alertCount: number; demo: boolean; children: ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const groups = navFor(user.role);
  const quick = quickCreateFor(user.role);
  const tabs = mobileTabsFor(user.role);
  const { collapsed, toggle } = useCollapsedGroups();
  const current = navMatch(path);
  const isActive = (href: string) => current?.item.href === href;
  // Letters only, so "Karthick (Owner)" becomes "KO", not "K(".
  const initials = user.name.replace(/[^\p{L}\s]/gu, " ").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "U";

  // Ctrl/Cmd + K anywhere opens quick search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close the mobile drawer on Escape and lock background scroll while it is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [open]);

  const nav = (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4 pt-1" aria-label="Main">
      {groups.map((g) => {
        const single = g.id === "home";
        const hasActive = g.items.some((i) => isActive(i.href));
        const isOpen = single || hasActive || !collapsed.includes(g.id);
        const listId = `nav-${g.id}`;
        return (
        <div key={g.id} className={clsx(!single && "pt-2")}>
          {!single && (
            <button
              type="button"
              onClick={() => toggle(g.id)}
              aria-expanded={isOpen}
              aria-controls={listId}
              className="flex w-full items-center justify-between rounded-md px-3 py-1 text-overline uppercase text-ink-faint hover:text-ink-soft"
            >
              <span>{g.group}</span>
              <ChevronDown className={clsx("icon-xs transition-transform", !isOpen && "-rotate-90")} aria-hidden />
            </button>
          )}
          <ul id={listId} hidden={!isOpen} className="mt-0.5 space-y-0.5">
            {g.items.map((i) => {
              const active = isActive(i.href);
              return (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={clsx(
                      "group relative flex items-center gap-3 rounded-lg px-3 py-[7px] text-sm transition-colors",
                      active
                        ? "bg-brand-50 font-semibold text-brand-800 dark:bg-brand-950/60 dark:text-brand-100"
                        : "font-medium text-ink-soft hover:bg-muted hover:text-ink",
                    )}
                  >
                    <span className={clsx("absolute inset-y-1.5 left-0 w-[3px] rounded-r-full transition-colors", active ? "bg-brand-600" : "bg-transparent")} aria-hidden />
                    <i.icon className={clsx("icon-md", active ? "text-brand-600 dark:text-brand-300" : "text-ink-faint group-hover:text-ink-soft")} aria-hidden />
                    <span className="truncate">{i.label}</span>
                    {i.href === "/alerts" && alertCount > 0 && (
                      <span className="ml-auto rounded-full bg-brand-600 px-1.5 text-[10px] font-semibold leading-4 text-white">{alertCount > 99 ? "99+" : alertCount}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
        );
      })}
    </nav>
  );

  const brand = (
    <Link href="/" className="flex items-center gap-3 rounded-xl px-4 py-4" onClick={() => setOpen(false)}>
      <BrandMark className="h-9 w-9" />
      <span className="min-w-0 leading-tight">
        <span className="block truncate font-display text-[15px] font-bold text-ink">Linga Bhairavi</span>
        <span className="block truncate text-[11px] font-medium text-ink-soft">Fire Safety CRM · Hosur</span>
      </span>
    </Link>
  );

  const footer = (
    <div className="border-t border-line p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-3 rounded-xl px-2 py-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-100 text-sm font-semibold text-accent-600 dark:bg-accent-600/20 dark:text-accent-400" aria-hidden>{initials}</span>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-semibold text-ink">{user.name}</div>
          <div className="truncate text-xs text-ink-soft">{ROLES[user.role]}</div>
        </div>
        <form action="/api/auth/logout" method="post">
          <button type="submit" aria-label="Sign out" title="Sign out" className="grid h-9 w-9 place-items-center rounded-lg text-ink-soft hover:bg-muted hover:text-ink">
            <LogOut className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </form>
      </div>
      <a href={SIRAH} target="_blank" rel="noopener" className="mt-1 flex items-center justify-center gap-1 rounded-md px-2 py-1 text-[11px] text-ink-soft hover:text-brand-700 dark:hover:text-brand-300">
        Built by <span className="font-semibold">Sirah Digital</span> <ExternalLink className="h-3 w-3" aria-hidden />
      </a>
    </div>
  );

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only z-[80] rounded-lg bg-brand-600 px-3 py-2 text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to content</a>

      {/* desktop sidebar */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-sidebar lg:flex">
        {brand}{nav}{footer}
      </aside>

      {/* mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-gray-950/50 backdrop-blur-[2px]" onClick={() => setOpen(false)} aria-hidden />
          <aside role="dialog" aria-modal="true" aria-label="Menu" className="ui-pop absolute inset-y-0 left-0 flex w-[min(20rem,86vw)] flex-col bg-sidebar shadow-lg">
            <div className="flex items-center justify-between pr-2">{brand}
              <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-lg hover:bg-muted"><X className="h-5 w-5" aria-hidden /></button>
            </div>
            {nav}{footer}
          </aside>
        </div>
      )}

      <div className="lg:pl-64 print:pl-0">
        <header className="no-print sticky top-0 z-20 border-b border-line bg-bg/80 backdrop-blur-md supports-[backdrop-filter]:bg-bg/70">
          <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-3 sm:gap-3 sm:px-6">
            <button type="button" aria-label="Open menu" onClick={() => setOpen(true)} className="grid h-10 w-10 place-items-center rounded-lg text-ink hover:bg-muted lg:hidden">
              <Menu className="h-5 w-5" aria-hidden />
            </button>
            <Link href="/" className="lg:hidden" aria-label="Dashboard"><BrandMark className="h-8 w-8" /></Link>

            <nav className="hidden min-w-0 items-center gap-1.5 text-sm md:flex" aria-label="Breadcrumb">
              <span className="text-ink-soft">{current?.group ?? "Workspace"}</span>
              <ChevronRight className="h-3.5 w-3.5 text-ink-faint" aria-hidden />
              <span className="truncate font-semibold text-ink">{current?.item.label ?? "Page"}</span>
              {demo && <span className="ml-2 rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-semibold text-accent-600 ring-1 ring-inset ring-accent-100 dark:bg-accent-600/15 dark:text-accent-400 dark:ring-accent-600/30">Demo data</span>}
            </nav>

            <div className="flex-1" />

            {quick.length > 0 && (
              <ActionMenu label="New" icon={Plus} variant="primary" className="shrink-0" menuClassName="w-60">
                <p className="px-2.5 pb-1 pt-1 text-overline uppercase text-ink-faint">Quick create</p>
                {quick.map((q) => <MenuLink key={q.href} href={q.href} icon={q.icon}>{q.label}</MenuLink>)}
              </ActionMenu>
            )}

            <button
              type="button"
              onClick={() => setPalette(true)}
              className="flex h-10 min-w-0 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm text-ink-soft shadow-xs hover:border-line-strong hover:text-ink sm:w-64 lg:w-80"
              aria-label="Quick search (Ctrl K)"
            >
              <Search className="h-4 w-4 shrink-0" aria-hidden />
              <span className="hidden truncate sm:inline">Search or jump to…</span>
              <kbd className="ml-auto hidden rounded-md border border-line bg-muted px-1.5 py-0.5 font-sans text-[11px] text-ink-soft sm:inline">Ctrl K</kbd>
            </button>
            <ThemeToggle />
            <Link href="/alerts" className="relative grid h-10 w-10 place-items-center rounded-lg text-ink-soft hover:bg-muted hover:text-ink" aria-label={`Alerts: ${alertCount} open`}>
              <Bell className="h-5 w-5" aria-hidden />
              {alertCount > 0 && (
                <span className="absolute right-0.5 top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold text-white ring-2 ring-bg">
                  {alertCount > 99 ? "99+" : alertCount}
                </span>
              )}
            </Link>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="pb-safe max-lg:pb-nav mx-auto max-w-7xl px-4 py-6 focus:outline-none sm:px-6 sm:py-8">{children}</main>
      </div>

      {/* Phone and tablet tab bar: four role-based destinations plus More (opens the drawer). */}
      <nav aria-label="Quick navigation" className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="mx-auto grid h-[3.75rem] max-w-xl grid-cols-5">
          {tabs.map((t) => {
            const active = isActive(t.href);
            return (
              <li key={t.href}>
                <Link href={t.href} aria-current={active ? "page" : undefined}
                  className={clsx("relative flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium",
                    active ? "text-brand-700 dark:text-brand-300" : "text-ink-soft hover:text-ink")}>
                  {active && <span className="absolute inset-x-5 top-0 h-0.5 rounded-b-full bg-brand-600" aria-hidden />}
                  <t.icon className="icon-lg" aria-hidden />
                  <span className="max-w-full truncate px-1">{shortLabel(t.label)}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <button type="button" onClick={() => setOpen(true)} aria-label={alertCount > 0 ? `More pages, ${alertCount} open alerts` : "More pages"} aria-haspopup="dialog"
              className="relative flex h-full w-full flex-col items-center justify-center gap-1 text-[11px] font-medium text-ink-soft hover:text-ink">
              <Menu className="icon-lg" aria-hidden />
              <span aria-hidden>More</span>
              {alertCount > 0 && <span className="absolute right-[calc(50%-1.1rem)] top-2 h-2 w-2 rounded-full bg-brand-600 ring-2 ring-surface" aria-hidden />}
            </button>
          </li>
        </ul>
      </nav>

      <CommandPalette role={user.role} open={palette} onClose={() => setPalette(false)} />
    </div>
  );
}

/** Short tab bar labels: "Orders & delivery" becomes "Orders", "Billing & outstanding" becomes "Billing". */
function shortLabel(label: string) {
  return label.split(/\s*&\s*/)[0];
}
