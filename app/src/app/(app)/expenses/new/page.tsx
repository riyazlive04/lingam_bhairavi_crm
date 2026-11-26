import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import { addDays, todayIST } from "@/lib/format";
import { Flash } from "@/components/ui";
import { FormPage } from "@/components/patterns";
import { VoucherForm } from "../_components/voucher-form";
import { saveExpense } from "../actions";
import { bookableProjects } from "../_lib/data";

export default async function NewExpensePage({ searchParams }: { searchParams: Promise<{ projectId?: string; ok?: string; err?: string }> }) {
  await requireUser("expenses");
  const sp = await searchParams;
  const db = await getDb();
  const projectList = await bookableProjects(db);
  const pre = Number(sp.projectId);
  const preset = projectList.some((p) => p.id === pre) ? [{ projectId: pre, amount: 0 }] : [];
  return (
    <FormPage width="narrow" title="New expense voucher" subtitle="Enter it the same day. Once approved, the amount goes straight into the project cost."
      back={{ href: "/expenses", label: "Expenses" }} notices={<Flash ok={sp.ok} err={sp.err} />}>
      <VoucherForm
        cancelHref="/expenses"
        action={saveExpense}
        projects={projectList}
        categories={EXPENSE_CATEGORIES}
        maxDate={addDays(todayIST(), 1)}
        initial={{
          date: todayIST(), category: "", amount: "", paidTo: "", billRef: "", description: "",
          allocations: preset.map((p) => ({ projectId: p.projectId, amount: p.amount })),
        }}
      />
    </FormPage>
  );
}
