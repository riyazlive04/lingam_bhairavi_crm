/**
 * Building blocks used inside every page type: SectionCard, Callout, KeyValueGrid, Metric,
 * MetricStrip, StatusTimeline, ActivityFeed, SummaryRows. Server-safe. Maintainer: Sirah Digital.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, OctagonAlert, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { cx } from "../ui";
import { statusSemantic, type StatusSemantic } from "./status-tones";

// ---------------------------------------------------------------- SectionCard

/**
 * Titled card. Use `flush` when the body is a table, `empty` for the empty message.
 * @example
 * <SectionCard title="Deliveries" count={dels.length} icon={Truck} flush={dels.length > 0}
 *   actions={<CardLink href="...">View all</CardLink>}
 *   empty={dels.length === 0 && "No deliveries yet. Record a challan when material leaves for site."}>
 *   <ResponsiveTable flush ... />
 * </SectionCard>
 */
export function SectionCard({ title, description, count, icon: Icon, actions, children, empty, flush, className, id }: {
  title: ReactNode; description?: ReactNode; count?: number; icon?: LucideIcon; actions?: ReactNode;
  children?: ReactNode; empty?: ReactNode; flush?: boolean; className?: string; id?: string;
}) {
  const showEmpty = empty != null && empty !== false;
  return (
    <section id={id} className={cx("min-w-0 scroll-mt-24 overflow-hidden rounded-2xl border border-line bg-surface shadow-sm", className)}>
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon && (
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300">
              <Icon className="icon-sm" aria-hidden />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-subheading text-ink">
              <span className="truncate">{title}</span>
              {count != null && <span className="rounded-full bg-muted px-1.5 text-[11px] font-medium leading-[18px] text-ink-soft tabular-nums">{count}</span>}
            </h2>
            {description && <p className="mt-0.5 text-caption text-ink-soft">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      {showEmpty
        ? <p className="px-4 py-6 text-center text-sm text-ink-soft sm:px-5">{empty}</p>
        : <div className={flush ? undefined : "p-4 sm:p-5"}>{children}</div>}
    </section>
  );
}

// ---------------------------------------------------------------- Callout

const calloutTone: Record<"info" | "warning" | "danger" | "success", { cls: string; icon: LucideIcon; role: "status" | "alert" | "note" }> = {
  info: { cls: "border-info-line bg-info-soft text-ink [&_svg]:text-info", icon: Info, role: "note" },
  warning: { cls: "border-warning-line bg-warning-soft text-ink [&_svg]:text-warning", icon: AlertTriangle, role: "status" },
  danger: { cls: "border-danger-line bg-danger-soft text-ink [&_svg]:text-danger", icon: OctagonAlert, role: "alert" },
  success: { cls: "border-success-line bg-success-soft text-ink [&_svg]:text-success", icon: CheckCircle2, role: "status" },
};

/**
 * Page or card level message. Replaces the hand-made amber and red banners.
 * @example <Callout tone="danger" title="2 lines are overdue">The expected date has passed. Update the line or record the delivery.</Callout>
 */
export function Callout({ tone = "info", title, children, action, className, icon }: {
  tone?: keyof typeof calloutTone; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string; icon?: LucideIcon;
}) {
  const t = calloutTone[tone];
  const Icon = icon ?? t.icon;
  return (
    <div role={t.role} className={cx("flex flex-col gap-3 rounded-xl border px-4 py-3 text-sm sm:flex-row sm:items-start", t.cls, className)}>
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <Icon className="icon-md mt-px" aria-hidden />
        <div className="min-w-0">
          {title && <p className="font-semibold">{title}</p>}
          {children && <div className={cx("text-ink-soft", title && "mt-0.5")}>{children}</div>}
        </div>
      </div>
      {action && <div className="flex shrink-0 gap-2">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- KeyValueGrid

export type KV = { label: string; value: ReactNode; /** span the full row */ wide?: boolean; hint?: ReactNode };

/**
 * Label / value pairs. Accepts the old DL tuple form too.
 * @example <KeyValueGrid columns={2} items={[{ label: "Customer", value: name }, ["Order date", fmtDate(d)]]} />
 */
export function KeyValueGrid({ items, columns = 2, className }: { items: (KV | [string, ReactNode])[]; columns?: 1 | 2 | 3; className?: string }) {
  const list: KV[] = items.map((i) => (Array.isArray(i) ? { label: i[0], value: i[1] } : i));
  return (
    <dl className={cx("grid grid-cols-1 gap-x-6 gap-y-4", columns >= 2 && "sm:grid-cols-2", columns === 3 && "lg:grid-cols-3", className)}>
      {list.map((it) => (
        <div key={it.label} className={cx("min-w-0", it.wide && "sm:col-span-full")}>
          <dt className="text-caption font-medium text-ink-soft">{it.label}</dt>
          <dd className="mt-0.5 break-words text-sm font-medium text-ink">{it.value === null || it.value === undefined || it.value === "" ? "-" : it.value}</dd>
          {it.hint && <dd className="mt-0.5 text-caption text-ink-faint">{it.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}

/**
 * Compact label/value rows for sidebar summary cards (right aligned numbers).
 * @example <SummaryRows rows={[["Pending lines", 3], ["Overdue", <span className="text-danger">2</span>]]} />
 */
export function SummaryRows({ rows, className }: { rows: [ReactNode, ReactNode][]; className?: string }) {
  return (
    <dl className={cx("space-y-1.5 text-sm", className)}>
      {rows.map(([k, v], i) => (
        <div key={i} className="flex items-baseline justify-between gap-3">
          <dt className="text-ink-soft">{k}</dt>
          <dd className="text-right font-medium tabular-nums text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------- Metric

type MetricTone = "default" | "good" | "warn" | "bad";

/**
 * KPI tile with an optional trend. `trend.value` is the percent change; `goodWhen` says which way is good.
 * @example <Metric label="Open pipeline" value={moneyShort(v)} hint="12 sent" href="/quotations?status=sent" />
 * @example <Metric label="Sales this month" value={moneyShort(s)} trend={{ value: 12.5, goodWhen: "up", label: "vs last month" }} />
 */
export function Metric({ label, value, hint, tone = "default", href, icon: Icon, trend }: {
  label: string; value: ReactNode; hint?: ReactNode; tone?: MetricTone; href?: string; icon?: LucideIcon;
  trend?: { value: number; goodWhen?: "up" | "down"; label?: string };
}) {
  const up = trend ? trend.value >= 0 : false;
  const good = trend ? (trend.goodWhen ?? "up") === (up ? "up" : "down") : false;
  const body = (
    <div className={cx("h-full rounded-2xl border border-line bg-surface p-4 shadow-sm",
      href && "transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md")}>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-[13px] font-medium text-ink-soft">{label}</p>
        {Icon && <Icon className="icon-md text-ink-faint" aria-hidden />}
      </div>
      <p className={cx("mt-1 font-display text-[1.5rem] font-bold leading-8 tracking-tight tabular-nums",
        tone === "good" ? "text-success" : tone === "warn" ? "text-warning" : tone === "bad" ? "text-danger" : "text-ink")}>{value}</p>
      {(hint || trend) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-ink-soft">
          {trend && (
            <span className={cx("inline-flex items-center gap-0.5 rounded-full px-1.5 font-medium",
              good ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>
              {up ? <TrendingUp className="icon-xs" aria-hidden /> : <TrendingDown className="icon-xs" aria-hidden />}
              {`${up ? "+" : ""}${trend.value.toFixed(Math.abs(trend.value) < 10 ? 1 : 0)}%`}
              <span className="sr-only">{good ? " (good)" : " (needs attention)"}</span>
            </span>
          )}
          {trend?.label && <span>{trend.label}</span>}
          {hint && <span className="min-w-0">{hint}</span>}
        </div>
      )}
    </div>
  );
  return href ? <Link href={href} className="block h-full rounded-2xl">{body}</Link> : body;
}

/** 2 columns on phones, up to 4 on desktop. */
export function MetricStrip({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("grid grid-cols-2 gap-3 lg:grid-cols-4", className)}>{children}</div>;
}

// ---------------------------------------------------------------- timeline / activity

export type TimelineItem = {
  id: string | number;
  title: ReactNode;
  /** Already formatted date / time text. */
  at?: ReactNode;
  by?: ReactNode;
  body?: ReactNode;
  /** A stored status key (colours the dot) or an explicit semantic. */
  status?: string;
  semantic?: StatusSemantic;
  icon?: LucideIcon;
  href?: string;
};

const dot: Record<StatusSemantic, string> = {
  neutral: "bg-ink-faint", info: "bg-blue-500", progress: "bg-violet-500", warning: "bg-amber-500", success: "bg-emerald-500", danger: "bg-red-500",
};
const iconRing: Record<StatusSemantic, string> = {
  neutral: "bg-muted text-ink-soft", info: "bg-info-soft text-info", progress: "bg-violet-50 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
  warning: "bg-warning-soft text-warning", success: "bg-success-soft text-success", danger: "bg-danger-soft text-danger",
};

/**
 * Vertical history of what happened, newest first. Use for approval history, PO and return
 * activity, project history, visit logs.
 * @example <StatusTimeline items={events.map((e) => ({ id: e.id, title: e.label, at: fmtDate(e.date), by: e.userName, status: e.status }))} />
 */
export function StatusTimeline({ items, empty = "Nothing has happened yet.", className }: { items: TimelineItem[]; empty?: ReactNode; className?: string }) {
  if (!items.length) return <p className="text-sm text-ink-soft">{empty}</p>;
  return (
    <ol className={cx("relative space-y-5", className)}>
      {items.map((it, i) => {
        const sem = it.semantic ?? (it.status ? statusSemantic(it.status) : "neutral");
        const Icon = it.icon;
        return (
          <li key={it.id} className="relative flex gap-3">
            {i < items.length - 1 && <span className="absolute left-[13px] top-7 h-[calc(100%-0.5rem)] w-px bg-line" aria-hidden />}
            {Icon
              ? <span className={cx("relative z-[1] grid h-7 w-7 shrink-0 place-items-center rounded-full ring-4 ring-surface", iconRing[sem])}><Icon className="icon-xs" aria-hidden /></span>
              : <span className="relative z-[1] grid h-7 w-7 shrink-0 place-items-center"><span className={cx("h-2.5 w-2.5 rounded-full ring-4 ring-surface", dot[sem])} /></span>}
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="text-sm font-medium text-ink">{it.href ? <Link href={it.href} className="hover:underline">{it.title}</Link> : it.title}</p>
                {it.at && <p className="text-caption text-ink-faint tabular-nums">{it.at}</p>}
              </div>
              {it.by && <p className="text-caption text-ink-soft">{it.by}</p>}
              {it.body && <div className="mt-1 text-sm text-ink-soft">{it.body}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Denser one-line-per-event feed for sidebars ("Recent activity").
 * @example <ActivityFeed items={audit.map((a) => ({ id: a.id, title: a.summary, at: fmtDate(a.at), by: a.user }))} />
 */
export function ActivityFeed({ items, empty = "No activity yet.", className }: { items: TimelineItem[]; empty?: ReactNode; className?: string }) {
  if (!items.length) return <p className="text-sm text-ink-soft">{empty}</p>;
  return (
    <ul className={cx("divide-y divide-line", className)}>
      {items.map((it) => {
        const sem = it.semantic ?? (it.status ? statusSemantic(it.status) : "neutral");
        return (
          <li key={it.id} className="flex gap-2.5 py-2.5 first:pt-0 last:pb-0">
            <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", dot[sem])} aria-hidden />
            <div className="min-w-0 flex-1 text-sm">
              <p className="text-ink">{it.href ? <Link href={it.href} className="hover:underline">{it.title}</Link> : it.title}</p>
              <p className="text-caption text-ink-faint">{[it.by, it.at].filter(Boolean).map((x, k) => <span key={k}>{k > 0 && " · "}{x}</span>)}</p>
              {it.body && <div className="mt-0.5 text-caption text-ink-soft">{it.body}</div>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
