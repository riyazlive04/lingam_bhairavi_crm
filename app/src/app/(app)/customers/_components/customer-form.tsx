import { Card, Field, Input, LinkButton, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type { customers } from "@/db/schema";

type Customer = typeof customers.$inferSelect;
export const CUSTOMER_TYPES = { customer: "Customer", consultant: "Consultant", builder: "Builder" } as const;

export function CustomerForm({ action, customer, cancelHref }: { action: (fd: FormData) => Promise<void>; customer?: Customer; cancelHref: string }) {
  return (
    <form action={action} className="space-y-4">
      <Card title="Customer">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required className="sm:col-span-2"><Input name="name" required maxLength={200} defaultValue={customer?.name} /></Field>
          <Field label="Type" required>
            <Select name="type" defaultValue={customer?.type ?? "customer"}>
              {Object.entries(CUSTOMER_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Contact person"><Input name="contactPerson" maxLength={120} defaultValue={customer?.contactPerson ?? ""} /></Field>
          <Field label="Phone"><Input name="phone" type="tel" maxLength={30} defaultValue={customer?.phone ?? ""} /></Field>
          <Field label="Email" hint="Used for quotations and payment reminders"><Input name="email" type="email" maxLength={160} defaultValue={customer?.email ?? ""} /></Field>
          <Field label="GSTIN"><Input name="gstin" maxLength={15} defaultValue={customer?.gstin ?? ""} autoCapitalize="characters" /></Field>
          <Field label="City"><Input name="city" maxLength={80} defaultValue={customer?.city ?? ""} /></Field>
          <Field label="State"><Input name="state" maxLength={60} defaultValue={customer?.state ?? "Tamil Nadu"} /></Field>
          <Field label="Address" className="sm:col-span-2"><Textarea name="address" defaultValue={customer?.address ?? ""} /></Field>
        </div>
      </Card>
      <Card title="Credit & reminders">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Payment terms (days)" required><Input name="paymentTermsDays" type="number" min={0} max={365} required defaultValue={customer?.paymentTermsDays ?? 30} /></Field>
          <Field label="Credit limit (₹)" hint="0 = no limit"><Input name="creditLimit" type="number" min={0} step="1" defaultValue={customer?.creditLimit ?? 0} /></Field>
          <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
            <input type="checkbox" name="autoReminders" defaultChecked={customer?.autoReminders ?? true} className="h-4 w-4 accent-brand-600" />
            Send automatic payment reminders
          </label>
          {customer && (
            <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
              <input type="checkbox" name="active" defaultChecked={customer.active} className="h-4 w-4 accent-brand-600" /> Active
            </label>
          )}
          <Field label="Notes" className="sm:col-span-2"><Textarea name="notes" defaultValue={customer?.notes ?? ""} /></Field>
        </div>
      </Card>
      <div className="flex flex-wrap gap-2">
        <SubmitButton>{customer ? "Save changes" : "Create customer"}</SubmitButton>
        <LinkButton href={cancelHref} variant="secondary">Cancel</LinkButton>
      </div>
    </form>
  );
}
