/** Rule 11 approval panel on the quotation page: status, reasons, history and the request / approve / reject forms. */
import { ShieldCheck } from "lucide-react";
import { Field, Textarea } from "@/components/ui";
import { ActivityFeed, SectionCard, StatusPill, type StatusSemantic } from "@/components/patterns";
import { SubmitButton } from "@/components/submit-button";
import { fmtDateTime } from "@/lib/format";
import { APPROVAL_MODE_LABEL, parseApprovalStatus, type ApprovalMode } from "@/lib/pricing";
import { approveQuotation, rejectQuotation, requestApproval } from "../actions";

export type ApprovalHistoryEntry = { id: number; at: Date; userName: string | null; status: string; note: string | null; reason: string | null };

type Props = {
  quotationId: number;
  approvalStatus: string;
  approvalNote: string | null;
  requestedAt: Date | null;
  requestedByName: string | null;
  decidedAt: Date | null;
  decidedByName: string | null;
  /** why approval is needed now (empty = not needed) */
  reasons: string[];
  mode: ApprovalMode;
  /** quotation is still draft / sent / negotiation */
  editable: boolean;
  canRequest: boolean;
  isAdmin: boolean;
  history: ApprovalHistoryEntry[];
};

const HISTORY_LABEL: Record<string, string> = {
  pending: "Approval requested", approved: "Approved", rejected: "Not approved", not_required: "Approval no longer needed",
};
const HISTORY_SEMANTIC: Record<string, StatusSemantic> = { pending: "warning", approved: "success", rejected: "danger", not_required: "neutral" };

export function approvalChip(status: string, needs: boolean): { label: string; semantic: StatusSemantic } {
  const s = parseApprovalStatus(status);
  if (s === "pending") return { label: "Awaiting approval", semantic: "warning" };
  if (s === "approved") return { label: "Approved", semantic: "success" };
  if (s === "rejected") return { label: "Not approved", semantic: "danger" };
  return needs ? { label: "Approval needed", semantic: "warning" } : { label: "No approval needed", semantic: "neutral" };
}

export function ApprovalPanel(p: Props) {
  const status = parseApprovalStatus(p.approvalStatus);
  const needs = p.reasons.length > 0;
  const chip = approvalChip(status, needs);
  const showRequest = p.editable && p.canRequest && needs && (status === "not_required" || status === "rejected");
  const showDecide = p.editable && p.isAdmin && status === "pending";
  const showDirectApprove = p.editable && p.isAdmin && needs && (status === "not_required" || status === "rejected");

  const trail: string[] = [];
  if (p.requestedAt) trail.push(`Requested by ${p.requestedByName ?? "someone"} at ${fmtDateTime(p.requestedAt)}`);
  if (p.decidedAt && (status === "approved" || status === "rejected")) {
    trail.push(`${status === "approved" ? "approved" : "not approved"} by ${p.decidedByName ?? "an admin"} at ${fmtDateTime(p.decidedAt)}`);
  }

  return (
    <SectionCard id="approval" title="Approval" icon={ShieldCheck} actions={<StatusPill semantic={chip.semantic} label={chip.label} />}>
      <div className="space-y-3 text-sm">
        {needs ? (
          <ul className="list-disc space-y-0.5 pl-5 text-ink-soft">
            {p.reasons.map((r) => <li key={r}>{r}</li>)}
          </ul>
        ) : (
          <p className="text-ink-soft">
            {p.mode === "off" ? "Approval before sending is switched off in Settings." : "Prices meet the margin policy, so this quotation can be sent without approval."}
          </p>
        )}
        {trail.length > 0 && <p className="text-caption text-ink-soft">{trail.join(", ")}.</p>}
        {p.approvalNote && (status !== "not_required" || needs) && (
          <p className="whitespace-pre-line rounded-lg bg-muted p-2.5 text-caption text-ink"><span className="font-medium">Note: </span>{p.approvalNote}</p>
        )}
        {status === "pending" && !p.isAdmin && <p className="text-caption text-ink-soft">Sending, emailing and marking won are locked until an admin approves.</p>}

        {showRequest && (
          <form action={requestApproval} className="space-y-2">
            <input type="hidden" name="id" value={p.quotationId} />
            <Field label="Note for the approver" hint="Optional, for example why the price is lower than usual">
              <Textarea name="note" rows={2} maxLength={1000} className="min-h-16" />
            </Field>
            <SubmitButton className="w-full" pendingText="Requesting…">{status === "rejected" ? "Request approval again" : "Request approval"}</SubmitButton>
          </form>
        )}

        {showDecide && (
          <div className="space-y-3">
            <form action={approveQuotation} className="space-y-2">
              <input type="hidden" name="id" value={p.quotationId} />
              <Field label="Approval note" hint="Optional"><Textarea name="note" rows={2} maxLength={1000} className="min-h-16" /></Field>
              <SubmitButton className="w-full" pendingText="Approving…">Approve prices</SubmitButton>
            </form>
            <details className="group rounded-lg border border-line">
              <summary className="cursor-pointer select-none rounded-lg px-3 py-2 text-sm font-medium text-ink hover:bg-muted">Send back with a note</summary>
              <form action={rejectQuotation} className="space-y-2 border-t border-line p-3">
                <input type="hidden" name="id" value={p.quotationId} />
                <Field label="What should sales change?" required>
                  <Textarea name="note" rows={2} required minLength={3} maxLength={1000} className="min-h-16" />
                </Field>
                <SubmitButton variant="danger" className="w-full" pendingText="Saving…" confirm="Send this quotation back to sales as not approved?">Reject with note</SubmitButton>
              </form>
            </details>
          </div>
        )}

        {showDirectApprove && (
          <form action={approveQuotation}>
            <input type="hidden" name="id" value={p.quotationId} />
            <SubmitButton variant="secondary" size="sm" className="w-full" pendingText="Approving…" confirm="Approve these prices now as admin?">Approve now</SubmitButton>
          </form>
        )}

        {p.history.length > 0 && (
          <div className="border-t border-line pt-3">
            <p className="mb-2 text-overline uppercase text-ink-faint">History</p>
            <ActivityFeed items={p.history.map((h) => ({
              id: h.id,
              title: <>{HISTORY_LABEL[h.status] ?? h.status}{h.reason ? <span className="text-ink-soft"> ({h.reason})</span> : null}</>,
              by: h.userName ?? "System",
              at: fmtDateTime(h.at),
              semantic: HISTORY_SEMANTIC[h.status] ?? "neutral",
              body: h.note ? <span className="whitespace-pre-line">“{h.note}”</span> : undefined,
            }))} />
          </div>
        )}
        <p className="text-caption text-ink-faint">Policy: {APPROVAL_MODE_LABEL[p.mode]}.</p>
      </div>
    </SectionCard>
  );
}
