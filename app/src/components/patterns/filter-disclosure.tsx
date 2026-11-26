"use client";
/**
 * The collapsible part of <ListFilters> (client). On phones the selects fold away behind a
 * "Filters (n)" button so search and results stay on the first screen; from 640px they are always open.
 * Plain <details>/<summary>, so it works before hydration. CSS (".lf-more" in globals.css) keeps it open
 * from 640px in browsers that support ::details-content; the effect below covers the rest.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { buttonClass, cx } from "../ui";

export function FilterDisclosure({ activeCount, children, className }: { activeCount: number; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const sync = () => { if (mq.matches && ref.current) ref.current.open = true; };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return (
    <details ref={ref} open={activeCount > 0 || undefined} className={cx("lf-more min-w-0", className)}>
      <summary className={buttonClass("secondary", "md", "w-full list-none sm:hidden [&::-webkit-details-marker]:hidden")}>
        <SlidersHorizontal className="icon-sm" aria-hidden /> Filters{activeCount > 0 ? ` (${activeCount})` : ""}
      </summary>
      {children}
    </details>
  );
}
