import Link from "next/link";
import { Wallet } from "lucide-react";
import { getDb } from "@/db";
import { getSession } from "@/lib/auth";
import { canRead } from "@/lib/rbac";
import { money } from "@/lib/format";
import { projectCash } from "@/lib/billing";
import { Card, cx } from "@/components/ui";

/**
 * Cash position of a project for the project page: invoiced, received (including advances), credit notes and net due.
 * Server component. Renders nothing for users who cannot see billing.
 */
export async function ProjectCashCard({ projectId }: { projectId: number }) {
  const user = await getSession();
  if (!user || !canRead(user.role, "billing")) return null;
  const db = await getDb();
  const c = await projectCash(db, projectId);
  const rows: [string, number, string?][] = [
    ["Invoiced", c.invoiced, `${c.invoiceCount} invoice${c.invoiceCount === 1 ? "" : "s"}`],
    ["Received", c.received, c.advances ? `includes ${money(c.advances)} advance` : undefined],
    ["Credit notes", c.creditNotes, c.creditNotes ? "goods returned" : undefined],
  ];
  return (
    <Card title="Cash position" icon={Wallet} subtitle="Billing and collections for this project"
      actions={<Link href="/billing/invoices" className="rounded-md text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300">Billing</Link>}>
      <dl className="space-y-2 text-sm">
        {rows.map(([label, v, hint]) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <dt className="text-ink-soft">{label}{hint && <span className="block text-xs text-ink-faint">{hint}</span>}</dt>
            <dd className="font-medium tabular-nums">{money(v)}</dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-3 border-t border-line pt-2">
          <dt className="font-semibold text-ink">{c.netDue < -0.5 ? "Customer in credit" : "Net due"}</dt>
          <dd className={cx("text-base font-bold tabular-nums", c.netDue > 0.5 ? "text-amber-700 dark:text-amber-300" : c.netDue < -0.5 ? "text-emerald-700 dark:text-emerald-400" : "text-ink")}>
            {money(Math.abs(c.netDue))}
          </dd>
        </div>
      </dl>
      {c.invoiced === 0 && c.received === 0 && <p className="mt-3 text-xs text-ink-soft">Nothing invoiced or received for this project yet.</p>}
    </Card>
  );
}
