import { Field, Input, Textarea } from "@/components/ui";
import { FormFooter, FormSection } from "@/components/patterns";
import { SubmitButton } from "@/components/submit-button";
import { SYSTEMS } from "@/lib/constants";
import type { vendors } from "@/db/schema";

type Vendor = typeof vendors.$inferSelect;

export function VendorForm({ action, vendor, cancelHref }: { action: (fd: FormData) => Promise<void>; vendor?: Vendor; cancelHref: string }) {
  const sys = new Set(vendor?.systems ?? []);
  return (
    <form action={action} className="space-y-4">
      <FormSection title="Supplier details" description="As printed on their invoice.">
        <Field label="Name" required className="sm:col-span-2"><Input name="name" required maxLength={200} defaultValue={vendor?.name} /></Field>
        <Field label="Contact person"><Input name="contactPerson" maxLength={120} defaultValue={vendor?.contactPerson ?? ""} /></Field>
        <Field label="Phone"><Input name="phone" type="tel" maxLength={30} defaultValue={vendor?.phone ?? ""} /></Field>
        <Field label="Email"><Input name="email" type="email" maxLength={160} defaultValue={vendor?.email ?? ""} /></Field>
        <Field label="GSTIN" hint="15 characters, e.g. 33ABCDE1234F1Z5"><Input name="gstin" maxLength={15} defaultValue={vendor?.gstin ?? ""} autoCapitalize="characters" /></Field>
        <Field label="City"><Input name="city" maxLength={80} defaultValue={vendor?.city ?? ""} /></Field>
        <Field label="Payment terms (days)" required hint="Default due date for purchase invoices">
          <Input name="paymentTermsDays" type="number" inputMode="numeric" min={0} max={365} required defaultValue={vendor?.paymentTermsDays ?? 30} className="text-right" />
        </Field>
        <Field label="Address" className="sm:col-span-2"><Textarea name="address" defaultValue={vendor?.address ?? ""} /></Field>
      </FormSection>
      <FormSection title="Systems supplied" description="Used to find vendors for a system.">
        <fieldset className="sm:col-span-2">
          <legend className="sr-only">Systems supplied</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(SYSTEMS).map(([k, v]) => (
              <label key={k} className="flex min-h-9 items-center gap-2 text-sm text-ink">
                <input type="checkbox" name="systems" value={k} defaultChecked={sys.has(k)} className="icon-sm accent-brand-600" /> {v}
              </label>
            ))}
          </div>
        </fieldset>
      </FormSection>
      <FormSection title="Other" columns={1}>
        <Field label="Notes"><Textarea name="notes" defaultValue={vendor?.notes ?? ""} /></Field>
        {vendor && (
          <label className="flex min-h-9 items-center gap-2 text-sm text-ink">
            <input type="checkbox" name="active" defaultChecked={vendor.active} className="icon-sm accent-brand-600" /> Active
          </label>
        )}
      </FormSection>
      <FormFooter cancelHref={cancelHref}>
        <SubmitButton pendingText="Saving…">{vendor ? "Save changes" : "Create vendor"}</SubmitButton>
      </FormFooter>
    </form>
  );
}
