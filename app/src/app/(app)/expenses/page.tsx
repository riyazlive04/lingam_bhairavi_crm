import Link from "next/link";
import { and, asc, desc, eq, gte, inArray, lt, ne, sql, type SQL } from "drizzle-orm";
import { Check, Plus, X } from "lucide-react";
import { getDb } from "@/db";
import { expenseAllocations, expenses, projects, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canApproveExpenses, canRead } from "@/lib/rbac";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import { fmtDate, money, money0, todayIST } from "@/lib/format";
import { Card, EmptyState, Flash, Input, LinkButton, PageHeader, Select, Stat, StatusBadge, Table, Td, Th, Button, cx } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { reviewExpenses } from "./actions";
import { SelectAll } from "./_components/select-all";
import { categoryLabel, monthBounds } from "./_lib/data";

type SP = { status?: string; category?: string; projectId?: string; userId?: string; month?: string; ok?: string; err?: string };
const STATUSES = ["pending", "approved", "rejected"] as const;

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser("expenses");
  const sp = await searchParams;
  const db = await getDb();
  const approver = canApproveExpenses(user.role);

  const month = sp.month === "all" ? "all" : monthBounds(sp.month) ? sp.month! : todayIST().slice(0, 7);
  const bounds = month === "all" ? null : monthBounds(month);

  const conds: SQL[] = [];
  if (!approver) conds.push(eq(expenses.userId, user.id));
  else if (Number(sp.userId)) conds.push(eq(expenses.userId, Number(sp.userId)));
  if (sp.status && (STATUSES as readonly string[]).includes(sp.status)) conds.push(eq(expenses.status, sp.status));
  if (sp.category && sp.category in EXPENSE_CATEGORIES) conds.push(eq(expenses.category, sp.category));
  if (bounds) conds.push(gte(expenses.date, bounds.from), lt(expenses.date, bounds.toExcl));
  const projectId = Number(sp.projectId) || 0;
  if (projectId) {
    conds.push(inArray(expenses.id, db.select({ id: expenseAllocations.expenseId }).from(expenseAllocations).where(eq(expenseAllocations.projectId, projectId))));
  }
  const where = conds.length ? and(...conds) : undefined;

  const [rows, projectList, userList, catTotals, projTotals] = await Promise.all([
    db
      .select({
        id: expenses.id, voucherNo: expenses.voucherNo, date: expenses.date, category: expenses.category, amount: expenses.amount,
        description: expenses.description, paidTo: expenses.paidTo, status: expenses.status, userId: expenses.userId, userName: users.name,
      })
      .from(expenses)
      .leftJoin(users, eq(users.id, expenses.userId))
      .where(where)
      .orderBy(desc(expenses.date), desc(expenses.id))
      .limit(500),
    db.select({ id: projects.id, code: projects.code, name: projects.name }).from(projects).orderBy(asc(projects.code)),
    approver ? db.select({ id: users.id, name: users.name }).from(users).orderBy(asc(users.name)) : Promise.resolve([]),
    db
      .select({ category: expenses.category, status: expenses.status, total: sql<number>`coalesce(sum(${expenses.amount}),0)`.mapWith(Number), n: sql<number>`count(*)`.mapWith(Number) })
      .from(expenses)
      .where(and(where, ne(expenses.status, "rejected")))
      .groupBy(expenses.category, expenses.status),
    db
      .select({ projectId: projects.id, code: projects.code, name: projects.name, status: expenses.status, total: sql<number>`coalesce(sum(${expenseAllocations.amount}),0)`.mapWith(Number) })
      .from(expenseAllocations)
      .innerJoin(expenses, eq(expenses.id, expenseAllocations.expenseId))
      .innerJoin(projects, eq(projects.id, expenseAllocations.projectId))
      .where(and(where, ne(expenses.status, "rejected")))
      .groupBy(projects.id, projects.code, projects.name, expenses.status),
  ]);

  const allocRows = rows.length
    ? await db
        .select({ expenseId: expenseAllocations.expenseId, amount: expenseAllocations.amount, code: projects.code, projectId: projects.id })
        .from(expenseAllocations)
        .innerJoin(projects, eq(projects.id, expenseAllocations.projectId))
        .where(inArray(expenseAllocations.expenseId, rows.map((r) => r.id)))
    : [];
  const allocByExpense = new Map<number, typeof allocRows>();
  for (const a of allocRows) allocByExpense.set(a.expenseId, [...(allocByExpense.get(a.expenseId) ?? []), a]);

  const byCat = new Map<string, { approved: number; pending: number }>();
  for (const r of catTotals) {
    const t = byCat.get(r.category) ?? { approved: 0, pending: 0 };
    if (r.status === "approved") t.approved += r.total; else t.pending += r.total;
    byCat.set(r.category, t);
  }
  const byProj = new Map<number, { code: string; name: string; approved: number; pending: number }>();
  for (const r of projTotals) {
    const t = byProj.get(r.projectId) ?? { code: r.code, name: r.name, approved: 0, pending: 0 };
    if (r.status === "approved") t.approved += r.total; else t.pending += r.total;
    byProj.set(r.projectId, t);
  }
  const approvedTotal = [...byCat.values()].reduce((s, t) => s + t.approved, 0);
  const pendingTotal = [...byCat.values()].reduce((s, t) => s + t.pending, 0);
  const pendingCount = catTotals.filter((r) => r.status === "pending").reduce((s, r) => s + r.n, 0);
  const allocatedTotal = [...byProj.values()].reduce((s, t) => s + t.approved + t.pending, 0);
  const overhead = approvedTotal + pendingTotal - allocatedTotal;
  const canReview = (r: { status: string; userId: number | null }) => approver && r.status === "pending" && (user.role === "admin" || r.userId !== user.id);
  const reviewable = rows.filter(canReview).length;
  const periodLabel = bounds ? new Date(`${month}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" }) : "All time";
  const qs = new URLSearchParams(Object.entries({ status: sp.status, category: sp.category, projectId: sp.projectId, userId: sp.userId, month: sp.month }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <div>
      <PageHeader
        title={approver ? "Expenses" : "My expense vouchers"}
        subtitle={approver ? "Review site vouchers. Approved amounts are added to each project's cost centre." : "Vouchers you submitted. Approved amounts are added to the project cost."}
        actions={<LinkButton href="/expenses/new"><Plus className="h-4 w-4" aria-hidden /> New voucher</LinkButton>}
      />
      <Flash ok={sp.ok} err={sp.err} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`Approved · ${periodLabel}`} value={money0(approvedTotal)} tone="good" />
        <Stat label="Awaiting approval" value={money0(pendingTotal)} hint={`${pendingCount} voucher${pendingCount === 1 ? "" : "s"}`} tone={pendingCount ? "warn" : "default"} href={`/expenses?status=pending&month=${month}`} />
        <Stat label="Charged to projects" value={money0(allocatedTotal)} />
        <Stat label="Office overhead" value={money0(overhead)} hint="not allocated to any project" />
      </div>

      <form method="get" className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <Input type="month" name="month" defaultValue={month === "all" ? "" : month} aria-label="Month" className="col-span-2 sm:w-44" />
        <Select name="status" defaultValue={sp.status ?? ""} aria-label="Status" className="sm:w-36">
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select name="category" defaultValue={sp.category ?? ""} aria-label="Category" className="sm:w-48">
          <option value="">All categories</option>
          {Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select name="projectId" defaultValue={sp.projectId ?? ""} aria-label="Project" className="col-span-2 sm:w-56">
          <option value="">All projects</option>
          {projectList.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
        </Select>
        {approver && (
          <Select name="userId" defaultValue={sp.userId ?? ""} aria-label="Entered by" className="col-span-2 sm:w-44">
            <option value="">Everyone</option>
            {userList.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        )}
        <Button type="submit" variant="secondary">Filter</Button>
        <Link href="/expenses?month=all" className="self-center text-sm text-ink-soft hover:text-brand-700">All months</Link>
      </form>

      {rows.length === 0 ? (
        <EmptyState title="No vouchers for this selection" action={<LinkButton href="/expenses/new">Enter a voucher</LinkButton>}>
          Petrol, lodging, food, labour — enter every site expense so the project cost is complete.
        </EmptyState>
      ) : (
        <form action={reviewExpenses}>
          <input type="hidden" name="back" value={`/expenses${qs ? `?${qs}` : ""}`} />
          {approver && reviewable > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-3">
              <span className="text-sm text-ink-soft">{reviewable} awaiting your review — tick vouchers, then</span>
              <SubmitButton name="decision" value="approve" variant="success" size="sm" pendingText="Approving…"><Check className="h-4 w-4" aria-hidden /> Approve selected</SubmitButton>
              <SubmitButton name="decision" value="reject" variant="danger" size="sm" pendingText="Rejecting…" confirm="Reject the selected vouchers?"><X className="h-4 w-4" aria-hidden /> Reject selected</SubmitButton>
            </div>
          )}
          <Table>
            <thead>
              <tr>
                {approver && reviewable > 0 && <Th className="w-8"><SelectAll label="Select all awaiting review" /></Th>}
                <Th>Voucher</Th><Th>Date</Th><Th>Category</Th>{approver && <Th>Entered by</Th>}<Th>Project(s)</Th><Th>Status</Th><Th className="text-right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const allocs = allocByExpense.get(r.id) ?? [];
                return (
                  <tr key={r.id} className="hover:bg-muted/60">
                    {approver && reviewable > 0 && (
                      <Td>{canReview(r) && <input type="checkbox" name="ids" value={r.id} aria-label={`Select ${r.voucherNo}`} className="h-4 w-4 accent-brand-600" />}</Td>
                    )}
                    <Td>
                      <Link href={`/expenses/${r.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">{r.voucherNo}</Link>
                      {(r.description || r.paidTo) && <div className="max-w-60 truncate text-xs text-ink-soft">{r.paidTo ? `${r.paidTo} · ` : ""}{r.description}</div>}
                    </Td>
                    <Td className="whitespace-nowrap">{fmtDate(r.date)}</Td>
                    <Td>{categoryLabel(r.category)}</Td>
                    {approver && <Td>{r.userName ?? "—"}</Td>}
                    <Td>
                      {allocs.length ? (
                        <div className="flex flex-wrap gap-1">
                          {allocs.map((a) => (
                            canRead(user.role, "projects") ? (
                            <Link key={a.projectId} href={`/projects/${a.projectId}`} className="rounded bg-muted px-1.5 py-0.5 text-xs text-ink hover:text-brand-700" title={money(a.amount)}>
                              {a.code}{allocs.length > 1 ? ` · ${money0(a.amount)}` : ""}
                            </Link>
                          ) : (
                            <span key={a.projectId} className="rounded bg-muted px-1.5 py-0.5 text-xs text-ink" title={money(a.amount)}>
                              {a.code}{allocs.length > 1 ? ` · ${money0(a.amount)}` : ""}
                            </span>
                          )
                          ))}
                        </div>
                      ) : <span className="text-xs text-ink-faint">Overhead</span>}
                    </Td>
                    <Td><StatusBadge status={r.status} /></Td>
                    <Td className="text-right font-medium tabular-nums">{money(r.amount)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          {rows.length >= 500 && <p className="mt-2 text-xs text-ink-soft">Showing the latest 500 vouchers — narrow the filters to see older ones.</p>}
        </form>
      )}

      {(byCat.size > 0 || byProj.size > 0) && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card title={`By category · ${periodLabel}`} bodyClassName="p-0">
            <TotalsTable rows={[...byCat.entries()].map(([k, t]) => ({ key: k, label: categoryLabel(k), ...t }))} />
          </Card>
          <Card title={`By project · ${periodLabel}`} bodyClassName="p-0">
            {byProj.size ? (
              <TotalsTable rows={[...byProj.entries()].map(([id, t]) => ({ key: String(id), label: `${t.code} · ${t.name}`, href: `/projects/${id}`, ...t }))} />
            ) : <p className="p-4 text-sm text-ink-soft">No project allocations.</p>}
          </Card>
        </div>
      )}
    </div>
  );
}

function TotalsTable({ rows }: { rows: { key: string; label: string; href?: string; approved: number; pending: number }[] }) {
  const sorted = [...rows].sort((a, b) => b.approved + b.pending - (a.approved + a.pending));
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-ink-soft">
          <th className="px-4 py-2 font-semibold">Name</th>
          <th className="px-4 py-2 text-right font-semibold">Approved</th>
          <th className="px-4 py-2 text-right font-semibold">Pending</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => (
          <tr key={r.key} className="border-t border-line">
            <td className="max-w-56 truncate px-4 py-2 text-ink">{r.href ? <Link href={r.href} className="hover:text-brand-700">{r.label}</Link> : r.label}</td>
            <td className="px-4 py-2 text-right tabular-nums text-ink">{money0(r.approved)}</td>
            <td className={cx("px-4 py-2 text-right tabular-nums", r.pending ? "text-amber-700 dark:text-amber-400" : "text-ink-faint")}>{money0(r.pending)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
