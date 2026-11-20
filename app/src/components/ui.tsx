/**
 * Shared UI primitives (server-component safe, no hooks). Maintainer: Sirah Digital.
 * Use these everywhere so the app looks consistent. Tailwind tokens come from globals.css.
 */
import Link from "next/link";
import clsx from "clsx";
import type { ComponentProps, ReactNode } from "react";
import { ArrowLeft, Inbox, Search, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { STATUS_TONE } from "@/lib/constants";
import { FlashToast } from "./flash-toast";

export const cx = clsx;

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
const btnBase =
  "inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap select-none";
const btnVariants: Record<BtnVariant, string> = {
  primary: "bg-brand-600 text-white shadow-sm hover:bg-brand-700 ring-1 ring-inset ring-black/5",
  secondary: "bg-surface text-ink border border-line shadow-xs hover:border-line-strong hover:bg-muted",
  ghost: "text-ink-soft hover:bg-muted hover:text-ink",
  danger: "bg-red-600 text-white shadow-sm hover:bg-red-700",
  success: "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700",
};
const btnSizes = { sm: "h-8 px-3 text-[13px]", md: "h-9.5 px-4", lg: "h-11 px-5 text-base" };

export function buttonClass(variant: BtnVariant = "primary", size: keyof typeof btnSizes = "md", className?: string) {
  return cx(btnBase, btnVariants[variant], btnSizes[size], className);
}

export function Button({ variant = "primary", size = "md", className, ...p }: ComponentProps<"button"> & { variant?: BtnVariant; size?: keyof typeof btnSizes }) {
  return <button className={buttonClass(variant, size, className)} {...p} />;
}

export function LinkButton({ variant = "primary", size = "md", className, ...p }: ComponentProps<typeof Link> & { variant?: BtnVariant; size?: keyof typeof btnSizes }) {
  return <Link className={buttonClass(variant, size, className)} {...p} />;
}

export function PageHeader({ title, subtitle, actions, back, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string }; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 ui-fade-in">
      {back && (
        <Link href={back.href} className="mb-3 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-ink-soft hover:text-brand-700 dark:hover:text-brand-300">
          <ArrowLeft className="h-4 w-4" aria-hidden /> {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow && <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-300">{eyebrow}</div>}
          <h1 className="font-display text-[1.6rem] font-bold leading-tight tracking-tight text-ink sm:text-[1.75rem]">{title}</h1>
          {subtitle && <p className="mt-1.5 max-w-3xl text-sm text-ink-soft">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Card({ title, actions, children, className, bodyClassName, icon: Icon, subtitle }: {
  title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; icon?: LucideIcon; subtitle?: ReactNode;
}) {
  return (
    <section className={cx("min-w-0 rounded-2xl border border-line bg-surface shadow-sm", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            {Icon && (
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
            )}
            <div className="min-w-0">
              <h2 className="truncate text-[0.9375rem] font-semibold text-ink">{title}</h2>
              {subtitle && <p className="truncate text-xs text-ink-soft">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cx("p-4 sm:p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Small "View all" style link for card headers. */
export function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="rounded-md text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300">{children}</Link>;
}

const toneCls = {
  gray: "bg-gray-100 text-gray-700 ring-gray-200 dark:bg-gray-800/70 dark:text-gray-300 dark:ring-gray-700",
  blue: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/70 dark:text-blue-300 dark:ring-blue-900",
  amber: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/70 dark:text-amber-300 dark:ring-amber-900",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/70 dark:text-emerald-300 dark:ring-emerald-900",
  red: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/70 dark:text-red-300 dark:ring-red-900",
  violet: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/70 dark:text-violet-300 dark:ring-violet-900",
};
const dotCls = { gray: "bg-gray-400", blue: "bg-blue-500", amber: "bg-amber-500", green: "bg-emerald-500", red: "bg-red-500", violet: "bg-violet-500" };
export type Tone = keyof typeof toneCls;

export function Badge({ tone = "gray", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap", toneCls[tone], className)}>
      {dot && <span className={cx("h-1.5 w-1.5 rounded-full", dotCls[tone])} aria-hidden />}
      {children}
    </span>
  );
}

/** Badge coloured by a status key (draft, won, overdue…). */
export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const text = label ?? status.replace(/_/g, " ");
  return <Badge tone={STATUS_TONE[status] ?? "gray"} dot className="capitalize">{text}</Badge>;
}

type StatTone = "default" | "good" | "warn" | "bad";
const statIconTone: Record<StatTone, string> = {
  default: "bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300",
  good: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  warn: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  bad: "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300",
};

/** KPI tile. `icon` and `trend` are optional extras; older call sites keep working. */
export function Stat({ label, value, hint, tone, href, icon: Icon, trend }: {
  label: string; value: ReactNode; hint?: ReactNode; tone?: StatTone; href?: string; icon?: LucideIcon;
  trend?: { direction: "up" | "down"; label: string; good?: boolean };
}) {
  const t: StatTone = tone ?? "default";
  const body = (
    <div className={cx("group relative h-full overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-5",
      href && "transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 text-[13px] font-medium text-ink-soft">{label}</div>
        {Icon && (
          <span className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-xl", statIconTone[t])}>
            <Icon className="h-4 w-4" aria-hidden />
          </span>
        )}
      </div>
      <div className={cx("mt-1.5 font-display text-2xl font-bold tracking-tight tabular-nums sm:text-[1.65rem]",
        t === "good" && "text-emerald-700 dark:text-emerald-400", t === "warn" && "text-amber-700 dark:text-amber-400",
        t === "bad" && "text-red-700 dark:text-red-400", t === "default" && "text-ink")}>{value}</div>
      {(hint || trend) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
          {trend && (
            <span className={cx("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium",
              trend.good ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300")}>
              {trend.direction === "up" ? <TrendingUp className="h-3 w-3" aria-hidden /> : <TrendingDown className="h-3 w-3" aria-hidden />}
              {trend.label}
            </span>
          )}
          {hint && <span className="min-w-0">{hint}</span>}
        </div>
      )}
    </div>
  );
  return href ? <Link href={href} className="block h-full rounded-2xl">{body}</Link> : body;
}

/**
 * Responsive table wrapper: scrolls horizontally inside its card only, sticky header, zebra rows.
 * Cell styles come from .ui-th / .ui-td in globals.css (keeps big tables light on HTML).
 */
export function Table({ children, className, tall }: { children: ReactNode; className?: string; tall?: boolean }) {
  return (
    <div className={cx("ui-table-wrap rounded-2xl border border-line bg-surface shadow-sm", tall && "ui-table-tall", className)}>
      <table className="ui-table">{children}</table>
    </div>
  );
}
export function Th({ children, className, ...p }: ComponentProps<"th">) {
  return <th scope={p.scope ?? "col"} className={cx("ui-th", className)} {...p}>{children}</th>;
}
export function Td({ children, className, ...p }: ComponentProps<"td">) {
  return <td className={cx("ui-td", className)} {...p}>{children}</td>;
}

export function EmptyState({ title, children, action, icon: Icon = Inbox }: { title: string; children?: ReactNode; action?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-muted text-ink-soft">
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <p className="mt-3 font-semibold text-ink">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- form controls
const inputCls =
  "block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink shadow-xs transition-[border-color,box-shadow] placeholder:text-ink-faint hover:border-line-strong focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:bg-muted disabled:text-ink-soft";
export const inputClass = inputCls;

export function Field({ label, hint, children, className, required }: { label: string; hint?: ReactNode; children: ReactNode; className?: string; required?: boolean }) {
  return (
    <label className={cx("block min-w-0", className)}>
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}{required && <span className="text-brand-600" aria-hidden> *</span>}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-ink-soft">{hint}</span>}
    </label>
  );
}
export function Input({ className, ...p }: ComponentProps<"input">) {
  return <input className={cx(inputCls, "h-9.5", p.type === "file" && "h-auto", className)} {...p} />;
}
export function Textarea({ className, ...p }: ComponentProps<"textarea">) {
  return <textarea className={cx(inputCls, "min-h-24 leading-relaxed", className)} {...p} />;
}
export function Select({ className, children, ...p }: ComponentProps<"select">) {
  return <select className={cx(inputCls, "h-9.5 pr-8", className)} {...p}>{children}</select>;
}

/** Simple GET search/filter bar. Children = extra selects. */
export function FilterBar({ q, placeholder = "Search…", children, action }: { q?: string; placeholder?: string; children?: ReactNode; action?: string }) {
  return (
    <form method="get" action={action} role="search" className="mb-4 flex flex-col gap-2 rounded-2xl border border-line bg-surface p-2 shadow-xs sm:flex-row sm:items-center">
      <label className="relative min-w-0 sm:max-w-xs sm:flex-1">
        <span className="sr-only">Search</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden />
        <Input name="q" type="search" defaultValue={q} placeholder={placeholder} className="pl-9" />
      </label>
      {children}
      <Button variant="secondary" type="submit">Apply</Button>
    </form>
  );
}

/** Flash message driven by ?ok= / ?err= search params. Shows a toast plus an accessible inline note. */
export function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (!ok && !err) return null;
  return <FlashToast key={(ok ?? err) as string} kind={ok ? "ok" : "err"} message={(ok ?? err) as string} />;
}

export function DL({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-xs font-medium text-ink-soft">{k}</dt>
          <dd className="mt-0.5 break-words text-sm font-medium text-ink">{v ?? "-"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Loading placeholder block (used by loading.tsx skeletons). */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} aria-hidden />;
}
