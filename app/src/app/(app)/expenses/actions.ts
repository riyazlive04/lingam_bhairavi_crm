"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, type DB } from "@/db";
import { expenseAllocations, expenses, projects } from "@/db/schema";
import { requireWrite } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import { addDays, round2, todayIST } from "@/lib/format";
import { canApproveExpenses } from "@/lib/rbac";
import { nextNumber } from "@/lib/sequence";
import { UserError, errMsg, flashUrl, zDate, zId, zOptId, zOptText } from "../projects/_lib/forms";

const CATEGORY_KEYS = Object.keys(EXPENSE_CATEGORIES) as [keyof typeof EXPENSE_CATEGORIES, ...(keyof typeof EXPENSE_CATEGORIES)[]];

const Allocation = z.object({ projectId: z.coerce.number().int().positive(), amount: z.coerce.number().positive("Each project amount must be more than 0") });

const VoucherInput = z.object({
  id: zOptId,
  date: zDate,
  category: z.enum(CATEGORY_KEYS, { message: "Choose a category" }),
  amount: z.coerce.number().positive("Amount must be more than 0").max(10_000_000),
  paidTo: zOptText(120),
  billRef: zOptText(80),
  description: zOptText(1000),
});

function parseAllocations(raw: FormDataEntryValue | null) {
  let data: unknown = [];
  try {
    data = raw ? JSON.parse(String(raw)) : [];
  } catch {
    throw new UserError("Project allocation data is invalid");
  }
  return z.array(Allocation).max(20, "Too many project rows").parse(data);
}

/** Validate allocations against the voucher total (server-side source of truth). */
async function checkAllocations(db: DB, total: number, allocs: { projectId: number; amount: number }[]) {
  const ids = allocs.map((a) => a.projectId);
  if (new Set(ids).size !== ids.length) throw new UserError("The same project is selected twice. Please merge the rows");
  if (!allocs.length) return [];
  const found = await db.select({ id: projects.id, status: projects.status }).from(projects).where(inArray(projects.id, ids));
  if (found.length !== ids.length) throw new UserError("One of the selected projects no longer exists");
  if (found.some((p) => p.status === "closed")) throw new UserError("Expenses cannot be booked to a closed project");
  const rounded = allocs.map((a) => ({ projectId: a.projectId, amount: round2(a.amount) }));
  const sum = round2(rounded.reduce((s, a) => s + a.amount, 0));
  if (Math.abs(sum - round2(total)) > 0.01) {
    throw new UserError(`Project amounts add up to ₹${sum.toFixed(2)} but the voucher total is ₹${round2(total).toFixed(2)}`);
  }
  return rounded;
}

export async function saveExpense(form: FormData) {
  const user = await requireWrite("expenses");
  const db = await getDb();
  const rawId = Number(form.get("id")) || 0;
  let target = "/expenses";
  const back = rawId > 0 ? `/expenses/${rawId}` : "/expenses/new";
  try {
    const d = VoucherInput.parse(Object.fromEntries(form));
    if (d.date > addDays(todayIST(), 1)) throw new UserError("Voucher date cannot be in the future");
    const allocs = await checkAllocations(db, d.amount, parseAllocations(form.get("allocations")));
    const amount = round2(d.amount);

    if (d.id) {
      const [ex] = await db.select().from(expenses).where(eq(expenses.id, d.id)).limit(1);
      if (!ex) throw new UserError("Voucher not found");
      if (ex.status !== "pending") throw new UserError("Only vouchers awaiting approval can be edited");
      if (ex.userId !== user.id && user.role !== "admin") throw new UserError("You can only edit your own vouchers");
      await db.transaction(async (tx) => {
        await tx.update(expenses).set({
          date: d.date, category: d.category, amount, paidTo: d.paidTo ?? null, billRef: d.billRef ?? null, description: d.description ?? null,
        }).where(eq(expenses.id, d.id!));
        await tx.delete(expenseAllocations).where(eq(expenseAllocations.expenseId, d.id!));
        if (allocs.length) await tx.insert(expenseAllocations).values(allocs.map((a) => ({ expenseId: d.id!, ...a })));
      });
      await audit(db, user.id, "update", "expense", d.id, { voucherNo: ex.voucherNo, amount, category: d.category, allocations: allocs });
      target = flashUrl(`/expenses/${d.id}`, "ok", `Voucher ${ex.voucherNo} updated`);
    } else {
      const row = await db.transaction(async (tx) => {
        const voucherNo = await nextNumber(tx as unknown as DB, "expense", d.date);
        const [e] = await tx.insert(expenses).values({
          voucherNo, date: d.date, category: d.category, amount, paidTo: d.paidTo ?? null, billRef: d.billRef ?? null,
          description: d.description ?? null, userId: user.id, status: "pending",
        }).returning({ id: expenses.id, voucherNo: expenses.voucherNo });
        if (allocs.length) await tx.insert(expenseAllocations).values(allocs.map((a) => ({ expenseId: e.id, ...a })));
        return e;
      });
      await audit(db, user.id, "create", "expense", row.id, { voucherNo: row.voucherNo, amount, category: d.category, allocations: allocs });
      const again = form.get("next") === "new";
      target = flashUrl(again ? "/expenses/new" : "/expenses", "ok", `Voucher ${row.voucherNo} saved and awaiting approval`);
    }
  } catch (e) {
    target = flashUrl(back, "err", errMsg(e));
  }
  revalidatePath("/expenses");
  revalidatePath("/projects");
  redirect(target);
}

