"use client";
/**
 * Comfortable / compact switch for data-heavy tables. Sets <html data-density> and remembers the
 * choice in this browser (localStorage "lbe-density"); the root layout applies it before paint.
 */
import { useEffect, useState } from "react";
import { Rows3, Rows4 } from "lucide-react";
import { cx } from "../ui";

type Density = "comfortable" | "compact";
const KEY = "lbe-density";

export function DensityToggle({ className }: { className?: string }) {
  const [density, setDensity] = useState<Density>("comfortable");
  useEffect(() => {
    setDensity(document.documentElement.dataset.density === "compact" ? "compact" : "comfortable");
  }, []);
  const choose = (d: Density) => {
    setDensity(d);
    if (d === "compact") document.documentElement.dataset.density = "compact";
    else delete document.documentElement.dataset.density;
    try { localStorage.setItem(KEY, d); } catch { /* private mode: still works for this page */ }
  };
  const opt = (d: Density, label: string, Icon: typeof Rows3) => (
    <button
      type="button"
      onClick={() => choose(d)}
      aria-pressed={density === d}
      title={label}
      className={cx("grid h-7 w-8 place-items-center rounded-md transition-colors",
        density === d ? "bg-surface text-ink shadow-xs" : "text-ink-soft hover:text-ink")}
    >
      <Icon className="icon-sm" aria-hidden />
      <span className="sr-only">{label}</span>
    </button>
  );
  return (
    <div role="group" aria-label="Table density" className={cx("no-print inline-flex items-center gap-0.5 rounded-lg border border-line bg-muted p-0.5", className)}>
      {opt("comfortable", "Comfortable rows", Rows3)}
      {opt("compact", "Compact rows", Rows4)}
    </div>
  );
}
