/** Small server-safe pieces shared by the purchase order pages. */
import { StatusPill } from "@/components/patterns";
import { qty } from "@/lib/format";
import { PO_STATUS_LABEL, isPoStatus } from "@/lib/purchase-orders";

/** PO status on the shared vocabulary, with the PO wording ("Partly received"). */
export function PoStatusBadge({ status }: { status: string }) {
  return <StatusPill status={status} label={isPoStatus(status) ? PO_STATUS_LABEL[status] : undefined} />;
}

/** "Received 40 of 100 Nos" */
export function receivedText(received: number, ordered: number, uom?: string | null) {
  return `Received ${qty(received)} of ${qty(ordered)}${uom ? ` ${uom}` : ""}`;
}
