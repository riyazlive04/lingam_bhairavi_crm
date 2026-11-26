"use client";
/**
 * Quick search (Ctrl/Cmd + K): jump to any module the user can open, or run a search in
 * quotations, customers, items or orders (plain GET ?q= searches on those pages). Also lists the
 * same "Quick create" actions as the top bar, so both stay in sync with nav.ts.
 */
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Search, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import { canRead, type Module } from "@/lib/rbac";
import type { Role } from "@/lib/constants";
import { navFor, quickCreateFor } from "./nav";

type Entry = { id: string; label: string; hint: string; href: string; icon?: LucideIcon; keywords: string };

const SEARCHES: { module: Module; label: string; path: string }[] = [
  { module: "quotations", label: "Quotations", path: "/quotations" },
  { module: "customers", label: "Customers", path: "/customers" },
  { module: "items", label: "Items", path: "/items" },
  { module: "orders", label: "Orders", path: "/orders" },
];

export function CommandPalette({ role, open, onClose }: { role: Role; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const pages = useMemo<Entry[]>(() => [
    ...quickCreateFor(role).map((q) => ({
      id: "new:" + q.href + q.label, label: q.label, hint: "Create", href: q.href, icon: q.icon, keywords: `${q.label} new create add ${q.keywords ?? ""}`.toLowerCase(),
    })),
    ...navFor(role).flatMap((g) => g.items.map((i) => ({
      id: "nav:" + i.href, label: i.label, hint: g.group, href: i.href, icon: i.icon, keywords: `${i.label} ${g.group} ${i.keywords ?? ""}`.toLowerCase(),
    }))),
  ], [role]);

  const term = q.trim();
  const entries = useMemo<Entry[]>(() => {
    const t = term.toLowerCase();
    const nav = t ? pages.filter((p) => t.split(/\s+/).every((w) => p.keywords.includes(w))) : pages;
    const searches: Entry[] = term
      ? SEARCHES.filter((s) => canRead(role, s.module)).map((s) => ({
        id: "search:" + s.path, label: `Search ${s.label} for "${term}"`, hint: "Search", href: `${s.path}?q=${encodeURIComponent(term)}`, icon: Search, keywords: "",
      }))
      : [];
    return [...nav, ...searches];
  }, [term, pages, role]);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setActive(0);
    const prev = document.activeElement as HTMLElement | null;
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.clearTimeout(id); document.body.style.overflow = overflow; prev?.focus?.(); };
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const go = (e: Entry | undefined) => {
    if (!e) return;
    onClose();
    router.push(e.href);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(entries.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); go(entries[active]); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "Tab") { e.preventDefault(); }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center px-3 pt-[10vh] sm:pt-[14vh]" onKeyDown={onKey}>
      <div className="absolute inset-0 bg-gray-950/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label="Quick search" className="ui-pop relative w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-lg">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="h-5 w-5 shrink-0 text-ink-faint" aria-hidden />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setActive(0); }}
            placeholder="Jump to a page or search quotes, customers, items…"
            className="h-14 w-full min-w-0 bg-transparent text-[15px] text-ink placeholder:text-ink-faint focus:outline-none"
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-list"
            aria-activedescendant={entries[active] ? `cmdk-${active}` : undefined}
            aria-autocomplete="list"
          />
          <kbd className="hidden rounded-md border border-line px-1.5 py-0.5 text-[11px] text-ink-soft sm:block">Esc</kbd>
        </div>
        <ul ref={listRef} id="cmdk-list" role="listbox" aria-label="Results" className="max-h-[min(60vh,420px)] overflow-y-auto p-2">
          {entries.length === 0 && <li className="px-3 py-8 text-center text-sm text-ink-soft">No matches. Try another word.</li>}
          {entries.map((e, i) => {
            const Icon = e.icon;
            return (
              <li
                key={e.id}
                id={`cmdk-${i}`}
                data-idx={i}
                role="option"
                aria-selected={i === active}
                onMouseMove={() => setActive(i)}
                onClick={() => go(e)}
                className={clsx("flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm",
                  i === active ? "bg-brand-50 text-brand-800 dark:bg-brand-950/60 dark:text-brand-100" : "text-ink")}
              >
                {Icon && <Icon className={clsx("h-4 w-4 shrink-0", i === active ? "text-brand-600 dark:text-brand-300" : "text-ink-soft")} aria-hidden />}
                <span className="min-w-0 flex-1 truncate">{e.label}</span>
                <span className="shrink-0 text-xs text-ink-soft">{e.hint}</span>
                {i === active && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-ink-soft" aria-hidden />}
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between gap-2 border-t border-line bg-surface-2 px-4 py-2 text-[11px] text-ink-soft">
          <span>Use ↑ ↓ to move, Enter to open</span>
          <span className="hidden sm:inline">Ctrl K or ⌘ K opens this anywhere</span>
        </div>
      </div>
    </div>
  );
}
