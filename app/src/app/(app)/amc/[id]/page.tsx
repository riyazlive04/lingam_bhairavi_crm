import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { Ban, CalendarClock, ClipboardCheck, FileText, Printer, Receipt, RefreshCw, UserCog, Wrench } from "lucide-react";
import { getDb } from "@/db";
import { amcContracts, amcVisits, customers, projects, serviceCalls, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fmtDate, fmtDateTime, money, todayIST } from "@/lib/format";
import {
  BILLING_FREQUENCIES, COVERAGE, billingSchedule, checklistStats, currentBillingPeriod, effectiveAmcStatus, expiryInfo, renewalDates, slaState,
} from "@/lib/amc";
import { Field, Flash, Input, LinkButton, Select, Textarea } from "@/components/ui";
import {
  Callout, ConfirmButton, DetailPage, KeyValueGrid, MenuLink, MetaChip, Metric, ResponsiveTable, SectionCard, StatusPill, Tabs, activeTab,
  type Column, type TabItem,
} from "@/components/patterns";
import { SubmitButton } from "@/components/submit-button";
import { ExpiryPill, SystemChips } from "../_components/system-chips";
import { amcAccess } from "../_lib/access";
import { assignContractEngineer, cancelContract, renewContract } from "../actions";

export const metadata = { title: "AMC contract" };

