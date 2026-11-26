import { EXTINGUISHER_TYPES } from "@/lib/constants";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { FormFooter, FormSection } from "@/components/patterns";
import { SubmitButton } from "@/components/submit-button";
import { saveAsset } from "../actions";

export type AssetFormValues = {
  id?: number;
  customerId?: number;
  location?: string | null;
  extType?: string;
  make?: string | null;
  serialNo?: string | null;
  qty?: number;
  installDate?: string | null;
  lastRefillDate?: string | null;
  refillIntervalMonths?: number;
  nextDueDate?: string | null;
  hptDueDate?: string | null;
  notes?: string | null;
};

export const INTERVAL_OPTIONS = [
  [12, "1 year (12 months)"], [36, "3 years (36 months)"], [6, "6 months"], [24, "2 years"], [60, "5 years"],
] as const;

/**
 * Single asset create/edit form (server component).
 * `inline` drops the sticky footer for use inside a detail page, whose phone action bar already sits at the bottom.
 */
export function AssetForm({ customers, values, today, cancelHref, inline }: {
  customers: { id: number; name: string }[]; values: AssetFormValues; today: string; cancelHref: string; inline?: boolean;
}) {
  const v = values;
  const interval = v.refillIntervalMonths ?? 12;
  const submit = <SubmitButton pendingText="Saving…" className={inline ? "max-sm:w-full" : undefined}>{v.id ? "Save asset" : "Add asset"}</SubmitButton>;
  return (
    <form action={saveAsset} className="space-y-4">
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <datalist id="ext-types">{EXTINGUISHER_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
      <FormSection title="Extinguisher" description="Who owns it, where it is and what it is.">
        <Field label="Customer" required>
          <Select name="customerId" required defaultValue={v.customerId ?? ""}>
            <option value="" disabled>Select customer</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Location" hint="Site, block or floor">
          <Input name="location" maxLength={200} defaultValue={v.location ?? ""} placeholder="e.g. Unit 2, Ground floor, Stores" />
        </Field>
        <Field label="Type" required>
          <Input name="extType" list="ext-types" required maxLength={60} defaultValue={v.extType ?? ""} placeholder="e.g. ABC 6 Kg" />
        </Field>
        <Field label="Make">
          <Input name="make" maxLength={60} defaultValue={v.make ?? ""} placeholder="e.g. Safex, Ceasefire" />
        </Field>
        <Field label="Serial no.">
          <Input name="serialNo" maxLength={60} defaultValue={v.serialNo ?? ""} />
        </Field>
        <Field label="Quantity" required>
          <Input type="number" name="qty" required min={1} max={10000} step={1} inputMode="numeric" className="text-right" defaultValue={v.qty ?? 1} />
        </Field>
      </FormSection>
      <FormSection title="Refill dates" description="The next refill is due on the last refill (or install) date plus the interval.">
        <Field label="Install date">
          <Input type="date" name="installDate" max={today} defaultValue={v.installDate ?? ""} />
        </Field>
        <Field label="Last refill date">
          <Input type="date" name="lastRefillDate" max={today} defaultValue={v.lastRefillDate ?? ""} />
        </Field>
        <Field label="Refill interval" required>
          <Select name="refillIntervalMonths" defaultValue={interval}>
            {INTERVAL_OPTIONS.map(([m, l]) => <option key={m} value={m}>{l}</option>)}
            {!INTERVAL_OPTIONS.some(([m]) => m === interval) && <option value={interval}>{interval} months</option>}
          </Select>
        </Field>
        <Field label="Next refill due" hint={v.id ? "Recalculated when dates or interval change. Enter a date only to override." : "Leave blank to calculate it: last refill (or install date, or today) plus the interval."}>
          <Input type="date" name="nextDueDate" defaultValue={v.id ? v.nextDueDate ?? "" : ""} />
        </Field>
        <Field label="HPT due (hydraulic pressure test)">
          <Input type="date" name="hptDueDate" defaultValue={v.hptDueDate ?? ""} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea name="notes" rows={2} maxLength={1000} defaultValue={v.notes ?? ""} />
        </Field>
      </FormSection>
      {inline
        ? <div className="flex justify-end">{submit}</div>
        : <FormFooter cancelHref={cancelHref}>{submit}</FormFooter>}
    </form>
  );
}
