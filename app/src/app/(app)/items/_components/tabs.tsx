import Link from "next/link";
import { cx } from "@/components/ui";

/** Link-based tabs (server component). Shared by Team A modules. */
export function LinkTabs({ tabs, label = "Views" }: { tabs: { href: string; label: string; active: boolean; count?: number }[]; label?: string }) {
  return (
    <nav aria-label={label} className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={cx(
            "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            t.active ? "border-brand-600 text-brand-700 dark:text-brand-300" : "border-transparent text-ink-soft hover:text-ink",
          )}
        >
          {t.label}
          {t.count != null && <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs text-ink-soft">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

/** Builds a query string from a record, skipping empty values. */
export function qs(params: Record<string, string | number | undefined | null>) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
}

/** Simple prev/next pager. */
export function Pager({ page, pages, href }: { page: number; pages: number; href: (p: number) => string }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm text-ink-soft">
      {page > 1 ? <Link className="rounded-lg border border-line bg-surface px-3 py-1.5 hover:bg-muted" href={href(page - 1)}>← Previous</Link> : <span />}
      <span>Page {page} of {pages}</span>
      {page < pages ? <Link className="rounded-lg border border-line bg-surface px-3 py-1.5 hover:bg-muted" href={href(page + 1)}>Next →</Link> : <span />}
    </nav>
  );
}