export default async function ContractPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string; tab?: string }> }) {
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
  const callHref = `/service-calls/new?customerId=${c.customerId}&contractId=${c.id}`;
  const now = new Date();
  const lateVisits = visits.filter(({ v }) => v.status === "scheduled" && v.scheduledDate < today);
  // The next visit an engineer can record: the earliest scheduled or missed one.
  const nextVisit = visits.find(({ v }) => v.status === "scheduled" || v.status === "missed");
  const canRecord = acc.write && live;
  const freqLabel = BILLING_FREQUENCIES[c.billingFrequency as keyof typeof BILLING_FREQUENCIES] ?? c.billingFrequency;

  // ------------------------------------------------------------------ tabs
  const showManage = acc.manage && live;
  const tabIds = ["visits", "calls", ...(acc.money ? ["billing" as const] : []), ...(showManage ? ["manage" as const] : [])] as const;
  const tab = activeTab(sp.tab, tabIds);
  const base = `/amc/${c.id}`;
  const tabItems: TabItem[] = [
    { id: "visits", label: "Visits", count: planned, alert: lateVisits.length > 0 },
    { id: "calls", label: "Service calls", count: calls.length },
    ...(acc.money ? [{ id: "billing", label: "Billing" }] : []),
    ...(showManage ? [{ id: "manage", label: "Renew and assign" }] : []),
  ];

  // ------------------------------------------------------------------ tables
  type Visit = (typeof visits)[number];
  const visitCols: Column<Visit>[] = [
    {
      key: "n", header: "Visit", card: "title", nowrap: true,
      cell: ({ v }, i) => <Link href={`/amc/${c.id}/visits/${v.id}`} className="rt-stretch font-medium text-brand-700 hover:underline dark:text-brand-300">Visit {i + 1}</Link>,
    },
    {
      key: "date", header: "Date", card: "subtitle", nowrap: true,
      cell: ({ v }) => {
        const late = v.status === "scheduled" && v.scheduledDate < today;
        return <span className={late ? "font-medium text-danger" : undefined}>{v.status === "done" ? `Done ${fmtDate(v.doneDate)}` : `Planned ${fmtDate(v.scheduledDate)}`}</span>;
      },
    },
    {
      key: "status", header: "Status", card: "badge",
      cell: ({ v }) => (v.status === "scheduled" && v.scheduledDate < today ? <StatusPill status="overdue" /> : <StatusPill status={v.status} />),
    },
    { key: "engineer", header: "Engineer", cell: ({ engineerName }) => engineerName ?? <span className="text-ink-faint">No engineer</span> },
    {
      key: "result", header: "Checklist", priority: 3,
      cell: ({ v }) => {
        const stats = checklistStats(v.checklist ?? []);
        if (v.status !== "done" || stats.total === 0) return <span className="text-ink-faint">-</span>;
        return <>{stats.ok} OK{stats.notOk > 0 && <span className="font-medium text-danger">, {stats.notOk} not OK</span>}</>;
      },
    },
    {
      key: "actions", header: <span className="sr-only">Actions</span>, label: "Actions", card: "actions", align: "right",
      cell: ({ v }) => (
        <div className="relative z-[1] flex flex-wrap justify-end gap-2 max-sm:justify-start">
          {canRecord && (v.status === "scheduled" || v.status === "missed") && (
            <LinkButton size="sm" href={`/amc/${c.id}/visits/${v.id}`}><ClipboardCheck className="icon-sm" aria-hidden /> Record visit</LinkButton>
          )}
          {v.status === "done" && (
            <LinkButton size="sm" variant="ghost" href={`/amc/${c.id}/visits/${v.id}/print`}><Printer className="icon-sm" aria-hidden /> Print report</LinkButton>
          )}
        </div>
      ),
    },
  ];

  type Call = (typeof calls)[number];
  const callCols: Column<Call>[] = [
    {
      key: "no", header: "Call", card: "title", nowrap: true,
      cell: (s) => <><Link href={`/service-calls/${s.id}`} className="rt-stretch font-medium text-brand-700 hover:underline dark:text-brand-300">{s.number}</Link><div className="text-caption font-normal text-ink-soft">{fmtDateTime(s.raisedAt)}</div></>,
    },
    { key: "issue", header: "Issue", card: "subtitle", className: "max-w-72 truncate", cell: (s) => s.description },
    { key: "status", header: "Status", card: "badge", cell: (s) => <StatusPill status={s.status} /> },
    {
      key: "sla", header: "SLA", nowrap: true,
      cell: (s) => {
        const sla = slaState(s, now);
        return <span className={sla.state === "breached" ? "font-medium text-danger" : "text-ink-soft"}>{sla.label}</span>;
      },
    },
    ...(acc.money ? [{ key: "charge", header: "Charge", align: "right" as const, card: "amount" as const, nowrap: true,
      cell: (s: Call) => (s.chargeable ? money(s.chargeAmount) : "Under AMC") }] : []),
  ];

  // ------------------------------------------------------------------ actions
  const primary = canRecord && nextVisit
    ? <LinkButton href={`/amc/${c.id}/visits/${nextVisit.v.id}`}><ClipboardCheck className="icon-sm" aria-hidden /> Record visit</LinkButton>
    : canRecord
      ? <LinkButton href={callHref}><Wrench className="icon-sm" aria-hidden /> Log a call</LinkButton>
      : null;
  const secondary = (
    <>
      <LinkButton variant="secondary" href={`/amc/${c.id}/print`}><Printer className="icon-sm" aria-hidden /> Print contract</LinkButton>
      {canRecord && nextVisit && <LinkButton variant="secondary" href={callHref}><Wrench className="icon-sm" aria-hidden /> Log a call</LinkButton>}
      {acc.money && acc.billing && live && Number(c.value) > 0 && (
        <LinkButton variant="secondary" href={invoiceHref}><Receipt className="icon-sm" aria-hidden /> Create invoice</LinkButton>
      )}
    </>
  );
  const more = showManage && (
    <>
      <MenuLink href={`${base}?tab=manage`} icon={RefreshCw}>Renew contract</MenuLink>
      <MenuLink href={`${base}?tab=manage`} icon={UserCog}>Change engineer</MenuLink>
      <form action={cancelContract} className="mt-1 space-y-1.5 border-t border-line pt-2">
        <input type="hidden" name="id" value={c.id} />
        <label className="block px-1 text-caption font-medium text-ink-soft">
          Reason for cancelling
          <Textarea name="reason" rows={2} maxLength={500} placeholder="e.g. Customer moved to another vendor" className="mt-1 min-h-14" />
        </label>
        <ConfirmButton variant="ghost" className="text-danger" confirmVariant="danger" stacked pendingText="Cancelling…" confirmLabel="Yes, cancel contract"
          confirm="Cancel this contract? Remaining visits will be cancelled.">
          <Ban className="icon-sm" aria-hidden /> Cancel contract
        </ConfirmButton>
      </form>
    </>
  );

  return (
    <DetailPage
      back={{ href: "/amc", label: "AMC contracts" }}
      eyebrow="AMC contract"
      title={c.number}
      status={<><StatusPill status={status} />{live && <ExpiryPill info={exp} />}</>}
      meta={
        <>
          <MetaChip label="Customer">{row.customerName}</MetaChip>
          <MetaChip label="Period">{fmtDate(c.startDate)} to {fmtDate(c.endDate)}</MetaChip>
          <MetaChip label="Engineer">{row.engineerName ?? "Unassigned"}</MetaChip>
          <MetaChip label="Visits">{done} of {planned} done</MetaChip>
          {acc.money && <MetaChip label="Value">{money(c.value)}</MetaChip>}
        </>
      }
      primaryAction={primary}
      secondaryActions={secondary}
      moreActions={more || undefined}
      notices={
        <>
          <Flash ok={sp.ok} err={sp.err} />
          {renewalOf.map((r) => (
            <Callout key={`of-${r.id}`} tone="info" title="Renewal contract">
              This contract renews <Link className="font-medium text-brand-700 hover:underline dark:text-brand-300" href={`/amc/${r.id}`}>{r.number}</Link>.
            </Callout>
          ))}
          {renewedAs.map((r) => (
            <Callout key={`as-${r.id}`} tone="success" title={`Renewed as ${r.number}`}
              action={<LinkButton size="sm" variant="secondary" href={`/amc/${r.id}`}>Open {r.number}</LinkButton>}>
              The new contract is {r.status}. Visits and calls continue there.
            </Callout>
          ))}
          {live && lateVisits.length > 0 && (
            <Callout tone="danger" title={`${lateVisits.length} visit${lateVisits.length === 1 ? " is" : "s are"} overdue`}>
              The planned date has passed. Record the visit, or reschedule it with the site.
            </Callout>
          )}
          {status === "expired" && renewedAs.length === 0 && (
            <Callout tone="warning" title="This contract has lapsed">
              The end date has passed and it has not been renewed yet.{showManage ? " Use Renew and assign to create the next contract." : ""}
            </Callout>
          )}
        </>
      }
      tabs={<Tabs label="Contract sections" basePath={base} params={{ tab: sp.tab }} active={tab} items={tabItems} />}
      aside={
        <SectionCard title="Contract details" icon={FileText}>
          <KeyValueGrid columns={1} items={[
            { label: "Customer", value: <>{row.customerName}{row.customerPhone && <> · <a href={`tel:${row.customerPhone}`} className="text-brand-700 hover:underline dark:text-brand-300">{row.customerPhone}</a></>}</> },
            { label: "Project", value: c.projectId ? <Link href={`/projects/${c.projectId}`} className="text-brand-700 hover:underline dark:text-brand-300">{row.projectCode} · {row.projectName}</Link> : null },
            { label: "Site", value: c.siteAddress ? <span className="whitespace-pre-line">{c.siteAddress}</span> : null },
            { label: "Systems", value: <SystemChips systems={c.systems} /> },
            { label: "Coverage", value: COVERAGE[c.coverage as keyof typeof COVERAGE] ?? c.coverage },
            { label: "Breakdown response", value: `Within ${c.responseHours} hours` },
            { label: "Preventive visits", value: `${c.visitsPerYear} per year` },
            ...(acc.money ? [
              { label: "Contract value", value: `${money(c.value)} excl. GST` },
              { label: "Billing", value: freqLabel },
            ] : []),
            ...(c.scope ? [{ label: "Scope of work", value: <span className="whitespace-pre-line font-normal">{c.scope}</span> }] : []),
            ...(c.notes ? [{ label: "Notes", value: <span className="whitespace-pre-line font-normal">{c.notes}</span> }] : []),
          ]} />
        </SectionCard>
      }
    >
      {tab === "visits" && (
        <SectionCard title="Visit schedule" count={planned} icon={CalendarClock} flush={visits.length > 0}
          description={`${done} of ${planned} done`}
          empty={visits.length === 0 && "No preventive visits on this contract because visits per year is 0. Breakdown calls can still be logged."}>
          <ResponsiveTable flush rows={visits} columns={visitCols} rowKey={({ v }) => v.id} caption="Visit schedule"
            rowClassName={({ v }) => v.status === "cancelled" && "opacity-60"} />
        </SectionCard>
      )}

      {tab === "calls" && (
        <SectionCard title="Service calls" count={calls.length} icon={Wrench} flush={calls.length > 0}
          actions={canRecord && <LinkButton size="sm" variant="secondary" href={callHref}>Log a call</LinkButton>}
          empty={calls.length === 0 && "No breakdown calls on this contract yet."}>
          <ResponsiveTable flush rows={calls} columns={callCols} rowKey={(s) => s.id} caption="Service calls" />
        </SectionCard>
      )}

      {tab === "billing" && acc.money && (
        <SectionCard title="Billing" icon={Receipt}
          actions={acc.billing && live && Number(c.value) > 0 && <LinkButton size="sm" href={invoiceHref}>Create invoice</LinkButton>}
          empty={Number(c.value) <= 0 && "No contract value set, so there is nothing to bill."}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Due this period" value={current ? money(current.amount) : "-"}
              hint={current ? `Period ${current.index} of ${periods.length}: ${fmtDate(current.from)} to ${fmtDate(current.to)}` : "Contract term is over"} />
            <Metric label={`Per ${c.billingFrequency === "one_time" ? "contract" : "period"}`} value={money(periods[0]?.amount ?? 0)} hint={`${freqLabel}, excl. GST`} />
            <Metric label="Contract value" value={money(c.value)} hint={`${periods.length} billing period${periods.length === 1 ? "" : "s"}`} />
          </div>
          {!acc.billing && <p className="mt-3 text-caption text-ink-soft">Accounts raises the invoice from Billing.</p>}
        </SectionCard>
      )}

      {tab === "manage" && showManage && (
        <>
          <SectionCard title="Renew contract" icon={RefreshCw} description="Creates a new contract with the same systems, scope and terms. This one is marked renewed.">
            <form action={renewContract} className="space-y-4">
              <input type="hidden" name="id" value={c.id} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="New start"><Input type="date" name="startDate" defaultValue={renew.startDate} /></Field>
                <Field label="New end"><Input type="date" name="endDate" defaultValue={renew.endDate} /></Field>
                <Field label="New value (₹, excl. GST)" hint="Leave as is to keep the same value."><Input type="number" name="value" min={0} step="0.01" inputMode="decimal" className="text-right" defaultValue={Number(c.value) || ""} /></Field>
                <Field label="Visits per year"><Input type="number" name="visitsPerYear" min={0} max={52} inputMode="numeric" className="text-right" defaultValue={c.visitsPerYear} /></Field>
              </div>
              <div className="flex justify-end">
                <SubmitButton pendingText="Renewing…" className="max-sm:w-full">Renew contract</SubmitButton>
              </div>
            </form>
          </SectionCard>
          <SectionCard title="Engineer" icon={UserCog} description="Upcoming visits move to the new engineer.">
            <form action={assignContractEngineer} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <input type="hidden" name="id" value={c.id} />
              <Field label="Assigned engineer" className="flex-1">
                <Select name="engineerId" defaultValue={c.engineerId ?? ""}>
                  <option value="">Unassigned</option>
                  {engineerList.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </Select>
              </Field>
              <SubmitButton variant="secondary">Save engineer</SubmitButton>
            </form>
          </SectionCard>
        </>
      )}
    </DetailPage>
  );
}
