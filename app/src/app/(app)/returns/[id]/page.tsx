import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { Pencil, Printer } from "lucide-react";
import { getDb } from "@/db";
import { auditLog, customers, projects, salesInvoices, salesOrders, salesReturnLines, salesReturns, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canRead, canSeeCost, canWrite } from "@/lib/rbac";
import { fmtDate, fmtDateTime, money, qty } from "@/lib/format";
import { openSalesInvoices } from "@/lib/billing";
import { maxAdjustable, noteBalance, reasonLabel } from "@/lib/returns";
import { Badge, Card, DL, EmptyState, Field, Flash, Input, LinkButton, PageHeader, Select, StatusBadge, Table, Td, Th } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { adjustCreditNoteAction, deleteSalesReturnDraft, postSalesReturnAction } from "../actions";

export const metadata = { title: "Credit note" };

const link = "text-brand-700 hover:underline dark:text-brand-300";

export default async function CreditNotePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const user = await requireUser("returns");
  const { id } = await params;
  const sp = await searchParams;
  const returnId = Number(id);
  if (!Number.isInteger(returnId) || returnId <= 0) notFound();
  const db = await getDb();
  const [row] = await db
    .select({ r: salesReturns, customerName: customers.name, invNo: salesInvoices.number, invDate: salesInvoices.invoiceDate, orderNo: salesOrders.number, projectName: projects.name })
    .from(salesReturns)
    .innerJoin(customers, eq(customers.id, salesReturns.customerId))
    .leftJoin(salesInvoices, eq(salesInvoices.id, salesReturns.salesInvoiceId))
    .leftJoin(salesOrders, eq(salesOrders.id, salesReturns.orderId))
    .leftJoin(projects, eq(projects.id, salesReturns.projectId))
    .where(eq(salesReturns.id, returnId));
  if (!row) notFound();
  const { r } = row;
  const isDraft = r.status === "draft", isPosted = r.status === "posted";
  const write = canWrite(user.role, "returns");
  const billingWrite = canWrite(user.role, "billing");
  const billingRead = canRead(user.role, "billing");
  const showCost = canSeeCost(user.role);
  const balance = isPosted ? noteBalance(r.total, r.adjustedAmount) : 0;

  const [lines, history, open] = await Promise.all([
    db.select().from(salesReturnLines).where(eq(salesReturnLines.returnId, returnId)).orderBy(asc(salesReturnLines.id)),
    db.select({ at: auditLog.at, details: auditLog.details, userName: users.name }).from(auditLog).leftJoin(users, eq(users.id, auditLog.userId))
      .where(and(eq(auditLog.entityType, "sales_return"), eq(auditLog.entityId, returnId), eq(auditLog.action, "adjust"))).orderBy(desc(auditLog.at)),
    isPosted && balance > 0 && write && billingWrite ? openSalesInvoices(db, { customerId: r.customerId }) : Promise.resolve([]),
  ]);
  const preferred = open.find((o) => o.id === r.salesInvoiceId) ?? open[0];

  return (
    <>
      <PageHeader
        eyebrow="Customer return"
        title={<span className="flex flex-wrap items-center gap-2">{isDraft ? "Draft credit note" : r.number} <StatusBadge status={r.status} /></span>}
        subtitle={<>{row.customerName}{row.orderNo ? ` · order ${row.orderNo}` : ""}{row.invNo ? ` · invoice ${row.invNo}` : ""}</>}
        back={{ href: "/returns", label: "Returns" }}
        actions={<>
          {isPosted && <LinkButton href={`/returns/${r.id}/print`} variant="secondary"><Printer className="h-4 w-4" aria-hidden /> Credit note</LinkButton>}
          {isDraft && write && <LinkButton href={`/returns/${r.id}/edit`} variant="secondary"><Pencil className="h-4 w-4" aria-hidden /> Edit</LinkButton>}
          {isDraft && write && (
            <form action={deleteSalesReturnDraft}>
              <input type="hidden" name="returnId" value={r.id} />
              <SubmitButton variant="ghost" pendingText="Deleting…" confirm="Delete this draft? Nothing has been posted yet.">Delete draft</SubmitButton>
            </form>
          )}
          {isDraft && write && (
            <form action={postSalesReturnAction}>
              <input type="hidden" name="returnId" value={r.id} />
              <SubmitButton pendingText="Posting…" confirm="Post this credit note? Order quantities and stock will be updated and the number is final.">Post credit note</SubmitButton>
            </form>
          )}
        </>}
      />
      <Flash ok={sp.ok} err={sp.err} />
      {isDraft && <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">This is a draft. Nothing changes on the order, stock or the customer account until you post it.</p>}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-line bg-surface p-4"><div className="text-xs uppercase tracking-wide text-ink-soft">Credit total</div><div className="mt-1 text-xl font-semibold tabular-nums">{money(r.total)}</div></div>
        <div className="rounded-xl border border-line bg-surface p-4"><div className="text-xs uppercase tracking-wide text-ink-soft">GST</div><div className="mt-1 text-xl font-semibold tabular-nums">{money(r.taxAmount)}</div></div>
        <div className="rounded-xl border border-line bg-surface p-4"><div className="text-xs uppercase tracking-wide text-ink-soft">Adjusted</div><div className="mt-1 text-xl font-semibold tabular-nums text-emerald-600">{money(r.adjustedAmount)}</div></div>
        <div className="rounded-xl border border-line bg-surface p-4"><div className="text-xs uppercase tracking-wide text-ink-soft">Balance credit</div><div className="mt-1 text-xl font-semibold tabular-nums">{isPosted ? money(balance) : "-"}</div></div>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card title="Details" className="lg:col-span-2">
          <DL items={[
            ["Customer", billingRead ? <Link className={link} href={`/billing/receivables/${r.customerId}`}>{row.customerName}</Link> : row.customerName],
            ["Return date", fmtDate(r.date)],
            ["Reason", reasonLabel(r.reason)],
            ["Order", r.orderId && row.orderNo ? (canRead(user.role, "orders") ? <Link className={link} href={`/orders/${r.orderId}`}>{row.orderNo}</Link> : row.orderNo) : "-"],
            ["Original invoice", r.salesInvoiceId && row.invNo ? <>{billingRead ? <Link className={link} href={`/billing/invoices/${r.salesInvoiceId}`}>{row.invNo}</Link> : row.invNo} dated {fmtDate(row.invDate)}</> : "-"],
            ["Project", row.projectName || "-"],
            ["Notes", r.notes || "-"],
          ]} />
        </Card>
        {isPosted && balance > 0 && write && billingWrite ? (
          <Card title="Adjust against invoice">
            {open.length === 0 ? (
              <p className="text-sm text-ink-soft">This customer has no open invoices right now. The credit stays on their account and reduces their net due.</p>
            ) : (
              <form action={adjustCreditNoteAction} className="grid gap-3">
                <input type="hidden" name="returnId" value={r.id} />
                <Field label="Invoice" required>
                  <Select name="invoiceId" required defaultValue={preferred ? String(preferred.id) : ""}>
                    {open.map((o) => <option key={o.id} value={o.id}>{o.number} · due {money(o.outstanding)}</option>)}
                  </Select>
                </Field>
                <Field label="Amount (₹)" required hint={`Up to the credit balance ${money(balance)} or the invoice outstanding, whichever is lower`}>
                  <Input name="amount" type="number" inputMode="decimal" step="0.01" min="0.01" max={balance} defaultValue={preferred ? maxAdjustable(balance, preferred.outstanding) : balance} required />
                </Field>
                <SubmitButton variant="success" pendingText="Adjusting…">Adjust against invoice</SubmitButton>
              </form>
            )}
          </Card>
        ) : (
          <Card title="Settlement">
            <p className="text-sm text-ink-soft">
              {isDraft ? "Post the credit note first. Then it can be adjusted against the customer's invoices."
                : balance <= 0 ? "This credit note is fully adjusted."
                  : "Accounts can adjust the balance against one of the customer's invoices."}
            </p>
          </Card>
        )}
      </div>

      <Card title={`Lines (${lines.length})`} className="mb-4" bodyClassName="p-0">
        <Table className="rounded-none border-0 shadow-none">
          <thead><tr><Th>#</Th><Th>Description</Th><Th className="text-right">Qty</Th><Th className="text-right">Rate</Th><Th className="text-right">Taxable</Th><Th className="text-right">GST</Th><Th>Stock</Th>{showCost && isPosted && <Th className="text-right">Cost rate</Th>}</tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.id}>
                <Td className="text-ink-soft">{i + 1}</Td>
                <Td className="max-w-80 whitespace-normal">{l.description}</Td>
                <Td className="text-right tabular-nums">{qty(l.qty)}</Td>
                <Td className="text-right tabular-nums">{money(l.rate)}</Td>
                <Td className="text-right tabular-nums">{money(l.amount)}</Td>
                <Td className="text-right tabular-nums">{money((Number(l.amount) * Number(l.gstRate)) / 100)} <span className="text-xs text-ink-soft">@{l.gstRate}%</span></Td>
                <Td>{l.restock ? <Badge tone="green">Restock</Badge> : <Badge tone="gray">Not restocked</Badge>}</Td>
                {showCost && isPosted && <Td className="text-right tabular-nums">{money(l.costRate)}</Td>}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><Td colSpan={4} className="text-right font-medium">Totals</Td><Td className="text-right tabular-nums">{money(r.subtotal)}</Td><Td className="text-right tabular-nums">{money(r.taxAmount)}</Td><Td className="whitespace-nowrap font-semibold tabular-nums">Total {money(r.total)}</Td>{showCost && isPosted && <Td />}</tr>
          </tfoot>
        </Table>
      </Card>

      <Card title={`Adjustments (${history.length})`} bodyClassName={history.length ? "p-0" : undefined}>
        {history.length === 0 ? <EmptyState title="Not adjusted yet">Adjustments against invoices appear here.</EmptyState> : (
          <Table className="rounded-none border-0 shadow-none">
            <thead><tr><Th>When</Th><Th>Invoice</Th><Th>By</Th><Th className="text-right">Amount</Th></tr></thead>
            <tbody>
              {history.map((h, i) => {
                const d = (h.details ?? {}) as { invoiceId?: number; invoiceNumber?: string; amount?: number };
                return (
                  <tr key={i}>
                    <Td className="whitespace-nowrap">{fmtDateTime(h.at)}</Td>
                    <Td>{d.invoiceId && billingRead ? <Link className={link} href={`/billing/invoices/${d.invoiceId}`}>{d.invoiceNumber ?? `#${d.invoiceId}`}</Link> : d.invoiceNumber ?? "-"}</Td>
                    <Td>{h.userName ?? "-"}</Td>
                    <Td className="text-right tabular-nums">{money(Number(d.amount ?? 0))}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
