import Link from "next/link";
import { and, asc, desc, eq, gte, inArray, lt, ne, sql, type SQL } from "drizzle-orm";
import { Check, FolderKanban, Plus, Tags, X } from "lucide-react";
import { getDb } from "@/db";
import { expenseAllocations, expenses, projects, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canApproveExpenses, canRead } from "@/lib/rbac";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import { fmtDate, money, money0, todayIST } from "@/lib/format";
import { Flash, LinkButton, Select, cx } from "@/components/ui";
import {
  ConfirmButton, FilterPills, ListEmpty, ListFilters, ListPage, Metric, MetricStrip, ResponsiveTable, SectionCard, StatusPill, statusLabel,
  type Column, type FilterPillItem,
} from "@/components/patterns";
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

  const thisMonth = todayIST().slice(0, 7);
  const monthOptions: string[] = [];
  {
    const [y, m] = thisMonth.split("-").map(Number);
    for (let k = 0; k < 12; k++) {
      const d = new Date(Date.UTC(y, m - 1 - k, 1));
      monthOptions.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
    }
    if (month !== "all" && !monthOptions.includes(month)) monthOptions.push(month);
  }
  const monthName = (mo: string) => new Date(`${mo}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const href = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ status: sp.status, category: sp.category, projectId: sp.projectId, userId: sp.userId, month: sp.month, ...patch })) if (v) p.set(k, String(v));
    const s = p.toString();
    return s ? `/expenses?${s}` : "/expenses";
  };
  const status = sp.status && (STATUSES as readonly string[]).includes(sp.status) ? sp.status : undefined;
  const activeFilters = [sp.category, projectId || null, approver && Number(sp.userId) ? sp.userId : null, month !== thisMonth ? month : null].filter(Boolean).length;
  const pills: FilterPillItem[] = [
    { label: "All", href: href({ status: undefined }), active: !status },
    ...STATUSES.map((st) => ({
      label: st === "pending" ? "Awaiting approval" : statusLabel(st), href: href({ status: st }), active: status === st,
      ...(st === "pending" && approver ? { count: pendingCount, attention: pendingCount > 0 && status !== "pending" } : {}),
    })),
  ];
  const showSelect = approver && reviewable > 0;
  const projectsReadable = canRead(user.role, "projects");

  type Row = (typeof rows)[number];
  const projectChip = "relative z-[1] rounded-md bg-muted px-1.5 py-0.5 text-caption text-ink";
  const columns: Column<Row>[] = [
    ...(showSelect ? [{
      key: "select", header: <SelectAll label="Select all awaiting review" />, label: "Select", card: "actions" as const, className: "w-8",
      cell: (r: Row) => (canReview(r) ? (
        <label className="relative z-[1] inline-flex items-center gap-2 text-sm text-ink-soft max-sm:h-9">
          <input type="checkbox" name="ids" value={r.id} aria-label={`Select ${r.voucherNo}`} className="icon-sm accent-brand-600 max-sm:h-5 max-sm:w-5" />
          <span className="sm:hidden" aria-hidden>Select for review</span>
        </label>
      ) : null),
    }] : []),
    {
      key: "voucher", header: "Voucher", card: "title", nowrap: true,
      cell: (r) => (
        <>
          <Link href={`/expenses/${r.id}`} className="rt-stretch font-medium text-brand-700 hover:underline dark:text-brand-300">{r.voucherNo}</Link>
          {(r.description || r.paidTo) && <div className="max-w-60 truncate text-caption font-normal text-ink-soft">{r.paidTo ? `${r.paidTo} · ` : ""}{r.description}</div>}
        </>
      ),
    },
    { key: "date", header: "Date", card: "subtitle", nowrap: true, cell: (r) => <>{fmtDate(r.date)}<span className="sm:hidden"> · {categoryLabel(r.category)}</span></> },
    { key: "category", header: "Category", card: "hidden", cell: (r) => categoryLabel(r.category) },
    ...(approver ? [{ key: "by", header: "Entered by", priority: 3 as const, cell: (r: Row) => r.userName ?? "-" }] : []),
    {
      key: "projects", header: "Projects",
      cell: (r) => {
        const allocs = allocByExpense.get(r.id) ?? [];
        if (!allocs.length) return <span className="text-caption text-ink-faint">Overhead</span>;
        return (
          <div className="flex flex-wrap gap-1 max-sm:justify-end">
            {allocs.map((a) => (projectsReadable ? (
              <Link key={a.projectId} href={`/projects/${a.projectId}`} className={cx(projectChip, "hover:text-brand-700 dark:hover:text-brand-300")} title={money(a.amount)}>
                {a.code}{allocs.length > 1 ? ` · ${money0(a.amount)}` : ""}
              </Link>
            ) : (
              <span key={a.projectId} className={projectChip} title={money(a.amount)}>{a.code}{allocs.length > 1 ? ` · ${money0(a.amount)}` : ""}</span>
            )))}
          </div>
        );
      },
    },
    { key: "status", header: "Status", card: "badge", cell: (r) => <StatusPill status={r.status} label={r.status === "pending" ? "Awaiting approval" : undefined} /> },
    { key: "amount", header: "Amount", align: "right", card: "amount", nowrap: true, cell: (r) => <span className="font-medium">{money(r.amount)}</span> },
  ];

  type Total = { key: string; label: string; href?: string; approved: number; pending: number };
  const totalCols: Column<Total>[] = [
    { key: "name", header: "Name", card: "title", className: "max-w-56 truncate", cell: (t) => (t.href ? <Link href={t.href} className="hover:text-brand-700 dark:hover:text-brand-300">{t.label}</Link> : t.label) },
    { key: "approved", header: "Approved", align: "right", card: "amount", nowrap: true, cell: (t) => money0(t.approved) },
    { key: "pending", header: "Pending", align: "right", nowrap: true, cell: (t) => <span className={cx(t.pending ? "text-warning" : "text-ink-faint")}>{money0(t.pending)}</span> },
  ];
  const sortTotals = (list: Total[]) => [...list].sort((a, b) => b.approved + b.pending - (a.approved + a.pending));
  const catRows = sortTotals([...byCat.entries()].map(([k, t]) => ({ key: k, label: categoryLabel(k), ...t })));
  const projRows = sortTotals([...byProj.entries()].map(([id, t]) => ({ key: String(id), label: `${t.code} · ${t.name}`, href: `/projects/${id}`, ...t })));
  const filtered = activeFilters > 0 || !!status;

  return (
    <ListPage
      title={approver ? "Expenses" : "My expense vouchers"}
      subtitle={approver ? "Review site vouchers. Approved amounts are added to each project's cost centre." : "Vouchers you submitted. Approved amounts are added to the project cost."}
      primaryAction={<LinkButton href="/expenses/new"><Plus className="icon-sm" aria-hidden /> New voucher</LinkButton>}
      notices={<Flash ok={sp.ok} err={sp.err} />}
      stats={
        <MetricStrip>
          <Metric label="Approved" value={money0(approvedTotal)} hint={periodLabel} tone="good" />
          <Metric label="Awaiting approval" value={money0(pendingTotal)} hint={`${pendingCount} voucher${pendingCount === 1 ? "" : "s"}`} tone={pendingCount ? "warn" : "default"} href={`/expenses?status=pending&month=${month}`} />
          <Metric label="Charged to projects" value={money0(allocatedTotal)} />
          <Metric label="Office overhead" value={money0(overhead)} hint="Not allocated to any project" />
        </MetricStrip>
      }
      filters={
        <>
          <FilterPills label="Filter by status" items={pills} />
          <ListFilters searchName={false} activeCount={activeFilters} clearHref={href({ category: undefined, projectId: undefined, userId: undefined, month: undefined })} hidden={{ status }}>
            <Select name="month" defaultValue={month} aria-label="Month">
              {monthOptions.map((mo) => <option key={mo} value={mo}>{mo === thisMonth ? `This month (${monthName(mo)})` : monthName(mo)}</option>)}
              <option value="all">All months</option>
            </Select>
            <Select name="category" defaultValue={sp.category ?? ""} aria-label="Category">
              <option value="">All categories</option>
              {Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <Select name="projectId" defaultValue={sp.projectId ?? ""} aria-label="Project">
              <option value="">All projects</option>
              {projectList.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
            </Select>
            {approver && (
              <Select name="userId" defaultValue={sp.userId ?? ""} aria-label="Entered by">
                <option value="">Everyone</option>
                {userList.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            )}
          </ListFilters>
        </>
      }
      isEmpty={rows.length === 0}
      empty={
        <ListEmpty filtered={filtered} noun="vouchers" clearHref="/expenses" title={filtered ? undefined : `No vouchers in ${bounds ? periodLabel : "any month"}`}
          action={<LinkButton href="/expenses/new"><Plus className="icon-sm" aria-hidden /> Enter a voucher</LinkButton>}>
          Petrol, lodging, food, labour: enter every site expense so the project cost stays complete.
        </ListEmpty>
      }
      resultSummary={`${rows.length} voucher${rows.length === 1 ? "" : "s"} · ${periodLabel}${rows.length >= 500 ? " · showing the latest 500, narrow the filters to see older ones" : ""}`}
    >
      <div className="space-y-4">
        <form action={reviewExpenses} className="space-y-3">
          <input type="hidden" name="back" value={`/expenses${qs ? `?${qs}` : ""}`} />
          {showSelect && (
            <div className="flex flex-col gap-2 rounded-2xl border border-warning-line bg-warning-soft p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-ink">{reviewable} voucher{reviewable === 1 ? "" : "s"} awaiting your review. Tick them, then approve or reject.</p>
              <div className="flex flex-wrap gap-2 max-sm:[&>*]:flex-1">
                <SubmitButton name="decision" value="approve" variant="success" size="sm" pendingText="Approving…"><Check className="icon-sm" aria-hidden /> Approve selected</SubmitButton>
                <ConfirmButton name="decision" value="reject" variant="secondary" size="sm" className="text-danger" confirmVariant="danger" pendingText="Rejecting…"
                  confirm="Reject the selected vouchers?" confirmLabel="Yes, reject selected">
                  <X className="icon-sm" aria-hidden /> Reject selected
                </ConfirmButton>
              </div>
            </div>
          )}
          <ResponsiveTable rows={rows} columns={columns} rowKey={(r) => r.id} caption="Expense vouchers" />
        </form>

        {(byCat.size > 0 || byProj.size > 0) && (
          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="By category" description={periodLabel} icon={Tags} flush>
              <ResponsiveTable flush rows={catRows} columns={totalCols} rowKey={(t) => t.key} caption="Totals by category" />
            </SectionCard>
            <SectionCard title="By project" description={periodLabel} icon={FolderKanban} flush={projRows.length > 0}
              empty={projRows.length === 0 && "No project allocations in this period."}>
              <ResponsiveTable flush rows={projRows} columns={totalCols} rowKey={(t) => t.key} caption="Totals by project" />
            </SectionCard>
          </div>
        )}
      </div>
    </ListPage>
  );
}
