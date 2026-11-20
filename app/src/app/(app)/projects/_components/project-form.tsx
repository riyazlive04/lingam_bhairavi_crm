import { asc, desc, eq, inArray } from "drizzle-orm";
import type { DB } from "@/db";
import { customers, quotations, users } from "@/db/schema";
import { PROJECT_STATUSES } from "@/lib/constants";
import { money0 } from "@/lib/format";
import { Card, Field, Input, LinkButton, Select, Textarea } from "@/components/ui";
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
  return (
    <form action={saveProject} className="space-y-6">
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <Card title="Project">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project name" required className="sm:col-span-2">
            <Input name="name" required maxLength={200} defaultValue={v.name ?? ""} placeholder="e.g. ABC Foods — Hydrant & Sprinkler, Unit 2" />
          </Field>
          <Field label="Customer" required>
            <Select name="customerId" required defaultValue={v.customerId ?? ""}>
              <option value="" disabled>Select customer…</option>
              {customerList.filter((c) => c.active || c.id === v.customerId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Linked quotation" hint="Optional. Must belong to the same customer. New projects copy contract value & budget from it when left blank.">
            <Select name="quotationId" defaultValue={v.quotationId ?? ""}>
              <option value="">— none —</option>
              {quoteList.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.number} · {q.customerName}{q.projectName ? ` · ${q.projectName}` : ""} ({q.status}{showFinancials ? `, ${money0(q.grandTotal)}` : ""})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status" required>
            <Select name="status" defaultValue={v.status ?? "planning"}>
              {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </Select>
          </Field>
          <Field label="Site engineer" hint={canAssign ? undefined : "Only the owner can re-assign the engineer."}>
            {canAssign ? (
              <Select name="engineerId" defaultValue={v.engineerId ?? ""}>
                <option value="">— unassigned —</option>
                {engineerList.filter((e) => e.active || e.id === v.engineerId).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </Select>
            ) : (
              <Input disabled value={engineerList.find((e) => e.id === v.engineerId)?.name ?? "Me"} readOnly />
            )}
          </Field>
          <Field label="Start date">
            <Input type="date" name="startDate" defaultValue={v.startDate ?? ""} />
          </Field>
          <Field label="End date (planned / actual)">
            <Input type="date" name="endDate" defaultValue={v.endDate ?? ""} />
          </Field>
          <Field label="Site address" className="sm:col-span-2">
            <Textarea name="siteAddress" rows={2} maxLength={1000} defaultValue={v.siteAddress ?? ""} />
          </Field>
        </div>
      </Card>

      {showFinancials && (
        <Card title="Cost centre">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Contract value (₹, excl. GST)" hint="What the customer pays us for this project.">
              <Input type="number" name="contractValue" min={0} step="0.01" inputMode="decimal" defaultValue={v.contractValue || ""} />
            </Field>
            <Field label="Budget (₹)" hint="Planned spend: materials + site expenses.">
              <Input type="number" name="budget" min={0} step="0.01" inputMode="decimal" defaultValue={v.budget || ""} />
            </Field>
          </div>
        </Card>
      )}

      <Card title="Notes">
        <Textarea name="notes" rows={4} maxLength={5000} defaultValue={v.notes ?? ""} aria-label="Notes" />
      </Card>

      <div className="flex flex-wrap gap-2">
        <SubmitButton>{v.id ? "Save changes" : "Create project"}</SubmitButton>
        <LinkButton variant="secondary" href={v.id ? `/projects/${v.id}` : "/projects"}>Cancel</LinkButton>
      </div>
    </form>
  );
}
