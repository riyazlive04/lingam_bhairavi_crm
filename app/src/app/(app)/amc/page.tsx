import Link from "next/link";
import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { CalendarClock, FileSignature, IndianRupee, Plus, RefreshCw, Wrench } from "lucide-react";
import { getDb } from "@/db";
import { amcContracts, amcVisits, customers, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { addDays, fmtDate, money0, moneyShort, todayIST } from "@/lib/format";
import { AMC_STATUSES, amcSummary, effectiveAmcStatus, expiryInfo } from "@/lib/amc";
import { Flash, LinkButton, Select } from "@/components/ui";
import {
  FilterPills, ListEmpty, ListFilters, ListPage, Metric, MetricStrip, ResponsiveTable, StatusPill, type Column, type FilterPillItem,
} from "@/components/patterns";
import { ExpiryPill, SystemChips } from "./_components/system-chips";
import { amcAccess } from "./_lib/access";

export const metadata = { title: "AMC contracts" };

type SP = { q?: string; status?: string; customerId?: string; engineerId?: string; expiring?: string; mine?: string; ok?: string; err?: string };

const STATUS_PILLS: { id: string; label: string }[] = [
  { id: "live", label: "Active and lapsed" },
  { id: "active", label: "Active" },
  { id: "expired", label: "Expired" },
  { id: "renewed", label: "Renewed" },
  { id: "cancelled", label: "Cancelled" },
  { id: "all", label: "All" },
];

export default async function AmcPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser("amc");
  const sp = await searchParams;
  const db = await getDb();
  const today = todayIST();
  const acc = amcAccess(user.role);

  const conds: SQL[] = [];
  const q = sp.q?.trim();
  if (q) {
    const like = `%${q}%`;
    const c = or(ilike(amcContracts.number, like), ilike(customers.name, like), ilike(amcContracts.siteAddress, like));
    if (c) conds.push(c);
  }
  // "live" (default) = active contracts, including ones whose end date passed but are not renewed yet
  const status = sp.status && (AMC_STATUSES as readonly string[]).includes(sp.status) ? sp.status : sp.status === "all" ? "all" : "live";
  if (status === "live") conds.push(inArray(amcContracts.status, ["active", "expired"]));
  else if (status === "active") conds.push(and(eq(amcContracts.status, "active"), gte(amcContracts.endDate, today))!);
  else if (status === "expired") conds.push(or(eq(amcContracts.status, "expired"), and(eq(amcContracts.status, "active"), sql`${amcContracts.endDate} < ${today}`))!);
  else if (status !== "all") conds.push(eq(amcContracts.status, status));
  const customerId = Number(sp.customerId) || 0;
  if (customerId) conds.push(eq(amcContracts.customerId, customerId));
  const engineerId = sp.mine === "1" ? user.id : Number(sp.engineerId) || 0;
  if (engineerId) conds.push(eq(amcContracts.engineerId, engineerId));
  if (sp.expiring === "30") conds.push(and(inArray(amcContracts.status, ["active", "expired"]), lte(amcContracts.endDate, addDays(today, 30)))!);

  const visitAgg = db
    .select({
      contractId: amcVisits.contractId,
      done: sql<number>`count(*) filter (where ${amcVisits.status} = 'done')`.mapWith(Number).as("done"),
      planned: sql<number>`count(*) filter (where ${amcVisits.status} <> 'cancelled')`.mapWith(Number).as("planned"),
      nextVisit: sql<string | null>`min(${amcVisits.scheduledDate}) filter (where ${amcVisits.status} = 'scheduled')`.as("next_visit"),
    })
    .from(amcVisits)
    .groupBy(amcVisits.contractId)
    .as("va");

  const [rows, summary, customerList, engineerList] = await Promise.all([
    db
      .select({
        id: amcContracts.id, number: amcContracts.number, status: amcContracts.status, systems: amcContracts.systems,
        value: amcContracts.value, startDate: amcContracts.startDate, endDate: amcContracts.endDate, billingFrequency: amcContracts.billingFrequency,
        customerName: customers.name, engineerName: users.name,
        done: visitAgg.done, planned: visitAgg.planned, nextVisit: visitAgg.nextVisit,
      })
      .from(amcContracts)
      .innerJoin(customers, eq(customers.id, amcContracts.customerId))
      .leftJoin(users, eq(users.id, amcContracts.engineerId))
      .leftJoin(visitAgg, eq(visitAgg.contractId, amcContracts.id))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(asc(amcContracts.endDate), desc(amcContracts.id))
      .limit(500),
    amcSummary(db, today),
    db.selectDistinct({ id: customers.id, name: customers.name }).from(customers)
      .innerJoin(amcContracts, eq(amcContracts.customerId, customers.id)).orderBy(asc(customers.name)),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.role, "engineer")).orderBy(asc(users.name)),
  ]);
  const filtered = !!(q || status !== "live" || customerId || engineerId || sp.expiring);

  const qs = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ok: undefined, err: undefined, ...patch })) if (v) p.set(k, String(v));
    const s = p.toString();
    return s ? `/amc?${s}` : "/amc";
  };
  const activeFilters = [q, sp.customerId, sp.engineerId, sp.expiring, sp.mine].filter(Boolean).length;
  const pills: FilterPillItem[] = STATUS_PILLS.map((s) => ({
    label: s.label, href: qs({ status: s.id === "live" ? undefined : s.id }), active: status === s.id,
  }));

  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    {
      key: "number", header: "Contract", card: "title", nowrap: true,
      cell: (r) => (
        <>
          <Link href={`/amc/${r.id}`} className="rt-stretch font-medium text-brand-700 hover:underline dark:text-brand-300">{r.number}</Link>
          {r.engineerName && <div className="text-caption font-normal text-ink-soft">{r.engineerName}</div>}
        </>
      ),
    },
    { key: "customer", header: "Customer", card: "subtitle", className: "max-w-56 truncate", cell: (r) => r.customerName },
    { key: "status", header: "Status", card: "badge", cell: (r) => <StatusPill status={effectiveAmcStatus(r.status, r.endDate, today)} /> },
    { key: "systems", header: "Systems", priority: 3, className: "min-w-40", cell: (r) => <SystemChips systems={r.systems} /> },
    ...(acc.money ? [{
      key: "value", header: "Value", align: "right" as const, card: "amount" as const, nowrap: true,
      cell: (r: Row) => <>{money0(r.value)}<div className="text-caption font-normal text-ink-soft">{r.billingFrequency.replace("_", " ")}</div></>,
    }] : []),
    { key: "period", header: "Period", nowrap: true, priority: 3, cell: (r) => <>{fmtDate(r.startDate)}<div className="text-caption text-ink-soft">to {fmtDate(r.endDate)}</div></> },
    {
      key: "next", header: "Next visit", nowrap: true,
      cell: (r) => {
        if (!r.nextVisit) return <span className="text-ink-faint">-</span>;
        return r.nextVisit < today
          ? <span className="inline-flex items-center gap-1.5 font-medium text-danger">{fmtDate(r.nextVisit)} <StatusPill status="overdue" /></span>
          : fmtDate(r.nextVisit);
      },
    },
    { key: "visits", header: "Visits done", align: "right", nowrap: true, cell: (r) => `${Number(r.done ?? 0)} of ${Number(r.planned ?? 0)}` },
    {
      key: "expiry", header: "Expiry",
      cell: (r) => {
        const st = effectiveAmcStatus(r.status, r.endDate, today);
        return st === "active" || st === "expired" ? <ExpiryPill info={expiryInfo(r.endDate, today)} /> : <span className="text-ink-faint">-</span>;
      },
    },
  ];

  return (
    <ListPage
      title="AMC contracts"
      subtitle="Annual maintenance contracts, their preventive visits and renewals. Breakdown calls live under Service calls."
      secondaryActions={<LinkButton variant="secondary" href="/service-calls"><Wrench className="icon-sm" aria-hidden /> Service calls</LinkButton>}
      primaryAction={acc.manage && <LinkButton href="/amc/new"><Plus className="icon-sm" aria-hidden /> New contract</LinkButton>}
      notices={<Flash ok={sp.ok} err={sp.err} />}
      stats={
        <MetricStrip>
          <Metric label="Active contracts" value={summary.activeContracts} icon={FileSignature}
            hint={summary.expiredNotRenewed ? `${summary.expiredNotRenewed} lapsed, not renewed` : "All current"} href="/amc?status=active" />
          {acc.money
            ? <Metric label="Annual AMC value" value={moneyShort(summary.annualValue)} icon={IndianRupee} hint="Excl. GST, active contracts" />
            : <Metric label="Open service calls" value={summary.openCalls} icon={Wrench} hint={summary.breachedCalls ? `${summary.breachedCalls} past SLA` : "None past SLA"}
                tone={summary.breachedCalls ? "bad" : "default"} href="/service-calls" />}
          <Metric label="Visits due this week" value={summary.visitsDueThisWeek} icon={CalendarClock}
            hint={summary.visitsOverdue ? `${summary.visitsOverdue} overdue` : "None overdue"} tone={summary.visitsOverdue ? "warn" : "default"} />
          <Metric label="Renewals due in 30 days" value={summary.renewalsDue30} icon={RefreshCw} tone={summary.renewalsDue30 ? "warn" : "default"} href="/amc?expiring=30" />
        </MetricStrip>
      }
      filters={
        <>
          <FilterPills label="Filter by status" items={pills} />
          <ListFilters q={sp.q} placeholder="Contract no, customer, site" activeCount={activeFilters}
            clearHref={qs({ q: undefined, customerId: undefined, engineerId: undefined, expiring: undefined, mine: undefined })}
            hidden={{ status: status === "live" ? undefined : status }}>
            <Select name="customerId" defaultValue={sp.customerId ?? ""} aria-label="Customer">
              <option value="">All customers</option>
              {customerList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select name="engineerId" defaultValue={sp.engineerId ?? ""} aria-label="Engineer">
              <option value="">All engineers</option>
              {engineerList.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
            <label className="inline-flex min-h-9.5 items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="expiring" value="30" defaultChecked={sp.expiring === "30"} className="icon-sm accent-brand-600" /> Ending in 30 days
            </label>
            {user.role === "engineer" && (
              <label className="inline-flex min-h-9.5 items-center gap-2 text-sm text-ink">
                <input type="checkbox" name="mine" value="1" defaultChecked={sp.mine === "1"} className="icon-sm accent-brand-600" /> My contracts
              </label>
            )}
          </ListFilters>
        </>
      }
      isEmpty={rows.length === 0}
      empty={
        <ListEmpty filtered={filtered} noun="contracts" clearHref="/amc" title={filtered ? undefined : "No AMC contracts yet"}
          action={acc.manage && <LinkButton href="/amc/new"><Plus className="icon-sm" aria-hidden /> Create the first contract</LinkButton>}>
          Add an AMC when a customer signs up for maintenance. Visits are planned for you.
        </ListEmpty>
      }
      resultSummary={rows.length >= 500 ? "Showing the first 500 contracts. Use the filters to narrow things down." : `${rows.length} contract${rows.length === 1 ? "" : "s"}`}
    >
      <ResponsiveTable rows={rows} columns={columns} rowKey={(r) => r.id} caption="AMC contracts" />
    </ListPage>
  );
}
