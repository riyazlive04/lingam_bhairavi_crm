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
import { EmptyState, FilterBar, Flash, LinkButton, PageHeader, Select, Stat, StatusBadge, Table, Td, Th, cx } from "@/components/ui";
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
      return { contract: a.contract + c.contractValue, cost: a.cost + c.actualCost, invoiced: a.invoiced + c.invoiced, received: a.received + c.received };
    },
    { contract: 0, cost: 0, invoiced: 0, received: 0 },
  );
  const filtered = !!(q || sp.status || customerId || engineerId);

  return (
    <div>
      <PageHeader
        title="Projects & Costing"
        subtitle="Every material issue, purchase and approved expense voucher adds to the project cost centre."
        actions={canWrite(user.role, "projects") && (
          <LinkButton href="/projects/new"><Plus className="h-4 w-4" aria-hidden /> New project</LinkButton>
        )}
      />
      <Flash ok={sp.ok} err={sp.err} />

      {full && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Live contract value" value={moneyShort(tot.contract)} hint={`${live.length} live project${live.length === 1 ? "" : "s"}`} />
          <Stat label="Spent so far" value={moneyShort(tot.cost)} hint="materials + approved expenses" />
          <Stat label="Invoiced (excl. GST)" value={moneyShort(tot.invoiced)} />
          <Stat label="Received" value={moneyShort(tot.received)} hint={`Standing: ${moneyShort(tot.invoiced - tot.received)}`} tone={tot.invoiced - tot.received > 0 ? "warn" : "default"} />
        </div>
      )}

      <FilterBar q={sp.q} placeholder="Search code, name, customer, site…">
        <Select name="status" defaultValue={sp.status ?? ""} aria-label="Status" className="sm:max-w-40">
          <option value="">All statuses</option>
          {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </Select>
        <Select name="customerId" defaultValue={sp.customerId ?? ""} aria-label="Customer" className="sm:max-w-52">
          <option value="">All customers</option>
          {customerList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select name="engineerId" defaultValue={sp.engineerId ?? ""} aria-label="Engineer" className="sm:max-w-44">
          <option value="">All engineers</option>
          {engineerList.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </Select>
        {user.role === "engineer" && (
          <label className="inline-flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" name="mine" value="1" defaultChecked={sp.mine === "1"} className="h-4 w-4 accent-brand-600" /> My projects
          </label>
        )}
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState
          title={filtered ? "No projects match these filters" : "No projects yet"}
          action={canWrite(user.role, "projects") && !filtered ? <LinkButton href="/projects/new">Create the first project</LinkButton> : undefined}
        >
          {filtered ? "Try clearing a filter." : "Create a project when an order is won so materials and expenses can be booked against it."}
        </EmptyState>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Project</Th>
              <Th>Customer</Th>
              <Th>Engineer</Th>
              <Th>Status</Th>
              {full && <Th className="text-right">Contract value</Th>}
              <Th className="text-right">Actual cost</Th>
              <Th>Budget used</Th>
              {full && <Th className="text-right">Margin</Th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const c = costs.get(r.id);
              const acc = projectAccess(user, r);
              return (
                <tr key={r.id} className="hover:bg-muted/60">
                  <Td>
                    <Link href={`/projects/${r.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">{r.name}</Link>
                    <div className="text-xs text-ink-soft">{r.code}{r.startDate ? ` · from ${fmtDate(r.startDate)}` : ""}</div>
                  </Td>
                  <Td className="max-w-56 truncate">{r.customerName}</Td>
                  <Td>{r.engineerName ?? <span className="text-ink-faint">-</span>}</Td>
                  <Td><StatusBadge status={r.status} /></Td>
                  {full && <Td className="text-right tabular-nums">{money0(c?.contractValue)}</Td>}
                  <Td className="text-right tabular-nums">{acc.spend ? money0(c?.actualCost) : <span className="text-ink-faint">hidden</span>}</Td>
                  <Td>{acc.spend && c ? <BudgetBar usedPct={c.budgetUsedPct} budget={c.budget} /> : <span className="text-ink-faint">-</span>}</Td>
                  {full && (
                    <Td className={cx("text-right tabular-nums", c && c.margin < 0 ? "font-semibold text-red-600" : "text-ink")}>
                      {c && c.contractValue ? pct(c.marginPct) : "-"}
                      {c && c.contractValue ? <div className="text-xs text-ink-soft">{money0(c.margin)}</div> : null}
                    </Td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
