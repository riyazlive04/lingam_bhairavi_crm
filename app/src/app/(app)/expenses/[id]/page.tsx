import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Check, Trash2, X } from "lucide-react";
import { getDb } from "@/db";
import { expenseAllocations, expenses, projects, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canApproveExpenses, canRead } from "@/lib/rbac";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import { addDays, fmtDate, fmtDateTime, money, todayIST } from "@/lib/format";
import { Card, DL, Flash, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { VoucherForm } from "../_components/voucher-form";
import { deleteExpense, reviewExpenses, saveExpense } from "../actions";
import { bookableProjects, categoryLabel } from "../_lib/data";

export default async function ExpenseDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const user = await requireUser("expenses");
  const { id } = await params;
  const sp = await searchParams;
  const eid = Number(id);
  if (!Number.isInteger(eid) || eid <= 0) notFound();
  const db = await getDb();
  const approverUser = alias(users, "approver");
  const [row] = await db
    .select({ e: expenses, userName: users.name, approverName: approverUser.name })
    .from(expenses)
    .leftJoin(users, eq(users.id, expenses.userId))
    .leftJoin(approverUser, eq(approverUser.id, expenses.approvedBy))
    .where(eq(expenses.id, eid))
    .limit(1);
  if (!row) notFound();
  const e = row.e;
  const approver = canApproveExpenses(user.role);
  const own = e.userId === user.id;
  if (!approver && !own) redirect("/forbidden");

  const allocs = await db
    .select({ id: expenseAllocations.id, projectId: expenseAllocations.projectId, amount: expenseAllocations.amount, code: projects.code, name: projects.name })
    .from(expenseAllocations)
    .innerJoin(projects, eq(projects.id, expenseAllocations.projectId))
    .where(eq(expenseAllocations.expenseId, e.id));

  const canEdit = e.status === "pending" && (own || user.role === "admin");
  const canReview = approver && e.status === "pending" && (user.role === "admin" || !own);
  const canDelete = user.role === "admin" ? e.status !== "approved" : own && e.status === "pending";
  const projectList = canEdit ? await bookableProjects(db) : [];
  // keep currently-allocated projects selectable even if they were closed since
  for (const a of allocs) if (canEdit && !projectList.some((p) => p.id === a.projectId)) projectList.push({ id: a.projectId, code: a.code, name: a.name });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={`Voucher ${e.voucherNo}`}
        subtitle={<span className="inline-flex items-center gap-2">{categoryLabel(e.category)} · {money(e.amount)} <StatusBadge status={e.status} /></span>}
        back={{ href: "/expenses", label: "Expenses" }}
      />
      <Flash ok={sp.ok} err={sp.err} />

      <Card title="Details">
        <DL
          items={[
            ["Date", fmtDate(e.date)],
            ["Amount", money(e.amount)],
            ["Category", categoryLabel(e.category)],
            ["Paid to", e.paidTo || "-"],
            ["Bill / receipt no.", e.billRef || "-"],
            ["Entered by", `${row.userName ?? "-"} · ${fmtDateTime(e.createdAt)}`],
            ["Reviewed by", e.status === "pending" ? "Awaiting approval" : row.approverName ?? "-"],
            ["Description", e.description || "-"],
          ]}
        />
      </Card>

      <Card title="Charged to" bodyClassName={allocs.length ? "p-0" : undefined}>
        {allocs.length ? (
          <Table className="rounded-none border-0 shadow-none">
            <thead><tr><Th>Project</Th><Th className="text-right">Amount</Th></tr></thead>
            <tbody>
              {allocs.map((a) => (
                <tr key={a.id}>
                  <Td>{canRead(user.role, "projects") ? <Link href={`/projects/${a.projectId}`} className="text-brand-700 hover:underline dark:text-brand-300">{a.code}</Link> : a.code} · {a.name}</Td>
                  <Td className="text-right tabular-nums">{money(a.amount)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <p className="text-sm text-ink-soft">Office overhead, not charged to any project.</p>
        )}
      </Card>

      {(canReview || canDelete) && (
        <div className="flex flex-wrap gap-2">
          {canReview && (
            <form action={reviewExpenses} className="flex flex-wrap gap-2">
              <input type="hidden" name="ids" value={e.id} />
              <input type="hidden" name="back" value={`/expenses/${e.id}`} />
              <SubmitButton name="decision" value="approve" variant="success" pendingText="Approving…"><Check className="h-4 w-4" aria-hidden /> Approve</SubmitButton>
              <SubmitButton name="decision" value="reject" variant="danger" pendingText="Rejecting…" confirm="Reject this voucher?"><X className="h-4 w-4" aria-hidden /> Reject</SubmitButton>
            </form>
          )}
          {canDelete && (
            <form action={deleteExpense}>
              <input type="hidden" name="id" value={e.id} />
              <SubmitButton variant="secondary" pendingText="Deleting…" confirm={`Delete voucher ${e.voucherNo}? This cannot be undone.`}><Trash2 className="h-4 w-4" aria-hidden /> Delete</SubmitButton>
            </form>
          )}
        </div>
      )}

      {canEdit && (
        <Card title="Edit voucher">
          <VoucherForm
            action={saveExpense}
            projects={projectList}
            categories={EXPENSE_CATEGORIES}
            maxDate={addDays(todayIST(), 1)}
            initial={{
              id: e.id, date: e.date, category: e.category, amount: String(e.amount), paidTo: e.paidTo ?? "", billRef: e.billRef ?? "",
              description: e.description ?? "", allocations: allocs.map((a) => ({ projectId: a.projectId, amount: Number(a.amount) })),
            }}
          />
        </Card>
      )}
    </div>
  );
}
