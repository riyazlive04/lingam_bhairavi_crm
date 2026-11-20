"use client";
/** Toast for ?ok= / ?err= flash messages. Success fades after a few seconds; errors stay until closed. */
import { useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, X } from "lucide-react";
import clsx from "clsx";

export function FlashToast({ kind, message }: { kind: "ok" | "err"; message: string }) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    // Drop ?ok= / ?err= from the address bar so a refresh doesn't repeat the message.
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("ok") || url.searchParams.has("err")) {
        url.searchParams.delete("ok");
        url.searchParams.delete("err");
        window.history.replaceState(window.history.state, "", url.pathname + (url.search ? url.search : "") + url.hash);
      }
    } catch { /* ignore */ }
    if (kind !== "ok") return;
    const t = window.setTimeout(() => setOpen(false), 6000);
    return () => window.clearTimeout(t);
  }, [kind, message]);

  if (!open) return null;
  const ok = kind === "ok";
  return (
    <div
      role={ok ? "status" : "alert"}
      className={clsx(
        "ui-pop fixed inset-x-3 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[60] mx-auto flex max-w-md items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg sm:inset-x-auto sm:right-6 sm:bottom-6",
        ok ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
          : "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100",
      )}
    >
      {ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
        : <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" aria-hidden />}
      <p className="min-w-0 flex-1 break-words font-medium">{message}</p>
      <button type="button" onClick={() => setOpen(false)} aria-label="Dismiss message" className="-m-1 rounded-md p-1 opacity-70 hover:opacity-100">
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
