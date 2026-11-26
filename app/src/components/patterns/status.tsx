/** Status chips and link-based filter pills (server-safe). Maintainer: Sirah Digital. */
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, cx } from "../ui";
import { SEMANTIC_TONE, statusLabel, statusSemantic, type StatusSemantic } from "./status-tones";

/**
 * The one status chip. Colour follows the shared vocabulary (status-tones.ts).
 * Pass `semantic` for a derived state that is not a stored status, e.g. "Late" or "Below margin".
 * @example <StatusPill status={o.status} />
 * @example <StatusPill status="overdue" label="3 days late" />
 * @example <StatusPill semantic="warning" label="Awaiting approval" />
 */
export function StatusPill({ status, label, semantic, className, noDot }: {
  status?: string; label?: ReactNode; semantic?: StatusSemantic; className?: string; noDot?: boolean;
}) {
  const sem = semantic ?? (status ? statusSemantic(status) : "neutral");
  return <Badge tone={SEMANTIC_TONE[sem]} dot={!noDot} className={className}>{label ?? (status ? statusLabel(status) : "")}</Badge>;
}

export type FilterPillItem = {
  label: ReactNode;
  href: string;
  active: boolean;
  count?: number;
  /** Small secondary text after the count, e.g. a money total. Hidden on phones. */
  hint?: ReactNode;
  /** Draws attention to a pill that needs action (e.g. "Awaiting approval" with items in it). */
  attention?: boolean;
};

/**
 * Segmented status filter made of links (works without JavaScript, keeps the URL shareable).
 * Scrolls sideways on phones.
 * @example
 * <FilterPills label="Filter by status" items={[
 *   { label: "All", href: qs({ status: undefined }), active: !status, count: total },
 *   ...QUOTE_STATUSES.map((s) => ({ label: statusLabel(s), href: qs({ status: s }), active: status === s, count: n(s) })),
 * ]} />
 */
export function FilterPills({ items, label = "Filter", className }: { items: FilterPillItem[]; label?: string; className?: string }) {
  return (
    <nav aria-label={label} className={cx("-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1", className)}>
      {items.map((it, i) => (
        <Link
          key={i}
          href={it.href}
          aria-current={it.active ? "page" : undefined}
          className={cx(
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors",
            it.active
              ? "border-brand-600 bg-brand-600 text-white shadow-xs"
              : it.attention
                ? "border-warning-line bg-warning-soft text-warning hover:border-warning"
                : "border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink",
          )}
        >
          <span>{it.label}</span>
          {it.count != null && (
            <span className={cx("rounded-full px-1.5 text-[11px] leading-[18px] tabular-nums",
              it.active ? "bg-white/20 text-white" : "bg-muted text-ink-soft")}>{it.count}</span>
          )}
          {it.hint != null && <span className={cx("hidden text-xs sm:inline", it.active ? "text-white/80" : "text-ink-faint")}>{it.hint}</span>}
        </Link>
      ))}
    </nav>
  );
}
