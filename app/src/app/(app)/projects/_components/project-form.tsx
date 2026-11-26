import { asc, desc, eq, inArray } from "drizzle-orm";
import type { DB } from "@/db";
import { customers, quotations, users } from "@/db/schema";
import { PROJECT_STATUSES } from "@/lib/constants";
import { money0 } from "@/lib/format";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { FormFooter, FormSection, statusLabel } from "@/components/patterns";
import { SubmitButton } from "@/components/submit-button";
import { saveProject } from "../actions";

export type ProjectFormValues = {
  id?: number;
  name?: string;
  customerId?: number;
  quotationId?: number | null;
  status?: string;
  siteAddress?: string | null;
  engineerId?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  contractValue?: number;
  budget?: number;
  notes?: string | null;
};

/** Shared create/edit form (server component). */
export async function ProjectForm({ db, values, showFinancials, canAssign }: { db: DB; values: ProjectFormValues; showFinancials: boolean; canAssign: boolean }) {
  const [customerList, engineerList, quoteList] = await Promise.all([
    db.select({ id: customers.id, name: customers.name, active: customers.active }).from(customers).orderBy(asc(customers.name)),
    db.select({ id: users.id, name: users.name, active: users.active }).from(users).where(eq(users.role, "engineer")).orderBy(asc(users.name)),
    db
      .select({ id: quotations.id, number: quotations.number, projectName: quotations.projectName, status: quotations.status, customerName: customers.name, grandTotal: quotations.grandTotal })
      .from(quotations)
      .innerJoin(customers, eq(customers.id, quotations.customerId))
      .where(inArray(quotations.status, ["won", "negotiation", "sent"]))
      .orderBy(desc(quotations.quoteDate))
      .limit(300),
  ]);
  const v = values;
  const statusName = (st: string) => statusLabel(st);
  return (
    <form action={saveProject} className="space-y-4">
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <FormSection title="Project and customer" description="Who the project is for and which quotation it came from.">
        <Field label="Project name" required className="sm:col-span-2">
          <Input name="name" required maxLength={200} defaultValue={v.name ?? ""} placeholder="e.g. ABC Foods, hydrant and sprinkler, unit 2" />
        </Field>
        <Field label="Customer" required>
          <Select name="customerId" required defaultValue={v.customerId ?? ""}>
            <option value="" disabled>Select customer</option>
            {customerList.filter((c) => c.active || c.id === v.customerId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Linked quotation" hint="Optional. Must belong to the same customer. New projects copy the contract value and budget from it when those are left blank.">
          <Select name="quotationId" defaultValue={v.quotationId ?? ""}>
            <option value="">None</option>
            {quoteList.map((q) => (
              <option key={q.id} value={q.id}>
                {q.number} · {q.customerName}{q.projectName ? ` · ${q.projectName}` : ""} ({statusName(q.status)}{showFinancials ? `, ${money0(q.grandTotal)}` : ""})
              </option>
            ))}
          </Select>
        </Field>
      </FormSection>

      <FormSection title="Site and schedule" description="Where the work happens, who runs it and when.">
        <Field label="Status" required>
          <Select name="status" defaultValue={v.status ?? "planning"}>
            {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{statusName(s)}</option>)}
          </Select>
        </Field>
        <Field label="Site engineer" hint={canAssign ? undefined : "Only the owner can reassign the engineer."}>
          {canAssign ? (
            <Select name="engineerId" defaultValue={v.engineerId ?? ""}>
              <option value="">Unassigned</option>
              {engineerList.filter((e) => e.active || e.id === v.engineerId).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
          ) : (
            <Input disabled value={engineerList.find((e) => e.id === v.engineerId)?.name ?? "Me"} readOnly />
          )}
        </Field>
        <Field label="Start date">
          <Input type="date" name="startDate" defaultValue={v.startDate ?? ""} />
        </Field>
        <Field label="End date (planned or actual)">
          <Input type="date" name="endDate" defaultValue={v.endDate ?? ""} />
        </Field>
        <Field label="Site address" className="sm:col-span-2">
          <Textarea name="siteAddress" rows={2} maxLength={1000} defaultValue={v.siteAddress ?? ""} />
        </Field>
      </FormSection>

      {showFinancials && (
        <FormSection title="Cost centre" description="Used for the budget burn and margin on the costing sheet.">
          <Field label="Contract value (₹, excl. GST)" hint="What the customer pays us for this project.">
            <Input type="number" name="contractValue" min={0} step="0.01" inputMode="decimal" className="text-right" defaultValue={v.contractValue || ""} />
          </Field>
          <Field label="Budget (₹)" hint="Planned spend on materials and site expenses.">
            <Input type="number" name="budget" min={0} step="0.01" inputMode="decimal" className="text-right" defaultValue={v.budget || ""} />
          </Field>
        </FormSection>
      )}

      <FormSection title="Notes" columns={1}>
        <Field label="Notes">
          <Textarea name="notes" rows={4} maxLength={5000} defaultValue={v.notes ?? ""} />
        </Field>
      </FormSection>

      <FormFooter cancelHref={v.id ? `/projects/${v.id}` : "/projects"}>
        <SubmitButton pendingText="Saving…">{v.id ? "Save changes" : "Create project"}</SubmitButton>
      </FormFooter>
    </form>
  );
}
