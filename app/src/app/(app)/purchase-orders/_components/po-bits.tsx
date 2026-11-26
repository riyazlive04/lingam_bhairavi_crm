/** Small server-safe pieces shared by the purchase order pages. */
import { cx } from "@/components/ui";
import { StatusPill } from "@/components/patterns";
import { qty } from "@/lib/format";
import { PO_STATUS_LABEL, isPoStatus } from "@/lib/purchase-orders";

/** PO status on the shared vocabulary, with the PO wording ("Partly received"). */
export function PoStatusBadge({ status }: { status: string }) {
  return <StatusPill status={status} label={isPoStatus(status) ? PO_STATUS_LABEL[status] : undefined} />;
}

/** Thin progress bar with a "40%" label. */
export function ReceivedBar({ pct, className }: { pct: number; className?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div className={cx("flex items-center gap-2", className)}>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label="Received">
        <div className={cx("h-full rounded-full", v >= 100 ? "bg-success" : v > 0 ? "bg-warning" : "bg-transparent")} style={{ width: `${v}%` }} />
      </div>
      <span className="text-caption tabular-nums text-ink-soft">{v}%</span>
    </div>
  );
}

/** "Received 40 of 100 Nos" */
export function receivedText(received: number, ordered: number, uom?: string | null) {
  return `Received ${qty(received)} of ${qty(ordered)}${uom ? ` ${uom}` : ""}`;
}

/** Builds "?a=1&b=2" from the non-empty values. */
export function qs(params: Record<string, string | number | undefined | null>) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
}
