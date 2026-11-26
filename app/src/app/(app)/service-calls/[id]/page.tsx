import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { amcContracts, customers, serviceCalls, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fmtDateTime, money } from "@/lib/format";
import { CALL_PRIORITIES, COVERAGE, PRIORITY_TONE, slaState, systemLabel, type CallPriority } from "@/lib/amc";
import { Badge, Card, DL, Field, Flash, Input, LinkButton, PageHeader, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { AmcStatusBadge } from "../../amc/_components/system-chips";
import { amcAccess } from "../../amc/_lib/access";
import { SlaChip } from "../_components/sla-chip";
import { assignCall, resolveCall, updateCallStatus, updateCharge } from "../actions";

export const metadata = { title: "Service call" };

export default async function CallPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const user = await requireUser("amc");
  const { id } = await params;
  const sp = await searchParams;
  const callId = Number(id);
  if (!Number.isInteger(callId) || callId <= 0) notFound();
  const db = await getDb();
  const [row] = await db
    .select({ s: serviceCalls, customerName: customers.name, customerPhone: customers.phone, contractNumber: amcContracts.number, coverage: amcContracts.coverage, responseHours: amcContracts.responseHours, engineerName: users.name })
    .from(serviceCalls)
    .innerJoin(customers, eq(customers.id, serviceCalls.customerId))
    .leftJoin(amcContracts, eq(amcContracts.id, serviceCalls.contractId))
    .leftJoin(users, eq(users.id, serviceCalls.engineerId))
    .where(eq(serviceCalls.id, callId))
    .limit(1);
  if (!row) notFound();
  const s = row.s;
  const acc = amcAccess(user.role);
  const now = new Date();
  const sla = slaState(s, now);
  const openish = s.status === "open" || s.status === "assigned" || s.status === "in_progress";
  const isMine = s.engineerId === user.id;
  const canWork = acc.write && (acc.manage || !s.engineerId || isMine);
  const engineerList = acc.manage
    ? await db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.role, "engineer"), eq(users.active, true))).orderBy(asc(users.name))
    : [];
  const statusBtn = (status: string, label: string, variant: "primary" | "secondary" | "ghost" = "secondary") => (
    <form action={updateCallStatus} key={status}>
      <input type="hidden" name="id" value={s.id} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton variant={variant}>{label}</SubmitButton>
    </form>
  );

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        eyebrow="Service call"
        title={s.number}
        subtitle={<span className="inline-flex flex-wrap items-center gap-2">
          {row.customerName}
          <AmcStatusBadge status={s.status} />
          <Badge tone={PRIORITY_TONE[s.priority as CallPriority] ?? "gray"}>{CALL_PRIORITIES[s.priority as CallPriority] ?? s.priority} priority</Badge>
          {openish ? <SlaChip dueBy={s.dueBy ? new Date(s.dueBy).toISOString() : null} nowMs={now.getTime()} /> : <span className={sla.state === "breached" ? "text-red-600" : "text-emerald-700 dark:text-emerald-400"}>{sla.label}</span>}
        </span>}
        back={{ href: "/service-calls", label: "Service calls" }}
      />
      <Flash ok={sp.ok} err={sp.err} />

      <Card title="Call details">
        <DL items={[
          ["Customer", <span key="c">{row.customerName}{row.customerPhone && <> · <a href={`tel:${row.customerPhone}`} className="text-brand-700 hover:underline dark:text-brand-300">{row.customerPhone}</a></>}</span>],
          ["Reported by", s.reportedBy || "-"],
          ["AMC", s.contractId ? <Link key="a" href={`/amc/${s.contractId}`} className="text-brand-700 hover:underline dark:text-brand-300">{row.contractNumber}</Link> : "No contract (chargeable)"],
          ["Coverage", row.coverage ? COVERAGE[row.coverage as keyof typeof COVERAGE] ?? row.coverage : "-"],
          ["System", s.system ? systemLabel(s.system) : "-"],
          ["Engineer", row.engineerName ? (isMine ? `${row.engineerName} (you)` : row.engineerName) : "Unassigned"],
          ["Raised", fmtDateTime(s.raisedAt)],
          ["Response due by", `${fmtDateTime(s.dueBy)}${row.responseHours ? ` (${row.responseHours} h AMC)` : " (48 h, no AMC)"}`],
          ...(s.resolvedAt ? [["Resolved", fmtDateTime(s.resolvedAt)] as [string, string]] : []),
        ]} />
        <div className="mt-5">
          <div className="text-xs font-medium text-ink-soft">Problem reported</div>
          <p className="mt-1 whitespace-pre-line text-sm text-ink">{s.description}</p>
        </div>
        {s.resolution && (
          <div className="mt-4">
            <div className="text-xs font-medium text-ink-soft">Resolution</div>
            <p className="mt-1 whitespace-pre-line text-sm text-ink">{s.resolution}</p>
          </div>
        )}
      </Card>

      {acc.write && openish && (
        <Card title="Engineer and progress">
          <div className="space-y-4">
            {acc.manage ? (
              <form action={assignCall} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <input type="hidden" name="id" value={s.id} />
                <Field label="Assigned engineer" className="flex-1">
                  <Select name="engineerId" defaultValue={s.engineerId ?? ""}>
                    <option value="">Unassigned</option>
                    {engineerList.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </Select>
                </Field>
                <SubmitButton variant="secondary">Save</SubmitButton>
              </form>
            ) : !s.engineerId ? (
              <form action={assignCall}>
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="engineerId" value={user.id} />
                <SubmitButton size="lg" className="w-full sm:w-auto">Take this call</SubmitButton>
              </form>
            ) : !isMine ? (
              <p className="text-sm text-ink-soft">This call is assigned to {row.engineerName}. Ask the office to reassign it if you are attending.</p>
            ) : null}
            {canWork && (
              <div className="flex flex-wrap gap-2">
                {(s.status === "open" || s.status === "assigned") && statusBtn("in_progress", s.status === "open" && user.role === "engineer" ? "Take and start work" : "Start work", "primary")}
                {s.status === "in_progress" && s.engineerId && statusBtn("assigned", "Pause (back to assigned)", "ghost")}
              </div>
            )}
          </div>
        </Card>
      )}

      {canWork && openish && (
        <Card title="Resolve call">
          <form action={resolveCall} id="resolve" className="space-y-4 scroll-mt-24">
            <input type="hidden" name="id" value={s.id} />
            <Field label="What was done?" required>
              <Textarea name="resolution" required rows={4} maxLength={4000} placeholder="e.g. Replaced jockey pump pressure switch, tested auto start, system normal" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex min-h-11 items-center gap-3 rounded-lg border border-line px-3 text-sm text-ink">
                <input type="checkbox" name="chargeable" defaultChecked={s.chargeable} className="h-4 w-4 accent-brand-600" />
                Chargeable to the customer
              </label>
              <Field label="Charge amount (₹, excl. GST)" hint={s.contractId ? "Only for work or spares outside the AMC coverage." : "No AMC, so this call is billable."}>
                <Input type="number" name="chargeAmount" min={0} step="0.01" inputMode="decimal" defaultValue={Number(s.chargeAmount) || ""} />
              </Field>
            </div>
            <SubmitButton size="lg" variant="success" className="w-full sm:w-auto">Mark resolved</SubmitButton>
          </form>
        </Card>
      )}

      {!openish && (
        <Card title="Charges">
          <p className="text-sm text-ink">{s.chargeable ? <>Chargeable: <strong>{acc.money ? money(s.chargeAmount) : "yes"}</strong> excl. GST</> : "Covered by AMC, not chargeable."}</p>
          {s.chargeable && acc.billing && !s.salesInvoiceId && Number(s.chargeAmount) > 0 && (
            <LinkButton className="mt-3" href={`/billing/invoices/new?customerId=${s.customerId}&serviceCallId=${s.id}`}>Create invoice</LinkButton>
          )}
          {s.salesInvoiceId && <p className="mt-2 text-sm"><Link href={`/billing/invoices/${s.salesInvoiceId}`} className="text-brand-700 hover:underline dark:text-brand-300">View invoice</Link></p>}
          {acc.manage && !s.salesInvoiceId && (
            <form action={updateCharge} className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-[auto_1fr_auto] sm:items-end">
              <input type="hidden" name="id" value={s.id} />
              <label className="flex min-h-10 items-center gap-2 text-sm text-ink">
                <input type="checkbox" name="chargeable" defaultChecked={s.chargeable} className="h-4 w-4 accent-brand-600" /> Chargeable
              </label>
              <Field label="Amount (₹)"><Input type="number" name="chargeAmount" min={0} step="0.01" inputMode="decimal" defaultValue={Number(s.chargeAmount) || ""} /></Field>
              <SubmitButton variant="secondary">Update charge</SubmitButton>
            </form>
          )}
          {acc.write && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
              {s.status === "resolved" && canWork && statusBtn("in_progress", "Reopen")}
              {s.status === "resolved" && acc.manage && statusBtn("closed", "Close call", "ghost")}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
