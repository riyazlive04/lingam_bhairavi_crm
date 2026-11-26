import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Check, FolderKanban, Pencil, Trash2, X } from "lucide-react";
import { getDb } from "@/db";
import { expenseAllocations, expenses, projects, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canApproveExpenses, canRead } from "@/lib/rbac";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import { addDays, fmtDate, fmtDateTime, money, todayIST } from "@/lib/format";
import { Flash, LinkButton } from "@/components/ui";
import { ConfirmButton, DetailPage, KeyValueGrid, MetaChip, ResponsiveTable, SectionCard, StatusPill, type Column } from "@/components/patterns";
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

  const projectsReadable = canRead(user.role, "projects");
  type Alloc = (typeof allocs)[number];
  const allocCols: Column<Alloc>[] = [
    {
      key: "project", header: "Project", card: "title",
      cell: (a) => (
        <>
          {projectsReadable
            ? <Link href={`/projects/${a.projectId}`} className="rt-stretch font-medium text-brand-700 hover:underline dark:text-brand-300">{a.code}</Link>
            : <span className="font-medium">{a.code}</span>}
          <div className="text-caption font-normal text-ink-soft">{a.name}</div>
        </>
      ),
    },
    { key: "amount", header: "Amount", align: "right", card: "amount", nowrap: true, cell: (a) => money(a.amount) },
  ];

  const reviewForm = (decision: "approve" | "reject") => (
    <form action={reviewExpenses}>
      <input type="hidden" name="ids" value={e.id} />
      <input type="hidden" name="back" value={`/expenses/${e.id}`} />
      {decision === "approve" ? (
        <SubmitButton name="decision" value="approve" variant="success" pendingText="Approving…"><Check className="icon-sm" aria-hidden /> Approve voucher</SubmitButton>
      ) : (
        <ConfirmButton name="decision" value="reject" variant="secondary" className="text-danger" confirmVariant="danger" stacked pendingText="Rejecting…"
          confirm="Reject this voucher? It will not be added to the project cost." confirmLabel="Yes, reject voucher">
          <X className="icon-sm" aria-hidden /> Reject voucher
        </ConfirmButton>
      )}
    </form>
  );

  return (
    <DetailPage
      back={{ href: "/expenses", label: "Expenses" }}
      eyebrow="Expense voucher"
      title={e.voucherNo}
      status={<StatusPill status={e.status} />}
      meta={
        <>
          <MetaChip label="Amount">{money(e.amount)}</MetaChip>
          <MetaChip label="Category">{categoryLabel(e.category)}</MetaChip>
          <MetaChip label="Date">{fmtDate(e.date)}</MetaChip>
          <MetaChip label="By">{row.userName ?? "-"}</MetaChip>
        </>
      }
      primaryAction={canReview ? reviewForm("approve") : canEdit ? <LinkButton href="#edit-voucher"><Pencil className="icon-sm" aria-hidden /> Edit voucher</LinkButton> : undefined}
      secondaryActions={canReview ? reviewForm("reject") : undefined}
      moreActions={canDelete ? (
        <form action={deleteExpense}>
          <input type="hidden" name="id" value={e.id} />
          <ConfirmButton variant="ghost" className="text-danger" confirmVariant="danger" stacked pendingText="Deleting…"
            confirm={`Delete voucher ${e.voucherNo}? This cannot be undone.`} confirmLabel="Yes, delete voucher">
            <Trash2 className="icon-sm" aria-hidden /> Delete voucher
          </ConfirmButton>
        </form>
      ) : undefined}
      notices={<Flash ok={sp.ok} err={sp.err} />}
    >
      <SectionCard title="Details">
        <KeyValueGrid items={[
          { label: "Date", value: fmtDate(e.date) },
          { label: "Amount", value: money(e.amount) },
          { label: "Category", value: categoryLabel(e.category) },
          { label: "Paid to", value: e.paidTo },
          { label: "Bill or receipt no.", value: e.billRef },
          { label: "Entered by", value: `${row.userName ?? "-"} · ${fmtDateTime(e.createdAt)}` },
          { label: "Reviewed by", value: e.status === "pending" ? <StatusPill status="pending" label="Awaiting approval" /> : row.approverName },
          { label: "Description", value: e.description, wide: true },
        ]} />
      </SectionCard>

      <SectionCard title="Charged to" icon={FolderKanban} count={allocs.length} flush={allocs.length > 0}
        empty={allocs.length === 0 && "Office overhead. This voucher is not charged to any project."}>
        <ResponsiveTable flush rows={allocs} columns={allocCols} rowKey={(a) => a.id} caption="Project allocations" />
      </SectionCard>

      {canEdit && (
        <section id="edit-voucher" className="scroll-mt-36 space-y-4">
          <h2 className="text-subheading text-ink">Edit voucher</h2>
          <VoucherForm
            action={saveExpense}
            projects={projectList}
            categories={EXPENSE_CATEGORIES}
            maxDate={addDays(todayIST(), 1)}
            stickyFooter={false}
            initial={{
              id: e.id, date: e.date, category: e.category, amount: String(e.amount), paidTo: e.paidTo ?? "", billRef: e.billRef ?? "",
              description: e.description ?? "", allocations: allocs.map((a) => ({ projectId: a.projectId, amount: Number(a.amount) })),
            }}
          />
        </section>
      )}
    </DetailPage>
  );
}
