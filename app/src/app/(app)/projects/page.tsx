import Link from "next/link";
import { and, asc, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { Plus } from "lucide-react";
import { getDb } from "@/db";
import { customers, projects, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canSeeCost, canWrite } from "@/lib/rbac";
import { PROJECT_STATUSES } from "@/lib/constants";
import { projectCostSummary } from "@/lib/costing";
import { fmtDate, money0, moneyShort, pct } from "@/lib/format";
import { Flash, LinkButton, Select, cx } from "@/components/ui";
import {
  FilterPills, ListEmpty, ListFilters, ListPage, Metric, MetricStrip, ResponsiveTable, StatusPill, statusLabel,
  type Column, type FilterPillItem,
} from "@/components/patterns";
import { BudgetBar } from "./_components/budget-bar";
import { projectAccess } from "./_lib/access";

type SP = { q?: string; status?: string; customerId?: string; engineerId?: string; mine?: string; ok?: string; err?: string };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser("projects");
  const sp = await searchParams;
  const db = await getDb();
  const full = canSeeCost(user.role);

  const conds: SQL[] = [];
  const q = sp.q?.trim();
  if (q) {
    const like = `%${q}%`;
    const c = or(ilike(projects.name, like), ilike(projects.code, like), ilike(customers.name, like), ilike(projects.siteAddress, like));
    if (c) conds.push(c);
  }
  if (sp.status && (PROJECT_STATUSES as readonly string[]).includes(sp.status)) conds.push(eq(projects.status, sp.status));
  const customerId = Number(sp.customerId) || 0;
  if (customerId) conds.push(eq(projects.customerId, customerId));
  const engineerId = sp.mine === "1" ? user.id : Number(sp.engineerId) || 0;
  if (engineerId) conds.push(eq(projects.engineerId, engineerId));

  const [rows, customerList, engineerList] = await Promise.all([
    db
      .select({
        id: projects.id, code: projects.code, name: projects.name, status: projects.status, engineerId: projects.engineerId,
        startDate: projects.startDate, endDate: projects.endDate, customerName: customers.name, engineerName: users.name,
      })
      .from(projects)
      .innerJoin(customers, eq(customers.id, projects.customerId))
      .leftJoin(users, eq(users.id, projects.engineerId))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(projects.createdAt))
      .limit(500),
    db.select({ id: customers.id, name: customers.name }).from(customers).orderBy(asc(customers.name)),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.role, "engineer")).orderBy(asc(users.name)),
  ]);

  const costs = new Map((await projectCostSummary(db, rows.map((r) => r.id))).map((c) => [c.projectId, c]));
  const live = rows.filter((r) => r.status === "active" || r.status === "planning" || r.status === "on_hold");
  const tot = live.reduce(
    (a, r) => {
      const c = costs.get(r.id);
      if (!c) return a;
      return { contract: a.contract + c.contractValue, cost: a.cost + c.actualCost, invoiced: a.invoiced + c.invoiced, received: a.received + c.received, due: a.due + c.netDue };
    },
    { contract: 0, cost: 0, invoiced: 0, received: 0, due: 0 },
  );
  const filtered = !!(q || sp.status || customerId || engineerId);
  const writable = canWrite(user.role, "projects");
  const status = sp.status && (PROJECT_STATUSES as readonly string[]).includes(sp.status) ? sp.status : undefined;
  const qs = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ok: undefined, err: undefined, ...patch })) if (v) p.set(k, String(v));
    const s = p.toString();
    return s ? `/projects?${s}` : "/projects";
  };
  const activeFilters = [q, customerId || null, sp.engineerId && sp.mine !== "1" ? sp.engineerId : null, sp.mine === "1" ? "1" : null].filter(Boolean).length;
  const pills: FilterPillItem[] = [
    { label: "All", href: qs({ status: undefined }), active: !status },
    ...PROJECT_STATUSES.map((s) => ({ label: statusLabel(s), href: qs({ status: s }), active: status === s })),
  ];

  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    {
      key: "project", header: "Project", card: "title", className: "max-w-xs whitespace-normal",
      cell: (r) => (
        <>
          <Link href={`/projects/${r.id}`} className="rt-stretch font-medium text-brand-700 hover:underline dark:text-brand-300">{r.name}</Link>
          <div className="text-caption font-normal text-ink-soft">{r.code}{r.startDate ? ` · from ${fmtDate(r.startDate)}` : ""}</div>
        </>
      ),
    },
    { key: "customer", header: "Customer", card: "subtitle", className: "max-w-56 truncate", cell: (r) => r.customerName },
    { key: "engineer", header: "Engineer", priority: 3, cell: (r) => r.engineerName ?? <span className="text-ink-faint">Unassigned</span> },
    { key: "status", header: "Status", card: "badge", cell: (r) => <StatusPill status={r.status} /> },
    ...(full ? [{ key: "contract", header: "Contract value", align: "right" as const, priority: 3 as const, nowrap: true, cell: (r: Row) => money0(costs.get(r.id)?.contractValue) }] : []),
    {
      key: "cost", header: "Actual cost", align: "right", card: "amount", nowrap: true,
      cell: (r) => (projectAccess(user, r).spend ? money0(costs.get(r.id)?.actualCost) : <span className="text-ink-faint">Hidden</span>),
    },
    {
      key: "budget", header: "Budget used",
      cell: (r) => {
        const c = costs.get(r.id);
        return projectAccess(user, r).spend && c ? <BudgetBar usedPct={c.budgetUsedPct} budget={c.budget} /> : <span className="text-ink-faint">-</span>;
      },
    },
    ...(full ? [
      {
        key: "margin", header: "Margin", align: "right" as const, nowrap: true,
        cell: (r: Row) => {
          const c = costs.get(r.id);
          if (!c || !c.contractValue) return "-";
          return (
            <span className={cx(c.margin < 0 ? "font-semibold text-danger" : "text-ink")}>
              {pct(c.marginPct)}
              <span className="block text-caption font-normal text-ink-soft">{money0(c.margin)}</span>
            </span>
          );
        },
      },
      { key: "received", header: "Received", align: "right" as const, priority: 3 as const, nowrap: true, cell: (r: Row) => money0(costs.get(r.id)?.received) },
      {
        key: "due", header: "Net due", align: "right" as const, nowrap: true,
        cell: (r: Row) => {
          const c = costs.get(r.id);
          return <span className={cx(c && c.netDue > 0.5 ? "font-medium text-warning" : "text-ink")}>{money0(c?.netDue)}</span>;
        },
      },
    ] : []),
  ];

  return (
    <ListPage
      title="Projects and costing"
      subtitle="Every material issue, purchase and approved expense voucher adds to the project cost centre."
      primaryAction={writable && <LinkButton href="/projects/new"><Plus className="icon-sm" aria-hidden /> New project</LinkButton>}
      notices={<Flash ok={sp.ok} err={sp.err} />}
      stats={full && (
        <MetricStrip>
          <Metric label="Live contract value" value={moneyShort(tot.contract)} hint={`${live.length} live project${live.length === 1 ? "" : "s"}`} />
          <Metric label="Spent so far" value={moneyShort(tot.cost)} hint="Materials and approved expenses" />
          <Metric label="Invoiced (excl. GST)" value={moneyShort(tot.invoiced)} />
          <Metric label="Received" value={moneyShort(tot.received)} hint={`Net due ${moneyShort(tot.due)} (incl. GST)`} tone={tot.due > 0.5 ? "warn" : "default"} />
        </MetricStrip>
      )}
      filters={
        <>
          <FilterPills label="Filter by status" items={pills} />
          <ListFilters q={sp.q} placeholder="Search code, name, customer, site" activeCount={activeFilters} hidden={{ status }}
            clearHref={qs({ q: undefined, customerId: undefined, engineerId: undefined, mine: undefined })}>
            <Select name="customerId" defaultValue={sp.customerId ?? ""} aria-label="Customer">
              <option value="">All customers</option>
              {customerList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select name="engineerId" defaultValue={sp.engineerId ?? ""} aria-label="Engineer">
              <option value="">All engineers</option>
              {engineerList.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </Select>
            {user.role === "engineer" && (
              <label className="inline-flex h-9.5 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm text-ink">
                <input type="checkbox" name="mine" value="1" defaultChecked={sp.mine === "1"} className="icon-sm accent-brand-600" /> My projects
              </label>
            )}
          </ListFilters>
        </>
      }
      isEmpty={rows.length === 0}
      empty={
        <ListEmpty filtered={filtered} noun="projects" clearHref="/projects"
          action={writable && <LinkButton href="/projects/new"><Plus className="icon-sm" aria-hidden /> Create the first project</LinkButton>}>
          Create a project when an order is won, so materials and expenses can be booked against it.
        </ListEmpty>
      }
      resultSummary={`${rows.length} project${rows.length === 1 ? "" : "s"}${rows.length >= 500 ? " (latest 500)" : ""}`}
    >
      <ResponsiveTable rows={rows} columns={columns} rowKey={(r) => r.id} caption="Projects" />
    </ListPage>
  );
}
