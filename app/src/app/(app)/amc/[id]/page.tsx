import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { CalendarClock, ClipboardCheck, FileText, Printer, Receipt, RefreshCw, Wrench } from "lucide-react";
import { getDb } from "@/db";
import { amcContracts, amcVisits, customers, projects, serviceCalls, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fmtDate, fmtDateTime, money, todayIST } from "@/lib/format";
import {
  BILLING_FREQUENCIES, COVERAGE, billingSchedule, checklistStats, currentBillingPeriod, effectiveAmcStatus, expiryInfo, renewalDates, slaState,
} from "@/lib/amc";
import { Badge, Card, DL, EmptyState, Field, Flash, Input, LinkButton, PageHeader, Select, Table, Td, Th, Textarea, cx } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { AmcStatusBadge, SystemChips } from "../_components/system-chips";
import { amcAccess } from "../_lib/access";
import { assignContractEngineer, cancelContract, renewContract } from "../actions";

export const metadata = { title: "AMC contract" };

export default async function ContractPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const user = await requireUser("amc");
  const { id } = await params;
  const sp = await searchParams;
  const cid = Number(id);
  if (!Number.isInteger(cid) || cid <= 0) notFound();
  const db = await getDb();
  const [row] = await db
    .select({ c: amcContracts, customerName: customers.name, customerPhone: customers.phone, projectName: projects.name, projectCode: projects.code, engineerName: users.name })
    .from(amcContracts)
    .innerJoin(customers, eq(customers.id, amcContracts.customerId))
    .leftJoin(projects, eq(projects.id, amcContracts.projectId))
    .leftJoin(users, eq(users.id, amcContracts.engineerId))
    .where(eq(amcContracts.id, cid))
    .limit(1);
  if (!row) notFound();
  const c = row.c;
  const today = todayIST();
  const acc = amcAccess(user.role);

  const [visits, calls, renewedAs, renewalOf, engineerList] = await Promise.all([
    db.select({ v: amcVisits, engineerName: users.name }).from(amcVisits).leftJoin(users, eq(users.id, amcVisits.engineerId))
      .where(eq(amcVisits.contractId, cid)).orderBy(asc(amcVisits.scheduledDate), asc(amcVisits.id)),
    db.select({ id: serviceCalls.id, number: serviceCalls.number, status: serviceCalls.status, priority: serviceCalls.priority, description: serviceCalls.description,
      raisedAt: serviceCalls.raisedAt, dueBy: serviceCalls.dueBy, resolvedAt: serviceCalls.resolvedAt, chargeable: serviceCalls.chargeable, chargeAmount: serviceCalls.chargeAmount })
      .from(serviceCalls).where(eq(serviceCalls.contractId, cid)).orderBy(desc(serviceCalls.raisedAt)).limit(50),
    db.select({ id: amcContracts.id, number: amcContracts.number, status: amcContracts.status }).from(amcContracts).where(eq(amcContracts.renewalOf, cid)),
    c.renewalOf ? db.select({ id: amcContracts.id, number: amcContracts.number }).from(amcContracts).where(eq(amcContracts.id, c.renewalOf)) : Promise.resolve([]),
    acc.manage ? db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.role, "engineer"), eq(users.active, true))).orderBy(asc(users.name)) : Promise.resolve([]),
  ]);

  const status = effectiveAmcStatus(c.status, c.endDate, today);
  const exp = expiryInfo(c.endDate, today);
  const live = status === "active" || status === "expired";
  const periods = billingSchedule(c.startDate, c.endDate, Number(c.value), c.billingFrequency);
  const current = currentBillingPeriod(c.startDate, c.endDate, Number(c.value), c.billingFrequency, today);
  const done = visits.filter((v) => v.v.status === "done").length;
  const planned = visits.filter((v) => v.v.status !== "cancelled").length;
  const renew = renewalDates(c.endDate);
  const invoiceHref = `/billing/invoices/new?customerId=${c.customerId}&amcId=${c.id}`;
  const now = new Date();

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        eyebrow="AMC contract"
        title={c.number}
        subtitle={<span className="inline-flex flex-wrap items-center gap-2">{row.customerName}<AmcStatusBadge status={status} />{live && <Badge tone={exp.tone}>{exp.label}</Badge>}</span>}
        back={{ href: "/amc", label: "AMC contracts" }}
        actions={<>
          <LinkButton variant="secondary" href={`/amc/${c.id}/print`}><Printer className="h-4 w-4" aria-hidden /> Print contract</LinkButton>
          {acc.write && live && <LinkButton variant="secondary" href={`/service-calls/new?customerId=${c.customerId}&contractId=${c.id}`}><Wrench className="h-4 w-4" aria-hidden /> Log service call</LinkButton>}
        </>}
      />
      <Flash ok={sp.ok} err={sp.err} />

      {(renewalOf.length > 0 || renewedAs.length > 0) && (
        <div className="flex flex-wrap gap-3 rounded-xl border border-line bg-muted px-4 py-3 text-sm">
          {renewalOf.map((r) => <span key={r.id}>Renewal of <Link className="font-medium text-brand-700 hover:underline dark:text-brand-300" href={`/amc/${r.id}`}>{r.number}</Link></span>)}
          {renewedAs.map((r) => <span key={r.id}>Renewed as <Link className="font-medium text-brand-700 hover:underline dark:text-brand-300" href={`/amc/${r.id}`}>{r.number}</Link> ({r.status})</span>)}
        </div>
      )}

      <Card title="Contract details" icon={FileText}>
        <DL items={[
          ["Customer", <span key="c">{row.customerName}{row.customerPhone && <> · <a href={`tel:${row.customerPhone}`} className="hover:text-brand-700">{row.customerPhone}</a></>}</span>],
          ["Project", c.projectId ? <Link key="p" href={`/projects/${c.projectId}`} className="text-brand-700 hover:underline dark:text-brand-300">{row.projectCode} · {row.projectName}</Link> : "-"],
          ["Site", <span key="s" className="whitespace-pre-line">{c.siteAddress || "-"}</span>],
          ["Systems", <SystemChips key="sy" systems={c.systems} />],
          ["Period", `${fmtDate(c.startDate)} to ${fmtDate(c.endDate)}`],
          ["Coverage", COVERAGE[c.coverage as keyof typeof COVERAGE] ?? c.coverage],
          ["Breakdown response", `Within ${c.responseHours} hours`],
          ["Preventive visits", `${c.visitsPerYear} per year · ${done} of ${planned} done`],
          ["Engineer", row.engineerName ?? "Unassigned"],
          ...(acc.money ? [
            ["Contract value", `${money(c.value)} excl. GST`] as [string, string],
            ["Billing", BILLING_FREQUENCIES[c.billingFrequency as keyof typeof BILLING_FREQUENCIES] ?? c.billingFrequency] as [string, string],
          ] : []),
        ]} />
        {c.scope && <div className="mt-5"><div className="text-xs font-medium text-ink-soft">Scope of work</div><p className="mt-1 whitespace-pre-line text-sm text-ink">{c.scope}</p></div>}
        {c.notes && <div className="mt-4"><div className="text-xs font-medium text-ink-soft">Notes</div><p className="mt-1 whitespace-pre-line text-sm text-ink">{c.notes}</p></div>}
      </Card>

      <Card title={`Visit schedule (${done} of ${planned} done)`} icon={CalendarClock} bodyClassName="p-0">
        {visits.length === 0 ? (
          <p className="p-4 text-sm text-ink-soft sm:p-5">No preventive visits on this contract (visits per year is 0). Breakdown calls can still be logged.</p>
        ) : (
          <ul className="divide-y divide-line">
            {visits.map(({ v, engineerName }, i) => {
              const late = v.status === "scheduled" && v.scheduledDate < today;
              const stats = checklistStats(v.checklist ?? []);
              return (
                <li key={v.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-ink">Visit {i + 1}</span>
                      <AmcStatusBadge status={v.status} />
                      {late && <Badge tone="red">Overdue</Badge>}
                    </div>
                    <div className={cx("mt-0.5 text-sm", late ? "text-red-600" : "text-ink-soft")}>
                      {v.status === "done" ? `Done ${fmtDate(v.doneDate)}` : `Planned ${fmtDate(v.scheduledDate)}`} · {engineerName ?? "No engineer"}
                      {v.status === "done" && stats.total > 0 && <> · {stats.ok} OK{stats.notOk ? <span className="font-medium text-red-600">, {stats.notOk} not OK</span> : ""}</>}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {acc.write && (v.status === "scheduled" || v.status === "missed") && live && (
                      <LinkButton size="sm" href={`/amc/${c.id}/visits/${v.id}`}><ClipboardCheck className="h-4 w-4" aria-hidden /> Record visit</LinkButton>
                    )}
                    {v.status === "done" && <>
                      <LinkButton size="sm" variant="secondary" href={`/amc/${c.id}/visits/${v.id}`}>View report</LinkButton>
                      <LinkButton size="sm" variant="ghost" href={`/amc/${c.id}/visits/${v.id}/print`}><Printer className="h-4 w-4" aria-hidden /> Print</LinkButton>
                    </>}
                    {(v.status === "cancelled" || ((v.status === "scheduled" || v.status === "missed") && (!acc.write || !live))) && (
                      <LinkButton size="sm" variant="ghost" href={`/amc/${c.id}/visits/${v.id}`}>Details</LinkButton>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {acc.money && (
        <Card title="Billing" icon={Receipt} actions={acc.billing && live ? <LinkButton size="sm" href={invoiceHref}>Create invoice</LinkButton> : undefined}>
          {Number(c.value) <= 0 ? (
            <p className="text-sm text-ink-soft">No contract value set, so there is nothing to bill.</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-muted p-3">
                  <div className="text-xs font-medium text-ink-soft">Amount due this period</div>
                  <div className="mt-1 font-display text-xl font-bold tabular-nums text-ink">{current ? money(current.amount) : "-"}</div>
                  <div className="text-xs text-ink-soft">{current ? `Period ${current.index} of ${periods.length}: ${fmtDate(current.from)} to ${fmtDate(current.to)}` : "Contract term is over"}</div>
                </div>
                <div className="rounded-xl bg-muted p-3">
                  <div className="text-xs font-medium text-ink-soft">Per {c.billingFrequency === "one_time" ? "contract" : "period"}</div>
                  <div className="mt-1 font-display text-xl font-bold tabular-nums text-ink">{money(periods[0]?.amount ?? 0)}</div>
                  <div className="text-xs text-ink-soft">{BILLING_FREQUENCIES[c.billingFrequency as keyof typeof BILLING_FREQUENCIES] ?? c.billingFrequency}, excl. GST</div>
                </div>
                <div className="rounded-xl bg-muted p-3">
                  <div className="text-xs font-medium text-ink-soft">Contract value</div>
                  <div className="mt-1 font-display text-xl font-bold tabular-nums text-ink">{money(c.value)}</div>
                  <div className="text-xs text-ink-soft">{periods.length} billing period{periods.length === 1 ? "" : "s"}</div>
                </div>
              </div>
              {!acc.billing && <p className="mt-3 text-xs text-ink-soft">Accounts raises the invoice from Billing.</p>}
            </>
          )}
        </Card>
      )}

      <Card title={`Service calls (${calls.length})`} icon={Wrench} bodyClassName={calls.length ? "p-0" : undefined}
        actions={acc.write && live ? <LinkButton size="sm" variant="secondary" href={`/service-calls/new?customerId=${c.customerId}&contractId=${c.id}`}>Log call</LinkButton> : undefined}>
        {calls.length === 0 ? (
          <p className="text-sm text-ink-soft">No breakdown calls on this contract yet.</p>
        ) : (
          <Table className="rounded-none border-0 shadow-none">
            <thead><tr><Th>Call</Th><Th>Issue</Th><Th>Status</Th><Th>SLA</Th>{acc.money && <Th className="text-right">Charge</Th>}</tr></thead>
            <tbody>
              {calls.map((s) => {
                const sla = slaState(s, now);
                return (
                  <tr key={s.id}>
                    <Td className="whitespace-nowrap"><Link href={`/service-calls/${s.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">{s.number}</Link><div className="text-xs text-ink-soft">{fmtDateTime(s.raisedAt)}</div></Td>
                    <Td className="max-w-72 truncate">{s.description}</Td>
                    <Td><AmcStatusBadge status={s.status} /></Td>
                    <Td className={cx("whitespace-nowrap text-xs", sla.state === "breached" && "font-semibold text-red-600")}>{sla.label}</Td>
                    {acc.money && <Td className="text-right tabular-nums">{s.chargeable ? money(s.chargeAmount) : "AMC"}</Td>}
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {acc.manage && live && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Renew contract" icon={RefreshCw}>
            <form action={renewContract} className="space-y-4">
              <input type="hidden" name="id" value={c.id} />
              <p className="text-sm text-ink-soft">Creates a new contract with the same systems, scope and terms. This one is marked renewed.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="New start"><Input type="date" name="startDate" defaultValue={renew.startDate} /></Field>
                <Field label="New end"><Input type="date" name="endDate" defaultValue={renew.endDate} /></Field>
                <Field label="New value (₹, excl. GST)" hint="Leave as is to keep the same value."><Input type="number" name="value" min={0} step="0.01" inputMode="decimal" defaultValue={Number(c.value) || ""} /></Field>
                <Field label="Visits per year"><Input type="number" name="visitsPerYear" min={0} max={52} inputMode="numeric" defaultValue={c.visitsPerYear} /></Field>
              </div>
              <SubmitButton pendingText="Renewing...">Renew</SubmitButton>
            </form>
          </Card>
          <div className="space-y-6">
            <Card title="Engineer">
              <form action={assignContractEngineer} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <input type="hidden" name="id" value={c.id} />
                <Field label="Assigned engineer" className="flex-1" hint="Upcoming visits move to the new engineer.">
                  <Select name="engineerId" defaultValue={c.engineerId ?? ""}>
                    <option value="">Unassigned</option>
                    {engineerList.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </Select>
                </Field>
                <SubmitButton variant="secondary">Save</SubmitButton>
              </form>
            </Card>
            <Card title="Cancel contract">
              <form action={cancelContract} className="space-y-3">
                <input type="hidden" name="id" value={c.id} />
                <Field label="Reason"><Textarea name="reason" rows={2} maxLength={500} placeholder="e.g. Customer moved to another vendor" /></Field>
                <SubmitButton variant="danger" confirm="Cancel this contract? Remaining visits will be cancelled.">Cancel contract</SubmitButton>
              </form>
            </Card>
          </div>
        </div>
      )}

      {!live && visits.length === 0 && calls.length === 0 && (
        <EmptyState title="Nothing more to do here">This contract is {status}.</EmptyState>
      )}
    </div>
  );
}
