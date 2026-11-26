import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { Pencil, Printer, Scale, Trash2 } from "lucide-react";
import { getDb } from "@/db";
import { auditLog, customers, projects, salesInvoices, salesOrders, salesReturnLines, salesReturns, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canRead, canSeeCost, canWrite } from "@/lib/rbac";
import { fmtDate, fmtDateTime, money, qty } from "@/lib/format";
import { openSalesInvoices } from "@/lib/billing";
import { maxAdjustable, noteBalance, reasonLabel } from "@/lib/returns";
import { Field, Flash, Input, LinkButton, Select } from "@/components/ui";
import {
  Callout, ConfirmButton, DetailPage, KeyValueGrid, MetaChip, ResponsiveTable, SectionCard, StatusPill, SummaryRows, type Column,
} from "@/components/patterns";
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

  type Line = (typeof lines)[number];
  const lineCols: Column<Line>[] = [
    { key: "n", header: "#", card: "hidden", className: "text-ink-soft", cell: (_l, i) => i + 1 },
    { key: "desc", header: "Description", card: "title", className: "max-w-80 whitespace-normal", cell: (l) => l.description },
    { key: "stock", header: "Stock", card: "badge",
      cell: (l) => l.restock ? <StatusPill semantic="success" label="Restock" /> : <StatusPill semantic="neutral" label="Not restocked" /> },
    { key: "qty", header: "Qty", align: "right", card: "subtitle", cell: (l) => qty(l.qty) },
    { key: "rate", header: "Rate", align: "right", nowrap: true, cell: (l) => money(l.rate) },
    { key: "amount", header: "Taxable", align: "right", card: "amount", nowrap: true, cell: (l) => money(l.amount) },
    { key: "gst", header: "GST", align: "right", nowrap: true,
      cell: (l) => <>{money((Number(l.amount) * Number(l.gstRate)) / 100)} <span className="text-caption text-ink-soft">at {l.gstRate}%</span></> },
    ...(showCost && isPosted ? [{ key: "cost", header: "Cost rate", align: "right" as const, priority: 3 as const, nowrap: true, cell: (l: Line) => money(l.costRate) }] : []),
  ];
  type Hist = (typeof history)[number];
  const histCols: Column<Hist>[] = [
    { key: "inv", header: "Invoice", card: "title",
      cell: (h) => {
        const d = (h.details ?? {}) as { invoiceId?: number; invoiceNumber?: string };
        return d.invoiceId && billingRead ? <Link className={link} href={`/billing/invoices/${d.invoiceId}`}>{d.invoiceNumber ?? `#${d.invoiceId}`}</Link> : d.invoiceNumber ?? "-";
      } },
    { key: "when", header: "When", card: "subtitle", nowrap: true, cell: (h) => fmtDateTime(h.at) },
    { key: "by", header: "By", cell: (h) => h.userName ?? "-" },
    { key: "amount", header: "Amount", align: "right", card: "amount", nowrap: true,
      cell: (h) => money(Number(((h.details ?? {}) as { amount?: number }).amount ?? 0)) },
  ];

  const primary = isDraft && write
    ? (
      <form action={postSalesReturnAction}>
        <input type="hidden" name="returnId" value={r.id} />
        <SubmitButton pendingText="Posting…" confirm="Post this credit note? Order quantities and stock will be updated and the number is final.">Post credit note</SubmitButton>
      </form>
    )
    : isPosted
      ? <LinkButton href={`/returns/${r.id}/print`}><Printer className="icon-sm" aria-hidden /> Print credit note</LinkButton>
      : null;

  return (
    <DetailPage
      back={{ href: "/returns", label: "Returns" }}
      eyebrow="Customer return"
      title={isDraft ? "Draft credit note" : r.number}
      status={<StatusPill status={r.status} />}
      meta={
        <>
          <MetaChip label="Customer" href={billingRead ? `/billing/receivables/${r.customerId}` : undefined}>{row.customerName}</MetaChip>
          {row.orderNo && <MetaChip label="Order">{row.orderNo}</MetaChip>}
          {row.invNo && <MetaChip label="Invoice">{row.invNo}</MetaChip>}
          <MetaChip label="Date">{fmtDate(r.date)}</MetaChip>
          <MetaChip label="Total">{money(r.total)}</MetaChip>
        </>
      }
      primaryAction={primary}
      secondaryActions={isDraft && write ? <LinkButton href={`/returns/${r.id}/edit`} variant="secondary"><Pencil className="icon-sm" aria-hidden /> Edit draft</LinkButton> : undefined}
      moreActions={isDraft && write ? (
        <form action={deleteSalesReturnDraft}>
          <input type="hidden" name="returnId" value={r.id} />
          <ConfirmButton variant="ghost" className="text-danger" confirmVariant="danger" stacked pendingText="Deleting…" confirmLabel="Yes, delete draft"
            confirm="Delete this draft? Nothing has been posted yet.">
            <Trash2 className="icon-sm" aria-hidden /> Delete draft
          </ConfirmButton>
        </form>
      ) : undefined}
      notices={
        <>
          <Flash ok={sp.ok} err={sp.err} />
          {isDraft && <Callout tone="warning" title="This is a draft">Nothing changes on the order, stock or the customer account until you post it.</Callout>}
        </>
      }
      aside={
        <>
          <SectionCard title="Summary">
            <SummaryRows rows={[
              ["Taxable value", money(r.subtotal)],
              ["GST", money(r.taxAmount)],
              ["Credit total", money(r.total)],
              ["Adjusted", <span key="a" className="text-success">{money(r.adjustedAmount)}</span>],
              ["Balance credit", isPosted ? money(balance) : "-"],
            ]} />
          </SectionCard>
          {isPosted && balance > 0 && write && billingWrite ? (
            <SectionCard title="Adjust against invoice" icon={Scale}
              empty={open.length === 0 && "This customer has no open invoices right now. The credit stays on their account and reduces their net due."}>
              <form action={adjustCreditNoteAction} className="grid gap-3">
                <input type="hidden" name="returnId" value={r.id} />
                <Field label="Invoice" required>
                  <Select name="invoiceId" required defaultValue={preferred ? String(preferred.id) : ""}>
                    {open.map((o) => <option key={o.id} value={o.id}>{o.number} · due {money(o.outstanding)}</option>)}
                  </Select>
                </Field>
                <Field label="Amount (₹)" required hint={`Up to the credit balance ${money(balance)} or the invoice outstanding, whichever is lower`}>
                  <Input name="amount" type="number" inputMode="decimal" step="0.01" min="0.01" max={balance} defaultValue={preferred ? maxAdjustable(balance, preferred.outstanding) : balance} required className="text-right" />
                </Field>
                <SubmitButton pendingText="Adjusting…">Adjust against invoice</SubmitButton>
              </form>
            </SectionCard>
          ) : (
            <SectionCard title="Settlement">
              <p className="text-sm text-ink-soft">
                {isDraft ? "Post the credit note first. Then it can be adjusted against the customer's invoices."
                  : balance <= 0 ? "This credit note is fully adjusted."
                    : "Accounts can adjust the balance against one of the customer's invoices."}
              </p>
            </SectionCard>
          )}
        </>
      }
    >
      <SectionCard title="Details">
        <KeyValueGrid columns={2} items={[
          { label: "Customer", value: billingRead ? <Link className={link} href={`/billing/receivables/${r.customerId}`}>{row.customerName}</Link> : row.customerName },
          { label: "Return date", value: fmtDate(r.date) },
          { label: "Reason", value: reasonLabel(r.reason) },
          { label: "Order", value: r.orderId && row.orderNo ? (canRead(user.role, "orders") ? <Link className={link} href={`/orders/${r.orderId}`}>{row.orderNo}</Link> : row.orderNo) : null },
          { label: "Original invoice", value: r.salesInvoiceId && row.invNo ? <>{billingRead ? <Link className={link} href={`/billing/invoices/${r.salesInvoiceId}`}>{row.invNo}</Link> : row.invNo} dated {fmtDate(row.invDate)}</> : null },
          { label: "Project", value: row.projectName },
          { label: "Notes", value: r.notes, wide: true },
        ]} />
      </SectionCard>

      <SectionCard title="Lines" count={lines.length} flush empty={lines.length === 0 && "No lines on this credit note yet. Edit the draft to add the items coming back."}>
        <ResponsiveTable flush rows={lines} columns={lineCols} rowKey={(l) => l.id} caption="Credit note lines"
          footerRows={[{
            label: "Totals", labelAlign: "right", className: "", labelClassName: "font-medium",
            cells: {
              amount: { value: money(r.subtotal), className: "font-semibold" },
              gst: <>{money(r.taxAmount)}<div className="text-caption font-semibold text-ink">Total {money(r.total)}</div></>,
            },
          }]} />
      </SectionCard>

      <SectionCard title="Adjustments" count={history.length} flush
        empty={history.length === 0 && "Not adjusted yet. Adjustments against invoices appear here."}>
        <ResponsiveTable flush rows={history} columns={histCols} rowKey={(_h, i) => i} caption="Adjustments" />
      </SectionCard>
    </DetailPage>
  );
}
