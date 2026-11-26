/** Small server-safe pieces shared by the purchase order pages. */
import { Badge, cx } from "@/components/ui";
import { qty } from "@/lib/format";
import { PO_STATUS_LABEL, PO_STATUS_TONE, isPoStatus } from "@/lib/purchase-orders";

export function PoStatusBadge({ status }: { status: string }) {
  if (!isPoStatus(status)) return <Badge dot>{status}</Badge>;
  return <Badge tone={PO_STATUS_TONE[status]} dot>{PO_STATUS_LABEL[status]}</Badge>;
}

/** Thin progress bar with a "40%" label. */
export function ReceivedBar({ pct, className }: { pct: number; className?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div className={cx("flex items-center gap-2", className)}>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label="Received">
        <div className={cx("h-full rounded-full", v >= 100 ? "bg-emerald-500" : v > 0 ? "bg-amber-500" : "bg-transparent")} style={{ width: `${v}%` }} />
      </div>
      <span className="text-xs tabular-nums text-ink-soft">{v}%</span>
    </div>
  );
}

/** "Received 40 of 100 Nos" */
export function receivedText(received: number, ordered: number, uom?: string | null) {
  return `Received ${qty(received)} of ${qty(ordered)}${uom ? ` ${uom}` : ""}`;
}
