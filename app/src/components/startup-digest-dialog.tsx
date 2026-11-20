"use client";
/** Once-per-login "Good morning" digest dialog. Dismiss clears the lbe_digest cookie set at login. */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, Bell, CheckCircle2, FireExtinguisher, PhoneCall, Receipt, Truck, Wallet, X, type LucideIcon } from "lucide-react";
import clsx from "clsx";

export type DigestItem = { label: string; sub?: string; href: string; tone?: "bad" | "warn" | "info" };
export type DigestSection = { key: string; title: string; href: string; total?: number; items: DigestItem[] };

const ICONS: Record<string, LucideIcon> = {
  deliveries: Truck, followups: PhoneCall, refills: FireExtinguisher, receivables: Wallet, expenses: Receipt, alerts: Bell,
};

export function StartupDigestDialog({ userName, sections, refreshed }: { userName: string; sections: DigestSection[]; refreshed: boolean }) {
  const [open, setOpen] = useState(true);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const dismiss = useCallback(() => {
    document.cookie = "lbe_digest=; Max-Age=0; path=/";
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        dismiss();
      } else if (e.key === "Tab" && panelRef.current) {
        // keep focus inside the dialog
        const f = panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, [open, dismiss]);

  if (!open) return null;
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(now));
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const dateLabel = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(now);
  const nonEmpty = sections.filter((s) => s.items.length);
  const totalCount = nonEmpty.reduce((s, x) => s + (x.total ?? x.items.length), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-gray-950/55 backdrop-blur-[2px]" onClick={dismiss} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="digest-title"
        aria-describedby="digest-desc"
        className="ui-pop relative flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-line bg-surface shadow-lg sm:rounded-3xl"
      >
        <header className="relative overflow-hidden bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 px-5 pb-5 pt-5 text-white sm:px-6">
          <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-accent-400/25 blur-2xl" aria-hidden />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wider text-white/75">{dateLabel}</p>
              <h2 id="digest-title" className="mt-1 font-display text-xl font-bold sm:text-2xl">{greet}, {userName.split(" ")[0]}</h2>
              <p id="digest-desc" className="mt-1 text-sm text-white/85">
                {nonEmpty.length
                  ? `Here is your day at a glance: ${totalCount} thing${totalCount === 1 ? "" : "s"} could use your attention.`
                  : "You're all caught up. Nothing is waiting on you right now."}
                {refreshed && " The automation agents have just refreshed."}
              </p>
            </div>
            <button ref={closeRef} type="button" onClick={dismiss} aria-label="Close daily summary"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white/80 hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-white">
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto bg-bg/60 px-4 py-4 sm:px-6">
          {nonEmpty.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-600" aria-hidden />
              <p className="font-semibold text-ink">All clear</p>
              <p className="text-sm text-ink-soft">New work will show up here when you sign in.</p>
            </div>
          )}
          {nonEmpty.map((s) => {
            const Icon = ICONS[s.key] ?? Bell;
            return (
              <section key={s.key} aria-labelledby={`dg-${s.key}`} className="rounded-2xl border border-line bg-surface shadow-xs">
                <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
                  <h3 id={`dg-${s.key}`} className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300"><Icon className="h-4 w-4" aria-hidden /></span>
                    <span className="truncate">{s.title}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-ink-soft">{s.total ?? s.items.length}</span>
                  </h3>
                  <Link href={s.href} onClick={dismiss} className="inline-flex shrink-0 items-center gap-1 rounded-md text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300">
                    View all <ArrowRight className="h-3 w-3" aria-hidden />
                  </Link>
                </div>
                <ul className="divide-y divide-line">
                  {s.items.map((i, idx) => (
                    <li key={idx}>
                      <Link href={i.href} onClick={dismiss} className="flex items-start gap-2.5 px-4 py-2.5 text-sm hover:bg-muted">
                        {i.tone === "bad" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" aria-label="Overdue" />
                          : <span className={clsx("mt-1.5 h-2 w-2 shrink-0 rounded-full", i.tone === "warn" ? "bg-amber-500" : "bg-blue-500")} aria-hidden />}
                        <span className="min-w-0">
                          <span className="block text-ink">{i.label}</span>
                          {i.sub && <span className={clsx("block text-xs", i.tone === "bad" ? "font-medium text-red-700 dark:text-red-400" : "text-ink-soft")}>{i.sub}</span>}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-line bg-surface px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span className="text-xs text-ink-soft">Prepared by your rule-based automation agents</span>
          <button type="button" onClick={dismiss} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700">
            Got it, let&apos;s start <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </footer>
      </div>
    </div>
  );
}
