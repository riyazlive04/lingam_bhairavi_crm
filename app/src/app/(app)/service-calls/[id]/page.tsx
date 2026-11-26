import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { CheckCircle2, Clock, FileText, Lock, Pause, Phone, Play, Receipt, RotateCcw, UserCheck, Wrench } from "lucide-react";
import { getDb } from "@/db";
import { amcContracts, customers, serviceCalls, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fmtDateTime, money } from "@/lib/format";
import { CALL_PRIORITIES, COVERAGE, slaState, systemLabel, type CallPriority } from "@/lib/amc";
import { Field, Flash, Input, LinkButton, Select, Textarea } from "@/components/ui";
import {
  Callout, ConfirmButton, DetailPage, KeyValueGrid, MetaChip, SectionCard, StatusPill, StatusTimeline, type TimelineItem,
} from "@/components/patterns";
import { SubmitButton } from "@/components/submit-button";
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
  const statusForm = (status: string, children: ReactNode, opts: { variant?: "primary" | "secondary" | "ghost"; pending?: string } = {}) => (
    <form action={updateCallStatus} key={status}>
      <input type="hidden" name="id" value={s.id} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton variant={opts.variant ?? "secondary"} pendingText={opts.pending ?? "Saving…"}>{children}</SubmitButton>
    </form>
  );
  const canInvoice = !openish && s.chargeable && acc.billing && !s.salesInvoiceId && Number(s.chargeAmount) > 0;
  const invoiceHref = `/billing/invoices/new?customerId=${s.customerId}&serviceCallId=${s.id}`;
  const priorityLabel = CALL_PRIORITIES[s.priority as CallPriority] ?? s.priority;

  // ------------------------------------------------------------------ actions
  const primary = canWork && openish
    ? (s.status === "in_progress"
      ? <LinkButton href="#resolve"><CheckCircle2 className="icon-sm" aria-hidden /> Mark resolved</LinkButton>
      : statusForm("in_progress", <><Play className="icon-sm" aria-hidden /> {s.status === "open" && user.role === "engineer" ? "Take and start work" : "Start work"}</>, { variant: "primary", pending: "Starting…" }))
    : canInvoice
      ? <LinkButton href={invoiceHref}><Receipt className="icon-sm" aria-hidden /> Create invoice</LinkButton>
      : null;
  const secondary = row.customerPhone
    ? <LinkButton variant="secondary" href={`tel:${row.customerPhone}`}><Phone className="icon-sm" aria-hidden /> Call customer</LinkButton>
    : undefined;
  const showPause = canWork && s.status === "in_progress" && !!s.engineerId;
  const showReopen = acc.write && s.status === "resolved" && canWork;
  const showClose = acc.write && s.status === "resolved" && acc.manage;
  const more = (showPause || showReopen || showClose) && (
    <>
      {showPause && statusForm("assigned", <><Pause className="icon-sm" aria-hidden /> Pause (back to assigned)</>, { variant: "ghost", pending: "Pausing…" })}
      {showReopen && statusForm("in_progress", <><RotateCcw className="icon-sm" aria-hidden /> Reopen call</>, { variant: "ghost", pending: "Reopening…" })}
      {showClose && (
        <form action={updateCallStatus}>
          <input type="hidden" name="id" value={s.id} />
          <input type="hidden" name="status" value="closed" />
          <ConfirmButton variant="ghost" stacked pendingText="Closing…" confirmLabel="Yes, close call"
            confirm="Close this call? A closed call cannot be reopened.">
            <Lock className="icon-sm" aria-hidden /> Close call
          </ConfirmButton>
        </form>
      )}
    </>
  );

  // ------------------------------------------------------------------ history
  const history: TimelineItem[] = [
    ...(s.resolvedAt ? [{ id: "resolved", title: sla.state === "breached" ? sla.label : "Resolved within SLA", at: fmtDateTime(s.resolvedAt), semantic: (sla.state === "breached" ? "danger" : "success") as "danger" | "success", icon: CheckCircle2, body: s.resolution ?? undefined }] : []),
    ...(s.dueBy ? [{ id: "due", title: "Response due", at: fmtDateTime(s.dueBy), semantic: (openish && sla.state === "breached" ? "danger" : "neutral") as "danger" | "neutral", icon: Clock, body: row.responseHours ? `${row.responseHours} hours under the AMC` : "48 hours, no AMC" }] : []),
    ...(s.engineerId ? [{ id: "assigned", title: `Assigned to ${isMine ? "you" : row.engineerName ?? "an engineer"}`, semantic: "progress" as const, icon: UserCheck }] : []),
    { id: "raised", title: "Call logged", at: fmtDateTime(s.raisedAt), by: s.reportedBy ? `Reported by ${s.reportedBy}` : undefined, semantic: "info", icon: Wrench },
  ];

  return (
    <DetailPage
      back={{ href: "/service-calls", label: "Service calls" }}
      eyebrow="Service call"
      title={s.number}
      status={
        <>
          <StatusPill status={s.status} />
          <StatusPill status={s.priority} label={`${priorityLabel} priority`} noDot />
          {openish && <SlaChip dueBy={s.dueBy ? new Date(s.dueBy).toISOString() : null} nowMs={now.getTime()} />}
          {!openish && sla.state !== "none" && <StatusPill semantic={sla.state === "breached" ? "danger" : "success"} label={sla.label} />}
        </>
      }
      meta={
        <>
          <MetaChip label="Customer">{row.customerName}</MetaChip>
          {s.contractId ? <MetaChip label="AMC" href={`/amc/${s.contractId}`}>{row.contractNumber}</MetaChip> : <MetaChip label="AMC">None, chargeable</MetaChip>}
          <MetaChip label="Engineer">{row.engineerName ? (isMine ? "You" : row.engineerName) : "Unassigned"}</MetaChip>
          <MetaChip label="Due by">{fmtDateTime(s.dueBy)}</MetaChip>
        </>
      }
      primaryAction={primary}
      secondaryActions={secondary}
      moreActions={more || undefined}
      notices={
        <>
          <Flash ok={sp.ok} err={sp.err} />
          {openish && sla.state === "breached" && (
            <Callout tone="danger" title="Response deadline has passed">{sla.label}. Attend the site as soon as possible and update the call.</Callout>
          )}
          {acc.write && openish && !acc.manage && s.engineerId && !isMine && (
            <Callout tone="info">This call is assigned to {row.engineerName}. Ask the office to reassign it if you are attending.</Callout>
          )}
        </>
      }
      aside={
        <>
          <SectionCard title="Call details" icon={FileText}>
            <KeyValueGrid columns={1} items={[
              { label: "Customer", value: <>{row.customerName}{row.customerPhone && <> · <a href={`tel:${row.customerPhone}`} className="text-brand-700 hover:underline dark:text-brand-300">{row.customerPhone}</a></>}</> },
              { label: "Reported by", value: s.reportedBy },
              { label: "AMC", value: s.contractId ? <Link href={`/amc/${s.contractId}`} className="text-brand-700 hover:underline dark:text-brand-300">{row.contractNumber}</Link> : "No contract (chargeable)" },
              { label: "Coverage", value: row.coverage ? COVERAGE[row.coverage as keyof typeof COVERAGE] ?? row.coverage : null },
              { label: "System", value: s.system ? systemLabel(s.system) : null },
              { label: "Raised", value: fmtDateTime(s.raisedAt) },
              { label: "Response due by", value: `${fmtDateTime(s.dueBy)}${row.responseHours ? ` (${row.responseHours} h AMC)` : " (48 h, no AMC)"}` },
              ...(s.resolvedAt ? [{ label: "Resolved", value: fmtDateTime(s.resolvedAt) }] : []),
            ]} />
          </SectionCard>
          <SectionCard title="History">
            <StatusTimeline items={history} />
          </SectionCard>
        </>
      }
    >
      <SectionCard title="Problem reported" icon={Wrench}>
        <p className="whitespace-pre-line text-sm text-ink">{s.description}</p>
        {s.resolution && (
          <div className="mt-4 border-t border-line pt-4">
            <p className="text-caption font-medium text-ink-soft">Resolution</p>
            <p className="mt-1 whitespace-pre-line text-sm text-ink">{s.resolution}</p>
          </div>
        )}
      </SectionCard>

      {acc.write && openish && (acc.manage || !s.engineerId) && (
        <SectionCard title="Engineer" icon={UserCheck}>
          {acc.manage ? (
            <form action={assignCall} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <input type="hidden" name="id" value={s.id} />
              <Field label="Assigned engineer" className="flex-1">
                <Select name="engineerId" defaultValue={s.engineerId ?? ""} className="h-11 sm:h-9.5">
                  <option value="">Unassigned</option>
                  {engineerList.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </Select>
              </Field>
              <SubmitButton variant="secondary" className="max-sm:h-11">Save engineer</SubmitButton>
            </form>
          ) : (
            <form action={assignCall}>
              <input type="hidden" name="id" value={s.id} />
              <input type="hidden" name="engineerId" value={user.id} />
              <SubmitButton size="lg" variant="secondary" className="w-full sm:w-auto">Take this call</SubmitButton>
            </form>
          )}
        </SectionCard>
      )}

      {canWork && openish && (
        <SectionCard id="resolve" title="Resolve call" icon={CheckCircle2} description="Write what was done on site. The customer sees this on the invoice if it is chargeable.">
          <form action={resolveCall} className="space-y-4">
            <input type="hidden" name="id" value={s.id} />
            <Field label="What was done?" required>
              <Textarea name="resolution" required rows={4} maxLength={4000} placeholder="e.g. Replaced jockey pump pressure switch, tested auto start, system normal" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-line px-3 text-sm text-ink hover:border-line-strong">
                <input type="checkbox" name="chargeable" defaultChecked={s.chargeable} className="icon-sm accent-brand-600" />
                Chargeable to the customer
              </label>
              <Field label="Charge amount (₹, excl. GST)" hint={s.contractId ? "Only for work or spares outside the AMC coverage." : "No AMC, so this call is billable."}>
                <Input type="number" name="chargeAmount" min={0} step="0.01" inputMode="decimal" className="h-11 text-right sm:h-9.5" defaultValue={Number(s.chargeAmount) || ""} />
              </Field>
            </div>
            <div className="flex justify-end">
              <SubmitButton size="lg" pendingText="Saving…" className="w-full sm:w-auto"><CheckCircle2 className="icon-sm" aria-hidden /> Mark resolved</SubmitButton>
            </div>
          </form>
        </SectionCard>
      )}

      {!openish && (
        <SectionCard title="Charges" icon={Receipt}
          actions={canInvoice && <LinkButton size="sm" variant="secondary" href={invoiceHref}>Create invoice</LinkButton>}>
          <p className="text-sm text-ink">{s.chargeable ? <>Chargeable: <strong>{acc.money ? money(s.chargeAmount) : "yes"}</strong> excl. GST</> : "Covered by AMC, not chargeable."}</p>
          {s.salesInvoiceId && <p className="mt-2 text-sm"><Link href={`/billing/invoices/${s.salesInvoiceId}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">View invoice</Link></p>}
          {acc.manage && !s.salesInvoiceId && (
            <form action={updateCharge} className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-[auto_1fr_auto] sm:items-end">
              <input type="hidden" name="id" value={s.id} />
              <label className="flex min-h-10 items-center gap-2 text-sm text-ink">
                <input type="checkbox" name="chargeable" defaultChecked={s.chargeable} className="icon-sm accent-brand-600" /> Chargeable
              </label>
              <Field label="Amount (₹)"><Input type="number" name="chargeAmount" min={0} step="0.01" inputMode="decimal" className="text-right" defaultValue={Number(s.chargeAmount) || ""} /></Field>
              <SubmitButton variant="secondary">Update charge</SubmitButton>
            </form>
          )}
        </SectionCard>
      )}
    </DetailPage>
  );
}
