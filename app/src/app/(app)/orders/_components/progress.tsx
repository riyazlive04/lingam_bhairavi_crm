import { cx } from "@/components/ui";

/** Accessible "delivered X/Y" progress bar (server-safe). */
export function LineProgress({ done, total, className }: { done: number; total: number; className?: string }) {
  const pctDone = total > 0 ? Math.round((done / total) * 100) : 0;
  const tone = total > 0 && done >= total ? "bg-emerald-500" : done > 0 ? "bg-amber-500" : "bg-ink-faint";
  return (
    <div className={cx("min-w-28", className)}>
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-ink tabular-nums">{done}/{total} lines</span>
        <span className="text-ink-soft tabular-nums">{pctDone}%</span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted ring-1 ring-inset ring-line"
        role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label={`${done} of ${total} lines delivered`}
      >
        <div className={cx("h-full rounded-full", tone)} style={{ width: `${pctDone}%` }} />
      </div>
    </div>
  );
}
