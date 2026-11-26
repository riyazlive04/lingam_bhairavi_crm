"use client";
/**
 * Button-based twins of FilterPills and Tabs, for state that lives in the page rather than the URL
 * (the BOQ review filters and sheet tabs). Same look as the link versions. Client.
 * Maintainer: Sirah Digital.
 */
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "../ui";

export type ClientPillItem<T extends string | number> = { id: T; label: ReactNode; count?: number; /** amber, needs action */ attention?: boolean };

/**
 * Segmented filter made of toggle buttons (aria-pressed). Scrolls sideways on phones.
 * @example <ClientPills label="Show rows" items={[{ id: "all", label: "All rows", count: 40 }]} active={filter} onChange={setFilter} />
 */
export function ClientPills<T extends string | number>({ items, active, onChange, label, className }: {
  items: ClientPillItem<T>[]; active: T; onChange: (id: T) => void; label: string; className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cx("-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1", className)}>
      {items.map((it) => {
        const on = it.id === active;
        return (
          <button
            key={String(it.id)}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(it.id)}
            className={cx(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors",
              on ? "border-brand-600 bg-brand-600 text-white shadow-xs"
                : it.attention ? "border-warning-line bg-warning-soft text-warning hover:border-warning"
                  : "border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink",
            )}
          >
            {it.label}
            {it.count != null && (
              <span className={cx("rounded-full px-1.5 text-[11px] leading-[18px] tabular-nums", on ? "bg-white/20 text-white" : "bg-muted text-ink-soft")}>{it.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export type ClientTabItem<T extends string | number> = { id: T; label: ReactNode; count?: number; alert?: boolean };

/** The DOM id of a ClientTabs tab, for the panel's aria-labelledby. */
export const clientTabId = (idPrefix: string, id: string | number) => `${idPrefix}-tab-${id}`;

/**
 * Tabs (role=tablist) that switch in-page state. Arrow keys, Home and End move between tabs.
 * Give the panel `id={panelId}`, `role="tabpanel"` and `aria-labelledby={clientTabId(idPrefix, active)}`.
 * @example
 * const id = useId();
 * <ClientTabs label="Sheets in this BOQ" idPrefix={id} panelId={`${id}-panel`} active={tab} onChange={setTab}
 *   items={sheets.map((s, i) => ({ id: i, label: s.name, count: counts[i] }))} />
 * <div id={`${id}-panel`} role="tabpanel" aria-labelledby={clientTabId(id, tab)}>...</div>
 */
export function ClientTabs<T extends string | number>({ items, active, onChange, label, idPrefix, panelId, className }: {
  items: ClientTabItem<T>[]; active: T; onChange: (id: T) => void; label: string; idPrefix: string; panelId?: string; className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const last = items.length - 1;
    const next = e.key === "ArrowRight" ? (i === last ? 0 : i + 1)
      : e.key === "ArrowLeft" ? (i === 0 ? last : i - 1)
        : e.key === "Home" ? 0 : e.key === "End" ? last : -1;
    if (next < 0) return;
    e.preventDefault();
    onChange(items[next].id);
    refs.current[next]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className={cx("flex gap-1 overflow-x-auto border-b border-line", className)}>
      {items.map((t, i) => {
        const on = t.id === active;
        return (
          <button
            key={String(t.id)}
            ref={(el) => { refs.current[i] = el; }}
            id={clientTabId(idPrefix, t.id)}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={panelId}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={cx(
              "-mb-px inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors",
              on ? "border-brand-600 text-brand-700 dark:text-brand-300" : "border-transparent text-ink-soft hover:border-line-strong hover:text-ink",
            )}
          >
            {t.label}
            {t.count != null && (
              <span className={cx("rounded-full px-1.5 text-[11px] leading-[18px] tabular-nums",
                on ? "bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-200" : "bg-muted text-ink-soft")}>{t.count}</span>
            )}
            {t.alert && <span className="h-1.5 w-1.5 rounded-full bg-danger" aria-label="Needs attention" />}
          </button>
        );
      })}
    </div>
  );
}