const ReviewInput = z.object({ decision: z.enum(["approve", "reject"]), ids: z.array(zId).min(1, "Select at least one voucher").max(500) });

/** Approve / reject one or many pending vouchers (admin & accounts). Approvers cannot approve their own vouchers unless admin. */
export async function reviewExpenses(form: FormData) {
  const user = await requireWrite("expenses");
  const db = await getDb();
  const back = String(form.get("back") || "/expenses");
  const safeBack = back.startsWith("/expenses") ? back : "/expenses";
  let target = safeBack;
  try {
    if (!canApproveExpenses(user.role)) throw new UserError("Only Accounts or the Owner can approve expenses");
    const d = ReviewInput.parse({ decision: form.get("decision"), ids: form.getAll("ids") });
    const rows = await db.select({ id: expenses.id, voucherNo: expenses.voucherNo, userId: expenses.userId, status: expenses.status })
      .from(expenses).where(inArray(expenses.id, d.ids));
    const eligible = rows.filter((r) => r.status === "pending" && (user.role === "admin" || r.userId !== user.id));
    const skipped = d.ids.length - eligible.length;
    if (!eligible.length) throw new UserError("No selected voucher can be reviewed (already reviewed, or your own voucher)");
    const status = d.decision === "approve" ? "approved" : "rejected";
    await db.update(expenses).set({ status, approvedBy: user.id })
      .where(and(inArray(expenses.id, eligible.map((r) => r.id)), eq(expenses.status, "pending")));
    for (const r of eligible) await audit(db, user.id, d.decision, "expense", r.id, { voucherNo: r.voucherNo, status });
    const msg = `${eligible.length} voucher${eligible.length === 1 ? "" : "s"} ${status}${skipped ? ` (${skipped} skipped)` : ""}`;
    target = flashUrl(safeBack, "ok", msg);
  } catch (e) {
    target = flashUrl(safeBack, "err", errMsg(e));
  }
  revalidatePath("/expenses");
  revalidatePath("/projects");
  redirect(target);
}

/** Delete a pending voucher (owner) or any non-approved voucher (admin). */
export async function deleteExpense(form: FormData) {
  const user = await requireWrite("expenses");
  const db = await getDb();
  let target = "/expenses";
  try {
    const id = zId.parse(form.get("id"));
    const [ex] = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
    if (!ex) throw new UserError("Voucher not found");
    const allowed = user.role === "admin" ? ex.status !== "approved" : ex.userId === user.id && ex.status === "pending";
    if (!allowed) throw new UserError("Only your own vouchers awaiting approval can be deleted");
    await db.transaction(async (tx) => {
      await tx.delete(expenseAllocations).where(eq(expenseAllocations.expenseId, id));
      await tx.delete(expenses).where(eq(expenses.id, id));
    });
    await audit(db, user.id, "delete", "expense", id, { voucherNo: ex.voucherNo, amount: ex.amount });
    target = flashUrl("/expenses", "ok", `Voucher ${ex.voucherNo} deleted`);
  } catch (e) {
    const id = Number(form.get("id")) || 0;
    target = flashUrl(id > 0 ? `/expenses/${id}` : "/expenses", "err", errMsg(e));
  }
  revalidatePath("/expenses");
  revalidatePath("/projects");
  redirect(target);
}
