import { EXTINGUISHER_TYPES } from "@/lib/constants";
import { Field, Input, LinkButton, Select, Textarea } from "@/components/ui";
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

/** Single asset create/edit form (server component). */
export function AssetForm({ customers, values, today }: { customers: { id: number; name: string }[]; values: AssetFormValues; today: string }) {
  const v = values;
  const interval = v.refillIntervalMonths ?? 12;
  return (
    <form action={saveAsset} className="space-y-4">
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <datalist id="ext-types">{EXTINGUISHER_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Customer" required>
          <Select name="customerId" required defaultValue={v.customerId ?? ""}>
            <option value="" disabled>Select customer…</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Location" hint="Site / block / floor">
          <Input name="location" maxLength={200} defaultValue={v.location ?? ""} placeholder="e.g. Unit 2 — Ground floor, Stores" />
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
          <Input type="number" name="qty" required min={1} max={10000} step={1} inputMode="numeric" defaultValue={v.qty ?? 1} />
        </Field>
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
        <Field label="Next refill due" hint={v.id ? "Recalculated automatically when dates or interval change; enter a date only to override." : "Leave blank to calculate: last refill (or install date, or today) + interval."}>
          <Input type="date" name="nextDueDate" defaultValue={v.id ? v.nextDueDate ?? "" : ""} />
        </Field>
        <Field label="HPT due (hydraulic pressure test)">
          <Input type="date" name="hptDueDate" defaultValue={v.hptDueDate ?? ""} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea name="notes" rows={2} maxLength={1000} defaultValue={v.notes ?? ""} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <SubmitButton>{v.id ? "Save asset" : "Add asset"}</SubmitButton>
        {v.id && <LinkButton variant="secondary" href={`/refills/${v.id}`}>Cancel</LinkButton>}
      </div>
    </form>
  );
}
