"use client";
/** Once-per-login "Good morning" digest dialog. Dismiss clears the lbe_digest cookie set at login. */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import clsx from "clsx";

export type DigestItem = { label: string; sub?: string; href: string; tone?: "bad" | "warn" | "info" };
export type DigestSection = { key: string; title: string; href: string; total?: number; items: DigestItem[] };

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
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const nonEmpty = sections.filter((s) => s.items.length);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={dismiss} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="digest-title"
        aria-describedby="digest-desc"
        className="relative flex max-h-[90dvh] w-full max-w-2xl flex-col rounded-t-2xl border border-line bg-surface shadow-2xl sm:rounded-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 id="digest-title" className="text-lg font-semibold text-ink">{greet}, {userName.split(" ")[0]}</h2>
            <p id="digest-desc" className="text-sm text-ink-soft">
              {nonEmpty.length ? "Here is what needs your attention today." : "Nothing is pending for you right now."}
              {refreshed && " (Agents just refreshed.)"}
            </p>
          </div>
          <button ref={closeRef} type="button" onClick={dismiss} aria-label="Close daily digest" className="rounded-lg p-2 text-ink-soft hover:bg-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-600">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {nonEmpty.map((s) => (
            <section key={s.key} aria-labelledby={`dg-${s.key}`}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <h3 id={`dg-${s.key}`} className="text-sm font-semibold text-ink">
                  {s.title} <span className="font-normal text-ink-soft">({s.total ?? s.items.length})</span>
                </h3>
                <Link href={s.href} onClick={dismiss} className="text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">View all</Link>
              </div>
              <ul className="divide-y divide-line rounded-lg border border-line">
                {s.items.map((i, idx) => (
                  <li key={idx}>
                    <Link href={i.href} onClick={dismiss} className="flex items-start gap-2 px-3 py-2 text-sm hover:bg-muted">
                      {i.tone === "bad" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-label="Overdue" />
                        : <span className={clsx("mt-1.5 h-2 w-2 shrink-0 rounded-full", i.tone === "warn" ? "bg-amber-500" : "bg-blue-500")} aria-hidden />}
                      <span className="min-w-0">
                        <span className="block text-ink">{i.label}</span>
                        {i.sub && <span className={clsx("block text-xs", i.tone === "bad" ? "text-red-600" : "text-ink-soft")}>{i.sub}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <footer className="flex flex-col-reverse gap-2 border-t border-line px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-ink-faint">Prepared by rule-based agents · no AI credits used</span>
          <button type="button" onClick={dismiss} className="inline-flex h-9 items-center justify-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">
            Got it — start my day
          </button>
        </footer>
      </div>
    </div>
  );
}
