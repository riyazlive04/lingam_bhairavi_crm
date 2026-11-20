/**
 * Shared UI primitives (server-component safe — no hooks). OWNED BY: UI/UX Designer.
 * Use these everywhere so the app looks consistent. Tailwind tokens come from globals.css.
 */
import Link from "next/link";
import clsx from "clsx";
import type { ComponentProps, ReactNode } from "react";
import { STATUS_TONE } from "@/lib/constants";

export const cx = clsx;

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
const btnBase =
  "inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap";
const btnVariants: Record<BtnVariant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm",
  secondary: "bg-surface text-ink border border-line hover:bg-muted",
  ghost: "text-ink-soft hover:bg-muted hover:text-ink",
  danger: "bg-red-600 text-white hover:bg-red-700",
  success: "bg-emerald-600 text-white hover:bg-emerald-700",
};
const btnSizes = { sm: "h-8 px-3", md: "h-9 px-4", lg: "h-11 px-5 text-base" };

export function buttonClass(variant: BtnVariant = "primary", size: keyof typeof btnSizes = "md", className?: string) {
  return cx(btnBase, btnVariants[variant], btnSizes[size], className);
}

export function Button({ variant = "primary", size = "md", className, ...p }: ComponentProps<"button"> & { variant?: BtnVariant; size?: keyof typeof btnSizes }) {
  return <button className={buttonClass(variant, size, className)} {...p} />;
}

export function LinkButton({ variant = "primary", size = "md", className, ...p }: ComponentProps<typeof Link> & { variant?: BtnVariant; size?: keyof typeof btnSizes }) {
  return <Link className={buttonClass(variant, size, className)} {...p} />;
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6">
      {back && (
        <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-brand-700">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Card({ title, actions, children, className, bodyClassName }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cx("rounded-xl border border-line bg-surface shadow-sm", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cx("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

const toneCls = {
  gray: "bg-gray-100 text-gray-700 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700",
  blue: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:ring-blue-900",
  amber: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900",
  red: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950 dark:text-red-300 dark:ring-red-900",
  violet: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:ring-violet-900",
};
export type Tone = keyof typeof toneCls;

export function Badge({ tone = "gray", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap", toneCls[tone], className)}>{children}</span>;
}

/** Badge coloured by a status key (draft, won, overdue…). */
export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "gray"}>{label ?? status.replace(/_/g, " ")}</Badge>;
}

export function Stat({ label, value, hint, tone, href }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "good" | "warn" | "bad"; href?: string }) {
  const body = (
    <div className={cx("rounded-xl border border-line bg-surface p-4 shadow-sm", href && "transition hover:border-brand-300 hover:shadow")}>
      <div className="text-xs font-medium uppercase tracking-wide text-ink-soft">{label}</div>
      <div className={cx("mt-1 text-2xl font-semibold tabular-nums",
        tone === "good" && "text-emerald-600", tone === "warn" && "text-amber-600", tone === "bad" && "text-red-600", (!tone || tone === "default") && "text-ink")}>{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-soft">{hint}</div>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

/** Responsive table wrapper: horizontal scroll inside the card only. */
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("overflow-x-auto rounded-xl border border-line bg-surface shadow-sm", className)}>
      <table className="w-full min-w-max text-sm">{children}</table>
    </div>
  );
}
export function Th({ children, className, ...p }: ComponentProps<"th">) {
  return <th className={cx("border-b border-line bg-muted px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-soft", className)} {...p}>{children}</th>;
}
export function Td({ children, className, ...p }: ComponentProps<"td">) {
  return <td className={cx("border-b border-line px-3 py-2 align-top text-ink", className)} {...p}>{children}</td>;
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface p-10 text-center">
      <p className="font-medium text-ink">{title}</p>
      {children && <p className="mt-1 text-sm text-ink-soft">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- form controls
const inputCls =
  "block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink shadow-sm placeholder:text-ink-faint focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-muted";
export const inputClass = inputCls;

export function Field({ label, hint, children, className, required }: { label: string; hint?: ReactNode; children: ReactNode; className?: string; required?: boolean }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1 block text-sm font-medium text-ink">{label}{required && <span className="text-brand-600"> *</span>}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-soft">{hint}</span>}
    </label>
  );
}
export function Input({ className, ...p }: ComponentProps<"input">) {
  return <input className={cx(inputCls, className)} {...p} />;
}
export function Textarea({ className, ...p }: ComponentProps<"textarea">) {
  return <textarea className={cx(inputCls, "min-h-20", className)} {...p} />;
}
export function Select({ className, children, ...p }: ComponentProps<"select">) {
  return <select className={cx(inputCls, "pr-8", className)} {...p}>{children}</select>;
}

/** Simple GET search/filter bar. Children = extra selects. */
export function FilterBar({ q, placeholder = "Search…", children, action }: { q?: string; placeholder?: string; children?: ReactNode; action?: string }) {
  return (
    <form method="get" action={action} className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
      <Input name="q" defaultValue={q} placeholder={placeholder} className="sm:max-w-xs" />
      {children}
      <Button variant="secondary" type="submit">Filter</Button>
    </form>
  );
}

/** Flash message driven by ?ok= / ?err= search params. */
export function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (!ok && !err) return null;
  return (
    <div role="status" className={cx("mb-4 rounded-lg border px-4 py-3 text-sm",
      ok ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
        : "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200")}>
      {ok ?? err}
    </div>
  );
}

export function DL({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs font-medium uppercase tracking-wide text-ink-soft">{k}</dt>
          <dd className="mt-0.5 text-sm text-ink">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
