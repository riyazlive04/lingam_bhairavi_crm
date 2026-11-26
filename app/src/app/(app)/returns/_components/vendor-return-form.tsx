import type { ReactNode } from "react";
import { Card, DL, Field, Input, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { todayIST } from "@/lib/format";
import { saveVendorReturn } from "../actions";
import { ReturnLineEditor, type ReturnEditorLine } from "./return-line-editor";

/** Return to vendor (debit note) form shared by "new" and "edit draft". */
export function VendorReturnForm({ returnId, purchaseInvoiceId, details, lines, date, reason }: {
  returnId?: number; purchaseInvoiceId: number; details: [string, ReactNode][]; lines: ReturnEditorLine[]; date?: string; reason?: string | null;
}) {
  const today = todayIST();
  const canSave = lines.some((l) => l.returnable > 1e-6);
  return (
    <form action={saveVendorReturn} className="space-y-4">
      {returnId && <input type="hidden" name="returnId" value={returnId} />}
      <input type="hidden" name="purchaseInvoiceId" value={purchaseInvoiceId} />
      <Card title="Return details">
        <div className="mb-4"><DL items={details} /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Return date" required><Input type="date" name="date" required defaultValue={date ?? today} max={today} /></Field>
          <Field label="Reason" hint="Printed on the debit note">
            <Textarea name="reason" maxLength={1000} defaultValue={reason ?? ""} className="min-h-14" placeholder="e.g. Valves leaking on hydro test, wrong size supplied" />
          </Field>
        </div>
      </Card>
      <Card title="Items going back">
        <ReturnLineEditor initial={lines} showRestock={false} totalLabel="Debit note total" />
        <p className="mt-3 text-xs text-ink-soft">You can only send back what is in stock. Posting takes the goods out of stock and reduces what you owe this vendor.</p>
      </Card>
      {canSave && (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <SubmitButton name="intent" value="draft" variant="secondary" pendingText="Saving…">Save draft</SubmitButton>
          <SubmitButton name="intent" value="post" pendingText="Posting…" confirm="Post this debit note? Stock will be reduced and the number is final.">Save & post</SubmitButton>
        </div>
      )}
    </form>
  );
}
