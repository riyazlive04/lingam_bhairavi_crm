/**
 * Pure tone logic for <ProgressBar> (kept apart from the component so it can be unit tested).
 * Maintainer: Sirah Digital.
 */

export type ProgressTone = "info" | "success" | "warning" | "danger" | "neutral";
/**
 * progress: how much of something is done (delivered, received). Green when complete, blue while under way.
 * budget: how much of a budget is used. Green below 80%, amber from 80% to 100%, red above 100%.
 */
export type ProgressMode = "progress" | "budget";

/** value as a percentage of max (0 when max is 0 or less). Not clamped: a budget can run past 100%. */
export function progressPercent(value: number, max = 100): number {
  if (!(max > 0) || !Number.isFinite(value)) return 0;
  return (value / max) * 100;
}

/** The colour a bar should take when its tone is "auto". */
export function progressTone(value: number, max = 100, mode: ProgressMode = "progress"): ProgressTone {
  const p = progressPercent(value, max);
  if (mode === "budget") return p > 100 ? "danger" : p >= 80 ? "warning" : "success";
  return p >= 100 ? "success" : p > 0 ? "info" : "neutral";
}
