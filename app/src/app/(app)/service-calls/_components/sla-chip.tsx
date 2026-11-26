"use client";
import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { cx } from "@/components/ui";

function fmt(minutes: number) {
  const m = Math.max(0, Math.round(Math.abs(minutes)));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  return d ? `${d} d ${h} h` : h ? `${h} h ${mm} m` : `${mm} m`;
}

/**
 * Live SLA countdown to dueBy (ticks every 30 s). The first render uses the server's clock (`nowMs`) so the
 * server and client HTML match; after that it follows the device clock.
 */
export function SlaChip({ dueBy, nowMs, done, className }: { dueBy: string | null; nowMs: number; done?: boolean; className?: string }) {
  const [now, setNow] = useState(nowMs);
  useEffect(() => {
    if (!dueBy || done) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [dueBy, done]);
  if (!dueBy) return <span className={cx("text-xs text-ink-faint", className)}>No SLA</span>;
  const left = (new Date(dueBy).getTime() - now) / 60000;
  const breached = left < 0;
  const soon = !breached && left <= 120;
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-inset",
      breached ? "bg-red-600 text-white ring-red-700" : soon ? "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/70 dark:text-amber-300 dark:ring-amber-900"
        : "bg-muted text-ink-soft ring-line", className)}>
      <Clock className="h-3 w-3" aria-hidden />
      {breached ? `SLA breached ${fmt(left)} ago` : `${fmt(left)} left`}
    </span>
  );
}
