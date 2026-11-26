import type { ReactNode } from "react";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { FormFooter, FormSection, KeyValueGrid } from "@/components/patterns";
import { SubmitButton } from "@/components/submit-button";
import { fmtDate, todayIST } from "@/lib/format";
import { RETURN_REASONS, RETURN_REASON_KEYS } from "@/lib/returns";
import { saveSalesReturn } from "../actions";
import { ReturnLineEditor, type ReturnEditorLine } from "./return-line-editor";

export type SalesReturnFormProps = {
  returnId?: number;
  orderId?: number | null;
  /** fixed invoice (return started from an invoice) */
  invoiceId?: number | null;
  /** invoices of the order the user may reference on the credit note (order mode) */
  invoiceChoices?: { id: number; number: string; invoiceDate: string }[];
  selectedInvoiceId?: number | null;
  details: [string, ReactNode][];
  lines: ReturnEditorLine[];
  date?: string;
  reason?: string;
  notes?: string | null;
  /** Where Cancel goes in the sticky footer. */
  cancelHref?: string;
};

/** Customer return (credit note) form shared by "new" and "edit draft". */
export function SalesReturnForm(p: SalesReturnFormProps) {
  const today = todayIST();
  const canSave = p.lines.some((l) => l.returnable > 1e-6);
  return (
    <form action={saveSalesReturn} className="space-y-4">
      {p.returnId && <input type="hidden" name="returnId" value={p.returnId} />}
      {p.orderId && <input type="hidden" name="orderId" value={p.orderId} />}
      {p.invoiceId && <input type="hidden" name="salesInvoiceId" value={p.invoiceId} />}
      <FormSection title="Return details" description="When the goods came back and why.">
        <div className="rounded-xl border border-line bg-surface-2 p-3 sm:col-span-2"><KeyValueGrid columns={2} items={p.details} /></div>
          <Field label="Return date" required><Input type="date" name="date" required defaultValue={p.date ?? today} max={today} /></Field>
          <Field label="Reason" required>
            <Select name="reason" required defaultValue={p.reason ?? "damaged"}>
              {RETURN_REASON_KEYS.map((k) => <option key={k} value={k}>{RETURN_REASONS[k]}</option>)}
            </Select>
          </Field>
          {!p.invoiceId && p.invoiceChoices && (
            <Field label="Against invoice" hint={p.invoiceChoices.length ? "Shown on the credit note as the original invoice" : "This order has not been invoiced yet"}>
              <Select name="salesInvoiceId" defaultValue={p.selectedInvoiceId ? String(p.selectedInvoiceId) : p.invoiceChoices.length === 1 ? String(p.invoiceChoices[0].id) : ""}>
                <option value="">Not linked to an invoice</option>
                {p.invoiceChoices.map((i) => <option key={i.id} value={i.id}>{i.number} ({fmtDate(i.invoiceDate)})</option>)}
              </Select>
            </Field>
          )}
          <Field label="Notes" className={!p.invoiceId && p.invoiceChoices ? undefined : "sm:col-span-2"}>
            <Textarea name="notes" maxLength={2000} defaultValue={p.notes ?? ""} className="min-h-14" placeholder="e.g. 2 detectors cracked in transit, photos on WhatsApp" />
          </Field>
      </FormSection>
      <FormSection title="Items coming back" columns={1}
        description="Posting reduces the delivered quantity on the order. A line that comes back in full goes back to pending, so a replacement shows up in pending deliveries.">
        <div className="min-w-0"><ReturnLineEditor initial={p.lines} showRestock totalLabel="Credit note total" /></div>
      </FormSection>
      {canSave && (
        <FormFooter cancelHref={p.cancelHref} note="Save a draft to finish later. Posting gives the credit note its final number.">
          <SubmitButton name="intent" value="draft" variant="secondary" pendingText="Saving…">Save draft</SubmitButton>
          <SubmitButton name="intent" value="post" pendingText="Posting…" confirm="Post this credit note? Quantities and stock will be updated and the number is final.">Save and post</SubmitButton>
        </FormFooter>
      )}
    </form>
  );
}
