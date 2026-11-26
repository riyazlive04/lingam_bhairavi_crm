"use client";
import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { StatusPill } from "@/components/patterns";

function fmt(minutes: number) {
  const m = Math.max(0, Math.round(Math.abs(minutes)));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  return d ? `${d} d ${h} h` : h ? `${h} h ${mm} m` : `${mm} m`;
}

/**
 * Live SLA countdown to dueBy (ticks every 30 s), shown as a StatusPill: red once breached, amber in the
 * last two hours, grey otherwise. The first render uses the server's clock (`nowMs`) so the server and
 * client HTML match; after that it follows the device clock.
 */
export function SlaChip({ dueBy, nowMs, done, className }: { dueBy: string | null; nowMs: number; done?: boolean; className?: string }) {
  const [now, setNow] = useState(nowMs);
  useEffect(() => {
    if (!dueBy || done) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [dueBy, done]);
  if (!dueBy) return <span className={`text-caption text-ink-faint ${className ?? ""}`}>No SLA</span>;
  const left = (new Date(dueBy).getTime() - now) / 60000;
  const breached = left < 0;
  const soon = !breached && left <= 120;
  return (
    <StatusPill noDot className={`tabular-nums ${className ?? ""}`} semantic={breached ? "danger" : soon ? "warning" : "neutral"}
      label={<><Clock className="icon-xs" aria-hidden />{breached ? `SLA breached ${fmt(left)} ago` : `${fmt(left)} left`}</>} />
  );
}
