import Link from "next/link";
import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { CalendarClock, FileSignature, IndianRupee, Plus, RefreshCw, Wrench } from "lucide-react";
import { getDb } from "@/db";
import { amcContracts, amcVisits, customers, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { addDays, fmtDate, money0, moneyShort, todayIST } from "@/lib/format";
import { AMC_STATUSES, amcSummary, effectiveAmcStatus, expiryInfo } from "@/lib/amc";
import { Badge, EmptyState, FilterBar, Flash, LinkButton, PageHeader, Select, Stat, Table, Td, Th, cx } from "@/components/ui";
import { AmcStatusBadge, SystemChips } from "./_components/system-chips";
import { amcAccess } from "./_lib/access";

export const metadata = { title: "AMC contracts" };

type SP = { q?: string; status?: string; customerId?: string; engineerId?: string; expiring?: string; mine?: string; ok?: string; err?: string };

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

  return (
    <div>
      <PageHeader
        title="AMC Contracts"
        subtitle="Annual maintenance contracts, their preventive visits and renewals. Breakdown calls live under Service Calls."
        actions={<>
          <LinkButton variant="secondary" href="/service-calls"><Wrench className="h-4 w-4" aria-hidden /> Service calls</LinkButton>
          {acc.manage && <LinkButton href="/amc/new"><Plus className="h-4 w-4" aria-hidden /> New contract</LinkButton>}
        </>}
      />
      <Flash ok={sp.ok} err={sp.err} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active contracts" value={summary.activeContracts} icon={FileSignature}
          hint={summary.expiredNotRenewed ? `${summary.expiredNotRenewed} lapsed, not renewed` : "all current"} href="/amc?status=active" />
        {acc.money
          ? <Stat label="Annual AMC value" value={moneyShort(summary.annualValue)} icon={IndianRupee} hint="excl. GST, active contracts" />
          : <Stat label="Open service calls" value={summary.openCalls} icon={Wrench} hint={summary.breachedCalls ? `${summary.breachedCalls} past SLA` : "none past SLA"} tone={summary.breachedCalls ? "bad" : "default"} href="/service-calls" />}
        <Stat label="Visits due this week" value={summary.visitsDueThisWeek} icon={CalendarClock}
          hint={summary.visitsOverdue ? `${summary.visitsOverdue} overdue` : "none overdue"} tone={summary.visitsOverdue ? "warn" : "default"} />
        <Stat label="Renewals due in 30 days" value={summary.renewalsDue30} icon={RefreshCw} tone={summary.renewalsDue30 ? "warn" : "default"} href="/amc?expiring=30" />
      </div>

      <FilterBar q={sp.q} placeholder="Contract no, customer, site">
        <Select name="status" defaultValue={status} aria-label="Status" className="sm:max-w-40">
          <option value="live">Active and lapsed</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="renewed">Renewed</option>
          <option value="cancelled">Cancelled</option>
          <option value="all">All</option>
        </Select>
        <Select name="customerId" defaultValue={sp.customerId ?? ""} aria-label="Customer" className="sm:max-w-52">
          <option value="">All customers</option>
          {customerList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select name="engineerId" defaultValue={sp.engineerId ?? ""} aria-label="Engineer" className="sm:max-w-44">
          <option value="">All engineers</option>
          {engineerList.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </Select>
        <label className="inline-flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" name="expiring" value="30" defaultChecked={sp.expiring === "30"} className="h-4 w-4 accent-brand-600" /> Ending in 30 days
        </label>
        {user.role === "engineer" && (
          <label className="inline-flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" name="mine" value="1" defaultChecked={sp.mine === "1"} className="h-4 w-4 accent-brand-600" /> My contracts
          </label>
        )}
      </FilterBar>
      {filtered && <p className="-mt-2 mb-3 text-sm"><Link href="/amc" className="text-ink-soft hover:text-brand-700">Clear filters</Link></p>}

      {rows.length === 0 ? (
        <EmptyState
          icon={FileSignature}
          title={filtered ? "No contracts match these filters" : "No AMC contracts yet"}
          action={acc.manage && !filtered ? <LinkButton href="/amc/new">Create the first contract</LinkButton> : undefined}
        >
          {filtered ? "Try clearing a filter." : "Add an AMC when a customer signs up for maintenance. Visits are planned for you."}
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Contract</Th>
              <Th>Customer</Th>
              <Th>Systems</Th>
              {acc.money && <Th className="text-right">Value</Th>}
              <Th>Period</Th>
              <Th>Next visit</Th>
              <Th className="text-right">Visits</Th>
              <Th>Expiry</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const st = effectiveAmcStatus(r.status, r.endDate, today);
              const exp = expiryInfo(r.endDate, today);
              const live = st === "active" || st === "expired";
              const nextLate = r.nextVisit && r.nextVisit < today;
              return (
                <tr key={r.id} className="hover:bg-muted/60">
                  <Td>
                    <Link href={`/amc/${r.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">{r.number}</Link>
                    {r.engineerName && <div className="text-xs text-ink-soft">{r.engineerName}</div>}
                  </Td>
                  <Td className="max-w-56 truncate">{r.customerName}</Td>
                  <Td className="min-w-40"><SystemChips systems={r.systems} /></Td>
                  {acc.money && <Td className="text-right tabular-nums">{money0(r.value)}<div className="text-xs capitalize text-ink-soft">{r.billingFrequency.replace("_", " ")}</div></Td>}
                  <Td className="whitespace-nowrap text-xs">{fmtDate(r.startDate)}<div className="text-ink-soft">to {fmtDate(r.endDate)}</div></Td>
                  <Td className={cx("whitespace-nowrap", nextLate && "font-semibold text-red-600")}>
                    {r.nextVisit ? fmtDate(r.nextVisit) : <span className="text-ink-faint">-</span>}
                    {nextLate && <div className="text-xs font-normal">overdue</div>}
                  </Td>
                  <Td className="text-right tabular-nums">{Number(r.done ?? 0)} / {Number(r.planned ?? 0)}</Td>
                  <Td>{live ? <Badge tone={exp.tone}>{exp.label}</Badge> : <span className="text-ink-faint">-</span>}</Td>
                  <Td><AmcStatusBadge status={st} /></Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      {rows.length >= 500 && <p className="mt-2 text-xs text-ink-soft">Showing the first 500 contracts. Use the filters to narrow things down.</p>}
    </div>
  );
}
