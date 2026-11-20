import { cx } from "@/components/ui";
import { pct } from "@/lib/format";

/** Budget burn bar: green < 80 %, amber 80–100 %, red > 100 %. */
export function BudgetBar({ usedPct, budget, className, showLabel = true }: { usedPct: number; budget: number; className?: string; showLabel?: boolean }) {
  if (!budget) return <span className="text-xs text-ink-faint">No budget set</span>;
  const w = Math.max(0, Math.min(100, usedPct));
  const tone = usedPct > 100 ? "bg-red-600" : usedPct >= 80 ? "bg-amber-500" : "bg-emerald-600";
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
        <span className={cx("w-14 text-right text-xs tabular-nums", usedPct > 100 ? "font-semibold text-red-600" : "text-ink-soft")}>{pct(usedPct, 0)}</span>
      )}
    </div>
  );
}
