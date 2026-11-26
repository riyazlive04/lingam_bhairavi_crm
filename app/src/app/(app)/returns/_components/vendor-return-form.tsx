import type { ReactNode } from "react";
import { Field, Input, Textarea } from "@/components/ui";
import { FormFooter, FormSection, KeyValueGrid } from "@/components/patterns";
import { SubmitButton } from "@/components/submit-button";
import { todayIST } from "@/lib/format";
import { saveVendorReturn } from "../actions";
import { ReturnLineEditor, type ReturnEditorLine } from "./return-line-editor";

/** Return to vendor (debit note) form shared by "new" and "edit draft". */
export function VendorReturnForm({ returnId, purchaseInvoiceId, details, lines, date, reason, cancelHref }: {
  cancelHref?: string; returnId?: number; purchaseInvoiceId: number; details: [string, ReactNode][]; lines: ReturnEditorLine[]; date?: string; reason?: string | null;
}) {
  const today = todayIST();
  const canSave = lines.some((l) => l.returnable > 1e-6);
  return (
    <form action={saveVendorReturn} className="space-y-4">
      {returnId && <input type="hidden" name="returnId" value={returnId} />}
      <input type="hidden" name="purchaseInvoiceId" value={purchaseInvoiceId} />
      <FormSection title="Return details" description="When the goods went back and why.">
        <div className="rounded-xl border border-line bg-surface-2 p-3 sm:col-span-2"><KeyValueGrid columns={2} items={details} /></div>
          <Field label="Return date" required><Input type="date" name="date" required defaultValue={date ?? today} max={today} /></Field>
          <Field label="Reason" hint="Printed on the debit note">
            <Textarea name="reason" maxLength={1000} defaultValue={reason ?? ""} className="min-h-14" placeholder="e.g. Valves leaking on hydro test, wrong size supplied" />
          </Field>
      </FormSection>
      <FormSection title="Items going back" columns={1}
        description="You can only send back what is in stock. Posting takes the goods out of stock and reduces what you owe this vendor.">
        <div className="min-w-0"><ReturnLineEditor initial={lines} showRestock={false} totalLabel="Debit note total" /></div>
      </FormSection>
      {canSave && (
        <FormFooter cancelHref={cancelHref} note="Save a draft to finish later. Posting gives the debit note its final number.">
          <SubmitButton name="intent" value="draft" variant="secondary" pendingText="Saving…">Save draft</SubmitButton>
          <SubmitButton name="intent" value="post" pendingText="Posting…" confirm="Post this debit note? Stock will be reduced and the number is final.">Save and post</SubmitButton>
        </FormFooter>
      )}
    </form>
  );
}
