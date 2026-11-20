/** Server-rendered forms shared by the quotation detail page and the follow-up tracker. */
import { Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { FOLLOWUP_MODES } from "@/lib/constants";
import { addDays, todayIST } from "@/lib/format";
import { FOLLOWUP_MODE_LABEL, FOLLOWUP_OUTCOMES, FOLLOWUP_OUTCOME_LABEL } from "@/lib/quotations";
import { logFollowUp } from "../../follow-ups/actions";
import { markLost } from "../actions";

export function FollowUpForm({ quotationId, back, idPrefix, compact }: { quotationId: number; back: string; idPrefix: string; compact?: boolean }) {
  const today = todayIST();
  return (
    <form action={logFollowUp} className={compact ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-5" : "grid gap-3 sm:grid-cols-2"}>
      <input type="hidden" name="quotationId" value={quotationId} />
      <input type="hidden" name="back" value={back} />
      <Field label="Date">
        <Input id={`${idPrefix}-date`} type="date" name="date" defaultValue={today} max={today} required />
      </Field>
      <Field label="Mode">
        <Select id={`${idPrefix}-mode`} name="mode" defaultValue="call" required>
          {FOLLOWUP_MODES.map((m) => <option key={m} value={m}>{FOLLOWUP_MODE_LABEL[m] ?? m}</option>)}
        </Select>
      </Field>
      <Field label="Outcome">
        <Select id={`${idPrefix}-outcome`} name="outcome" defaultValue="">
          <option value="">—</option>
          {FOLLOWUP_OUTCOMES.map((o) => <option key={o} value={o}>{FOLLOWUP_OUTCOME_LABEL[o]}</option>)}
        </Select>
      </Field>
      <Field label="Next follow-up" hint="Leave empty if none">
        <Input id={`${idPrefix}-next`} type="date" name="nextDate" defaultValue={addDays(today, 3)} min={today} />
      </Field>
      <Field label="Notes" className={compact ? "sm:col-span-2 lg:col-span-4" : "sm:col-span-2"}>
        <Textarea id={`${idPrefix}-notes`} name="notes" rows={2} maxLength={2000} placeholder="What did the customer say?" />
      </Field>
      <div className={compact ? "flex items-end" : "sm:col-span-2 flex justify-end"}>
        <SubmitButton size="md" pendingText="Logging…">Log follow-up</SubmitButton>
      </div>
    </form>
  );
}

export function LostForm({ quotationId, back, idPrefix }: { quotationId: number; back: string; idPrefix: string }) {
  return (
    <form action={markLost} className="space-y-3">
      <input type="hidden" name="id" value={quotationId} />
      <input type="hidden" name="back" value={back} />
      <Field label="Reason lost" required>
        <Textarea id={`${idPrefix}-reason`} name="reason" rows={2} minLength={3} maxLength={1000} required placeholder="e.g. Price higher than competitor, project deferred…" />
      </Field>
      <SubmitButton variant="danger" pendingText="Saving…" confirm="Mark this quotation as lost?">Mark lost</SubmitButton>
    </form>
  );
}
