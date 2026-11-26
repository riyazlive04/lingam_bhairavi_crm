/**
 * One status vocabulary for every module. Pure data (no imports) so both ui.tsx and the
 * patterns can use it. Semantic meaning, not module meaning:
 *   neutral  = not started, finished without an outcome, or no longer relevant
 *   info     = live and moving normally
 *   progress = in flight, waiting on someone outside (vendor, transport, engineer)
 *   warning  = needs a person to act soon (approval, part done, due soon)
 *   success  = finished well
 *   danger   = finished badly or needs attention now (lost, overdue, breached)
 * Maintainer: Sirah Digital.
 */
export type StatusSemantic = "neutral" | "info" | "progress" | "warning" | "success" | "danger";
/** Badge colour for each semantic (Badge tones in ui.tsx). */
export const SEMANTIC_TONE: Record<StatusSemantic, "gray" | "blue" | "violet" | "amber" | "green" | "red"> = {
  neutral: "gray", info: "blue", progress: "violet", warning: "amber", success: "green", danger: "red",
};

export const STATUS_SEMANTIC: Record<string, StatusSemantic> = {
  // neutral
  draft: "neutral", not_required: "neutral", closed: "neutral", expired: "neutral", cancelled: "neutral", retired: "neutral",
  snoozed: "neutral", planning: "neutral", inactive: "neutral", released: "neutral", low: "neutral", normal: "neutral",
  // info
  sent: "info", open: "info", issued: "info", ordered: "info", scheduled: "info", active: "info", info: "info", reserved: "info",
  // progress
  in_transit: "progress", in_progress: "progress", assigned: "progress", renewed: "progress", logged: "progress", consumed: "progress",
  // warning
  pending: "warning", pending_approval: "warning", awaiting_approval: "warning", partial: "warning", partially_paid: "warning",
  negotiation: "warning", on_hold: "warning", due_soon: "warning", due: "warning", queued: "warning", warning: "warning", high: "warning",
  // success
  approved: "success", won: "success", delivered: "success", received: "success", posted: "success", paid: "success",
  completed: "success", done: "success", resolved: "success", ok: "success", adjusted: "success",
  // danger
  rejected: "danger", lost: "danger", overdue: "danger", missed: "danger", breached: "danger", failed: "danger", error: "danger",
  critical: "danger", late: "danger",
};

/** Sentence-case labels where "replace underscores" is not good enough. */
export const STATUS_LABEL: Record<string, string> = {
  not_required: "No approval needed", pending_approval: "Pending approval", awaiting_approval: "Awaiting approval",
  partially_paid: "Part paid", in_transit: "In transit", in_progress: "In progress", on_hold: "On hold", due_soon: "Due soon",
  ok: "OK",
};

export function statusSemantic(status: string): StatusSemantic {
  return STATUS_SEMANTIC[status] ?? "neutral";
}
export function statusLabel(status: string): string {
  const s = STATUS_LABEL[status];
  if (s) return s;
  const t = status.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}
