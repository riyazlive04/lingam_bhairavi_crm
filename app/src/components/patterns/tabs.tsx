/** Link-based tabs (server-safe). The selected tab lives in the URL (?tab=) so it is shareable. */
import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "../ui";

export type TabItem = { id: string; label: ReactNode; count?: number; href?: string; /** red dot for "needs attention" */ alert?: boolean };

/**
 * Builds the href for a tab: keeps the other search params, drops ok / err flash params,
 * and omits ?tab= for the first (default) tab.
 */
export function tabHref(basePath: string, params: Record<string, string | undefined>, tab: string, defaultTab?: string): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v && k !== "tab" && k !== "ok" && k !== "err") p.set(k, v);
  if (tab !== defaultTab) p.set("tab", tab);
  const s = p.toString();
  return s ? `${basePath}?${s}` : basePath;
}

/** Picks a valid tab id from ?tab=, falling back to the first tab. */
export function activeTab<T extends string>(value: string | undefined, ids: readonly T[]): T {
  return (ids as readonly string[]).includes(value ?? "") ? (value as T) : ids[0];
}

/**
 * @example
 * const tab = activeTab(sp.tab, ["lines", "deliveries", "billing"] as const);
 * <Tabs basePath={`/orders/${o.id}`} params={sp} active={tab} items={[
 *   { id: "lines", label: "Lines", count: lines.length },
 *   { id: "deliveries", label: "Deliveries", count: dels.length },
 * ]} />
 */
export function Tabs({ items, active, basePath, params = {}, label = "Sections", className }: {
  items: TabItem[]; active: string; basePath?: string; params?: Record<string, string | undefined>; label?: string; className?: string;
}) {
  const first = items[0]?.id;
  return (
    <nav aria-label={label} className={cx("no-print -mx-1 overflow-x-auto px-1", className)}>
      <div className="flex min-w-max gap-1 border-b border-line">
        {items.map((t) => {
          const on = t.id === active;
          const href = t.href ?? tabHref(basePath ?? "", params, t.id, first);
          return (
            <Link
              key={t.id}
              href={href}
              scroll={false}
              aria-current={on ? "page" : undefined}
              className={cx(
                "-mb-px inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-t-md border-b-2 px-3 text-sm font-medium transition-colors",
                on ? "border-brand-600 text-brand-700 dark:text-brand-300" : "border-transparent text-ink-soft hover:border-line-strong hover:text-ink",
              )}
            >
              {t.label}
              {t.count != null && (
                <span className={cx("rounded-full px-1.5 text-[11px] leading-[18px] tabular-nums",
                  on ? "bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-200" : "bg-muted text-ink-soft")}>{t.count}</span>
              )}
              {t.alert && <span className="h-1.5 w-1.5 rounded-full bg-danger" aria-label="Needs attention" />}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
