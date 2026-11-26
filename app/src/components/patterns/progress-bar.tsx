/**
 * The one progress / burn bar: delivered, received, budget used. Server-safe.
 * Maintainer: Sirah Digital.
 */
import type { ReactNode } from "react";
import { pct } from "@/lib/format";
import { cx } from "../ui";
import { progressPercent, progressTone, type ProgressMode, type ProgressTone } from "./progress-tone";

export type ProgressBarProps = {
  value: number;
  /** Default 100 (value is already a percentage). Pass the total for counts, e.g. value={3} max={5}. */
  max?: number;
  /** "auto" picks the colour from `mode` (see progressTone). */
  tone?: "auto" | Exclude<ProgressTone, "neutral">;
  /** progress (default): green when complete. budget: amber from 80%, red past 100%. */
  mode?: ProgressMode;
  /** Accessible name, e.g. "Delivered" or "Budget used". */
  label: string;
  /** Show the percentage after the bar (default true). */
  showValue?: boolean;
  /** Text above the bar on the left, e.g. "3/5 lines". Turns on the stacked layout. */
  caption?: ReactNode;
  size?: "sm" | "md";
  className?: string;
};

const FILL: Record<ProgressTone, string> = {
  info: "bg-chart-1",
  success: "bg-chart-good",
  warning: "bg-chart-warning",
  danger: "bg-chart-critical",
  neutral: "bg-ink-faint",
};

/**
 * @example <ProgressBar value={o.deliveredPct} label="Delivered" />
 * @example <ProgressBar value={done} max={total} label={`${done} of ${total} lines delivered`} caption={`${done}/${total} lines`} />
 * @example <ProgressBar mode="budget" value={c.budgetUsedPct} label="Budget used" />
 */
export function ProgressBar({ value, max = 100, tone = "auto", mode = "progress", label, showValue = true, caption, size = "md", className }: ProgressBarProps) {
  const p = progressPercent(value, max);
  const t: ProgressTone = tone === "auto" ? progressTone(value, max, mode) : tone;
  const over = mode === "budget" && p > 100;
  const track = (
    <div
      className={cx("overflow-hidden rounded-full bg-muted ring-1 ring-inset ring-line", size === "sm" ? "h-1.5" : "h-2", caption ? "w-full" : "flex-1")}
      role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)} aria-label={label}
    >
      <div className={cx("h-full rounded-full", FILL[t])} style={{ width: `${Math.max(0, Math.min(100, p))}%` }} />
    </div>
  );
  const valueText = showValue && (
    <span className={cx("text-caption tabular-nums", !caption && "w-12 shrink-0 text-right", over ? "font-semibold text-danger" : "text-ink-soft")}>
      {pct(p, 0)}
    </span>
  );
  if (caption) {
    return (
      <div className={cx("min-w-28", className)}>
        <div className="mb-1 flex items-center justify-between gap-2 text-xs">
          <span className="font-medium tabular-nums text-ink">{caption}</span>
          {valueText}
        </div>
        {track}
      </div>
    );
  }
  return <div className={cx("flex min-w-28 items-center gap-2", className)}>{track}{valueText}</div>;
}
