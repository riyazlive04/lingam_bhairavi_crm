import Link from "next/link";
import { and, asc, count, desc, eq, gte, ilike, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { Plus } from "lucide-react";
import { getDb } from "@/db";
import { projects, purchaseInvoices, vendors } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canRead, canWrite } from "@/lib/rbac";
import { fmtDate, money, todayIST } from "@/lib/format";
import { purchaseOutstanding } from "@/lib/purchasing";
import { Badge, Button, EmptyState, Flash, Input, LinkButton, PageHeader, Select, Stat, StatusBadge, Table, Td, Th, cx } from "@/components/ui";
import { Pager, qs } from "../items/_components/tabs";

const PAGE_SIZE = 50;
type SP = { q?: string; status?: string; vendor?: string; project?: string; from?: string; to?: string; page?: string; ok?: string; err?: string };

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser("purchases");
  const sp = await searchParams;
  const db = await getDb();
  const write = canWrite(user.role, "purchases");
  const today = todayIST();

  const conds: (SQL | undefined)[] = [];
  const status = sp.status ?? "";
  if (status === "unpaid") conds.push(and(eq(purchaseInvoices.status, "posted"), sql`${purchaseInvoices.total} - ${purchaseInvoices.paidAmount} > 0.5`));
  else if (status === "overdue") conds.push(and(eq(purchaseInvoices.status, "posted"), sql`${purchaseInvoices.total} - ${purchaseInvoices.paidAmount} > 0.5`, lt(purchaseInvoices.dueDate, today)));
  else if (status === "paid") conds.push(and(eq(purchaseInvoices.status, "posted"), sql`${purchaseInvoices.total} - ${purchaseInvoices.paidAmount} <= 0.5`));
  else if (["draft", "posted", "cancelled"].includes(status)) conds.push(eq(purchaseInvoices.status, status));
  if (sp.vendor) conds.push(eq(purchaseInvoices.vendorId, Number(sp.vendor) || 0));
  if (sp.project === "stock") conds.push(sql`${purchaseInvoices.projectId} is null`);
  else if (sp.project) conds.push(eq(purchaseInvoices.projectId, Number(sp.project) || 0));
  if (sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from)) conds.push(gte(purchaseInvoices.invoiceDate, sp.from));
  if (sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to)) conds.push(lte(purchaseInvoices.invoiceDate, sp.to));
  if (sp.q) conds.push(or(ilike(purchaseInvoices.invoiceNo, `%${sp.q.trim()}%`), ilike(vendors.name, `%${sp.q.trim()}%`)));
  const where = and(...conds);

  const page = Math.max(1, Number(sp.page) || 1);
  const [vendorList, projectList, [{ n }], rows, [summary]] = await Promise.all([
    db.select({ id: vendors.id, name: vendors.name }).from(vendors).orderBy(asc(vendors.name)),
    db.select({ id: projects.id, code: projects.code, name: projects.name }).from(projects).orderBy(desc(projects.id)),
    db.select({ n: count() }).from(purchaseInvoices).leftJoin(vendors, eq(vendors.id, purchaseInvoices.vendorId)).where(where),
    db.select({ inv: purchaseInvoices, vendorName: vendors.name, projectCode: projects.code, projectName: projects.name })
      .from(purchaseInvoices)
      .leftJoin(vendors, eq(vendors.id, purchaseInvoices.vendorId))
      .leftJoin(projects, eq(projects.id, purchaseInvoices.projectId))
      .where(where).orderBy(desc(purchaseInvoices.invoiceDate), desc(purchaseInvoices.id))
      .limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    db.select({
      outstanding: sql<number>`coalesce(sum(case when ${purchaseInvoices.status} = 'posted' then ${purchaseInvoices.total} - ${purchaseInvoices.paidAmount} else 0 end),0)`.mapWith(Number),
      overdue: sql<number>`coalesce(sum(case when ${purchaseInvoices.status} = 'posted' and ${purchaseInvoices.dueDate} < ${today} then ${purchaseInvoices.total} - ${purchaseInvoices.paidAmount} else 0 end),0)`.mapWith(Number),
      drafts: sql<number>`count(*) filter (where ${purchaseInvoices.status} = 'draft')`.mapWith(Number),
      month: sql<number>`coalesce(sum(case when ${purchaseInvoices.status} = 'posted' and ${purchaseInvoices.invoiceDate} >= ${today.slice(0, 7) + "-01"} then ${purchaseInvoices.total} else 0 end),0)`.mapWith(Number),
    }).from(purchaseInvoices),
  ]);
  const total = Number(n);
  const base = { q: sp.q, status, vendor: sp.vendor, project: sp.project, from: sp.from, to: sp.to };

  return (
    <div>
      <PageHeader title="Purchase invoices" subtitle="Supplier bills. Posting an invoice updates latest item prices, the vendor master and stock automatically."
        actions={write && <LinkButton href="/purchases/new"><Plus size={16} aria-hidden /> New invoice</LinkButton>} />
      <Flash ok={sp.ok} err={sp.err} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Outstanding payable" value={money(summary.outstanding)} href={"/purchases" + qs({ status: "unpaid" })} />
        <Stat label="Overdue" value={money(summary.overdue)} tone={summary.overdue > 0.5 ? "bad" : "default"} href={"/purchases" + qs({ status: "overdue" })} />
        <Stat label="Purchases this month" value={money(summary.month)} />
        <Stat label="Drafts to post" value={summary.drafts} tone={summary.drafts > 0 ? "warn" : "default"} href={"/purchases" + qs({ status: "draft" })} hint="Prices update only after posting" />
      </div>
      <form method="get" className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <label className="lg:col-span-2"><span className="sr-only">Search</span><Input name="q" defaultValue={sp.q} placeholder="Invoice no. or vendor…" /></label>
        <label><span className="sr-only">Status</span>
          <Select name="status" defaultValue={status}>
            <option value="">All statuses</option>
            <option value="draft">Draft</option><option value="posted">Posted</option><option value="unpaid">Unpaid</option>
            <option value="overdue">Overdue</option><option value="paid">Paid</option><option value="cancelled">Cancelled</option>
          </Select>
        </label>
        <label><span className="sr-only">Vendor</span>
          <Select name="vendor" defaultValue={sp.vendor ?? ""}>
            <option value="">All vendors</option>
            {vendorList.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </Select>
        </label>
        <label><span className="sr-only">Project</span>
          <Select name="project" defaultValue={sp.project ?? ""}>
            <option value="">All (stock & projects)</option>
            <option value="stock">Into stock only</option>
            {projectList.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </Select>
        </label>
        <div className="flex gap-2">
          <label className="flex-1"><span className="sr-only">From date</span><Input type="date" name="from" defaultValue={sp.from} aria-label="From date" /></label>
          <label className="flex-1"><span className="sr-only">To date</span><Input type="date" name="to" defaultValue={sp.to} aria-label="To date" /></label>
        </div>
        <div className="flex gap-2 lg:col-span-6">
          <Button type="submit" variant="secondary">Filter</Button>
          {Object.values(base).some(Boolean) && <LinkButton href="/purchases" variant="ghost">Clear</LinkButton>}
        </div>
      </form>
      {rows.length === 0 ? (
        <EmptyState title="No purchase invoices found" action={write && <LinkButton href="/purchases/new">Enter a supplier invoice</LinkButton>}>
          Every posted supplier invoice keeps the price master up to date.
        </EmptyState>
      ) : (
        <>
          <Table>
            <thead><tr><Th>Invoice</Th><Th>Vendor</Th><Th>Date</Th><Th>Due</Th><Th>Cost center</Th><Th>Status</Th><Th className="text-right">Total</Th><Th className="text-right">Paid</Th><Th className="text-right">Outstanding</Th></tr></thead>
            <tbody>
              {rows.map(({ inv, vendorName, projectCode, projectName }) => {
                const out = inv.status === "posted" ? purchaseOutstanding(inv) : 0;
                const od = out > 0.5 && inv.dueDate != null && inv.dueDate < today;
                const st = inv.status === "posted" ? (out <= 0.5 ? "paid" : inv.paidAmount > 0 ? "partially_paid" : "posted") : inv.status;
                return (
                  <tr key={inv.id} className="hover:bg-muted/50">
                    <Td><Link href={`/purchases/${inv.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">{inv.invoiceNo}</Link></Td>
                    <Td className="max-w-56 truncate">{vendorName ? (canRead(user.role, "vendors") ? <Link href={`/vendors/${inv.vendorId}`} className="hover:underline">{vendorName}</Link> : vendorName) : "—"}</Td>
                    <Td>{fmtDate(inv.invoiceDate)}</Td>
                    <Td className={cx(od && "font-medium text-red-600")}>{fmtDate(inv.dueDate)}{od && <div className="text-xs">overdue</div>}</Td>
                    <Td>{projectCode ? <span title={projectName ?? undefined}><Badge tone="violet">{projectCode}</Badge></span> : <span className="text-ink-faint">Stock</span>}</Td>
                    <Td><StatusBadge status={st} /></Td>
                    <Td className="text-right tabular-nums">{money(inv.total)}</Td>
                    <Td className="text-right tabular-nums">{inv.status === "posted" ? money(inv.paidAmount) : "—"}</Td>
                    <Td className="text-right tabular-nums">{inv.status === "posted" ? (out > 0.5 ? <span className="font-medium">{money(out)}</span> : <span className="text-ink-faint">—</span>) : "—"}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <Pager page={page} pages={Math.ceil(total / PAGE_SIZE)} href={(p) => "/purchases" + qs({ ...base, page: p })} />
        </>
      )}
    </div>
  );
}
