/** Rule 11 approval panel on the quotation page: status, reasons, history and the request / approve / reject forms. */
import { ShieldCheck } from "lucide-react";
import { Badge, Card, Field, Textarea, type Tone } from "@/components/ui";
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

export function approvalChip(status: string, needs: boolean): { label: string; tone: Tone } {
  const s = parseApprovalStatus(status);
  if (s === "pending") return { label: "Awaiting approval", tone: "amber" };
  if (s === "approved") return { label: "Approved", tone: "green" };
  if (s === "rejected") return { label: "Not approved", tone: "red" };
  return needs ? { label: "Approval needed", tone: "amber" } : { label: "No approval needed", tone: "gray" };
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
    <Card title="Approval" icon={ShieldCheck} actions={<Badge tone={chip.tone} dot>{chip.label}</Badge>}>
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
        {trail.length > 0 && <p className="text-xs text-ink-soft">{trail.join(", ")}.</p>}
        {p.approvalNote && (status !== "not_required" || needs) && (
          <p className="whitespace-pre-line rounded-lg bg-muted p-2 text-xs text-ink"><span className="font-medium">Note: </span>{p.approvalNote}</p>
        )}
        {status === "pending" && !p.isAdmin && <p className="text-xs text-ink-soft">Sending, emailing and marking won are locked until an admin approves.</p>}

        {showRequest && (
          <form action={requestApproval} className="space-y-2">
            <input type="hidden" name="id" value={p.quotationId} />
            <Field label="Note for the approver" hint="Optional, e.g. why the price is lower than usual">
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
              <SubmitButton variant="success" className="w-full" pendingText="Approving…">Approve</SubmitButton>
            </form>
            <details className="rounded-lg border border-line p-3">
              <summary className="cursor-pointer text-sm font-semibold text-red-700 dark:text-red-400">Reject</summary>
              <form action={rejectQuotation} className="mt-3 space-y-2">
                <input type="hidden" name="id" value={p.quotationId} />
                <Field label="What should sales change?" required>
                  <Textarea name="note" rows={2} required minLength={3} maxLength={1000} className="min-h-16" />
                </Field>
                <SubmitButton variant="danger" className="w-full" pendingText="Saving…">Reject with note</SubmitButton>
              </form>
            </details>
          </div>
        )}

        {showDirectApprove && (
          <form action={approveQuotation}>
            <input type="hidden" name="id" value={p.quotationId} />
            <SubmitButton variant="secondary" size="sm" className="w-full" pendingText="Approving…" confirm="Approve these prices now?">Approve now (admin)</SubmitButton>
          </form>
        )}

        {p.history.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer font-medium text-ink-soft">History ({p.history.length})</summary>
            <ol className="mt-2 space-y-1.5 border-l border-line pl-3">
              {p.history.map((h) => (
                <li key={h.id} className="text-ink-soft">
                  <span className="font-medium text-ink">{HISTORY_LABEL[h.status] ?? h.status}</span>
                  {h.reason ? ` (${h.reason})` : ""} by {h.userName ?? "system"}, {fmtDateTime(h.at)}
                  {h.note && <div className="whitespace-pre-line text-ink">“{h.note}”</div>}
                </li>
              ))}
            </ol>
          </details>
        )}
        <p className="text-[11px] text-ink-faint">Policy: {APPROVAL_MODE_LABEL[p.mode]}.</p>
      </div>
    </Card>
  );
}
