import { cx } from "@/components/ui";
import { pct } from "@/lib/format";

/** Budget burn bar: good below 80 %, warning from 80 to 100 %, danger above 100 %. Also used by reports. */
export function BudgetBar({ usedPct, budget, className, showLabel = true }: { usedPct: number; budget: number; className?: string; showLabel?: boolean }) {
  if (!budget) return <span className="text-caption text-ink-faint">No budget set</span>;
  const w = Math.max(0, Math.min(100, usedPct));
  const tone = usedPct > 100 ? "bg-chart-critical" : usedPct >= 80 ? "bg-chart-warning" : "bg-chart-good";
  return (
    <div className={cx("flex min-w-32 items-center gap-2", className)}>
      <div
        className="h-2 flex-1 overflow-hidden rounded-full bg-muted ring-1 ring-inset ring-line"
        role="progressbar"
        aria-valuenow={Math.round(usedPct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Budget used"
      >
        <div className={cx("h-full rounded-full", tone)} style={{ width: `${w}%` }} />
      </div>
      {showLabel && (
        <span className={cx("w-14 text-right text-caption tabular-nums", usedPct > 100 ? "font-semibold text-danger" : "text-ink-soft")}>{pct(usedPct, 0)}</span>
      )}
    </div>
  );
}

/** Neutral progress bar (delivered share of an order). */
export function ProgressBar({ value, label }: { value: number; label: string }) {
  const w = Math.max(0, Math.min(100, value));
  return (
    <div className="flex min-w-28 items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted ring-1 ring-inset ring-line" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={cx("h-full rounded-full", value >= 100 ? "bg-chart-good" : "bg-chart-1")} style={{ width: `${w}%` }} />
      </div>
      <span className="w-10 text-right text-caption tabular-nums text-ink-soft">{pct(value, 0)}</span>
    </div>
  );
}
