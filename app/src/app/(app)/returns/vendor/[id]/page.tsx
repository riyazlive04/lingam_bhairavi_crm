import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { Pencil, Printer, Scale, Trash2 } from "lucide-react";
import { getDb } from "@/db";
import { auditLog, items, purchaseInvoices, purchaseReturnLines, purchaseReturns, users, vendors } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canRead, canWrite } from "@/lib/rbac";
import { fmtDate, fmtDateTime, money, qty } from "@/lib/format";
import { openPurchaseInvoices } from "@/lib/billing";
import { maxAdjustable, noteBalance } from "@/lib/returns";
import { Field, Flash, Input, LinkButton, Select } from "@/components/ui";
import {
  Callout, ConfirmButton, DetailPage, KeyValueGrid, MetaChip, ResponsiveTable, SectionCard, StatusPill, SummaryRows, type Column,
} from "@/components/patterns";
import { SubmitButton } from "@/components/submit-button";
import { adjustDebitNoteAction, deleteVendorReturnDraft, postVendorReturnAction } from "../../actions";

export const metadata = { title: "Debit note" };

const link = "text-brand-700 hover:underline dark:text-brand-300";

export default async function DebitNotePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const user = await requireUser("returns");
  const { id } = await params;
  const sp = await searchParams;
  const returnId = Number(id);
  if (!Number.isInteger(returnId) || returnId <= 0) notFound();
  const db = await getDb();
  const [row] = await db.select({ r: purchaseReturns, vendorName: vendors.name, billNo: purchaseInvoices.invoiceNo, billDate: purchaseInvoices.invoiceDate })
    .from(purchaseReturns).innerJoin(vendors, eq(vendors.id, purchaseReturns.vendorId))
    .leftJoin(purchaseInvoices, eq(purchaseInvoices.id, purchaseReturns.purchaseInvoiceId))
    .where(eq(purchaseReturns.id, returnId));
  if (!row) notFound();
  const { r } = row;
  const isDraft = r.status === "draft", isPosted = r.status === "posted";
  const write = canWrite(user.role, "returns");
  const canAdjust = write && (canWrite(user.role, "billing") || canWrite(user.role, "purchases"));
  const balance = isPosted ? noteBalance(r.total, r.adjustedAmount) : 0;

  const [lines, history, open] = await Promise.all([
    db.select({ l: purchaseReturnLines, name: items.name, code: items.code, uom: items.uom }).from(purchaseReturnLines)
      .innerJoin(items, eq(items.id, purchaseReturnLines.itemId)).where(eq(purchaseReturnLines.returnId, returnId)).orderBy(asc(purchaseReturnLines.id)),
    db.select({ at: auditLog.at, details: auditLog.details, userName: users.name }).from(auditLog).leftJoin(users, eq(users.id, auditLog.userId))
      .where(and(eq(auditLog.entityType, "purchase_return"), eq(auditLog.entityId, returnId), eq(auditLog.action, "adjust"))).orderBy(desc(auditLog.at)),
    isPosted && balance > 0 && canAdjust ? openPurchaseInvoices(db, { vendorId: r.vendorId }) : Promise.resolve([]),
  ]);
  const preferred = open.find((o) => o.id === r.purchaseInvoiceId) ?? open[0];
  const billLink = r.purchaseInvoiceId && row.billNo
    ? (canRead(user.role, "purchases") ? <Link className={link} href={`/purchases/${r.purchaseInvoiceId}`}>{row.billNo}</Link> : row.billNo) : null;

  type Line = (typeof lines)[number];
  const lineCols: Column<Line>[] = [
    { key: "n", header: "#", card: "hidden", className: "text-ink-soft", cell: (_x, i) => i + 1 },
    { key: "item", header: "Item", card: "title", className: "max-w-80 whitespace-normal",
      cell: ({ name, code }) => <>{name}<div className="text-caption font-normal text-ink-faint">{code}</div></> },
    { key: "qty", header: "Qty", align: "right", card: "subtitle", nowrap: true, cell: ({ l, uom }) => <>{qty(l.qty)} <span className="text-caption text-ink-soft">{uom}</span></> },
    { key: "rate", header: "Rate", align: "right", nowrap: true, cell: ({ l }) => money(l.rate) },
    { key: "amount", header: "Taxable", align: "right", card: "amount", nowrap: true, cell: ({ l }) => money(l.amount) },
    { key: "gst", header: "GST", align: "right", nowrap: true,
      cell: ({ l }) => <>{money((Number(l.amount) * Number(l.gstRate)) / 100)} <span className="text-caption text-ink-soft">at {l.gstRate}%</span></> },
  ];
  type Hist = (typeof history)[number];
  const histCols: Column<Hist>[] = [
    { key: "bill", header: "Bill", card: "title", cell: (h) => ((h.details ?? {}) as { invoiceNo?: string }).invoiceNo ?? "-" },
    { key: "when", header: "When", card: "subtitle", nowrap: true, cell: (h) => fmtDateTime(h.at) },
    { key: "by", header: "By", cell: (h) => h.userName ?? "-" },
    { key: "amount", header: "Amount", align: "right", card: "amount", nowrap: true,
      cell: (h) => money(Number(((h.details ?? {}) as { amount?: number }).amount ?? 0)) },
  ];

  const primary = isDraft && write
    ? (
      <form action={postVendorReturnAction}>
        <input type="hidden" name="returnId" value={r.id} />
        <SubmitButton pendingText="Posting…" confirm="Post this debit note? Stock will be reduced and the number is final.">Post debit note</SubmitButton>
      </form>
    )
    : isPosted
      ? <LinkButton href={`/returns/vendor/${r.id}/print`}><Printer className="icon-sm" aria-hidden /> Print debit note</LinkButton>
      : null;

  return (
    <DetailPage
      back={{ href: "/returns?tab=vendor", label: "Returns" }}
      eyebrow="Return to vendor"
      title={isDraft ? "Draft debit note" : r.number}
      status={<StatusPill status={r.status} />}
      meta={
        <>
          <MetaChip label="Vendor">{row.vendorName}</MetaChip>
          {row.billNo && <MetaChip label="Bill">{row.billNo}</MetaChip>}
          <MetaChip label="Date">{fmtDate(r.date)}</MetaChip>
          <MetaChip label="Total">{money(r.total)}</MetaChip>
        </>
      }
      primaryAction={primary}
      secondaryActions={isDraft && write ? <LinkButton href={`/returns/vendor/${r.id}/edit`} variant="secondary"><Pencil className="icon-sm" aria-hidden /> Edit draft</LinkButton> : undefined}
      moreActions={isDraft && write ? (
        <form action={deleteVendorReturnDraft}>
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
          {isDraft && <Callout tone="warning" title="This is a draft">Stock and the vendor balance change only when you post it.</Callout>}
        </>
      }
      aside={
        <>
          <SectionCard title="Summary">
            <SummaryRows rows={[
              ["Taxable value", money(r.subtotal)],
              ["GST", money(r.taxAmount)],
              ["Debit total", money(r.total)],
              ["Adjusted", <span key="a" className="text-success">{money(r.adjustedAmount)}</span>],
              ["Balance", isPosted ? money(balance) : "-"],
            ]} />
          </SectionCard>
          {isPosted && balance > 0 && canAdjust ? (
            <SectionCard title="Adjust against vendor bill" icon={Scale}
              empty={open.length === 0 && "No unpaid bills from this vendor right now. The debit stays on their account and reduces what you owe them."}>
              <form action={adjustDebitNoteAction} className="grid gap-3">
                <input type="hidden" name="returnId" value={r.id} />
                <Field label="Vendor bill" required>
                  <Select name="purchaseInvoiceId" required defaultValue={preferred ? String(preferred.id) : ""}>
                    {open.map((o) => <option key={o.id} value={o.id}>{o.number} · balance {money(o.outstanding)}</option>)}
                  </Select>
                </Field>
                <Field label="Amount (₹)" required hint={`Up to the debit balance ${money(balance)} or the bill balance, whichever is lower`}>
                  <Input name="amount" type="number" inputMode="decimal" step="0.01" min="0.01" max={balance} defaultValue={preferred ? maxAdjustable(balance, preferred.outstanding) : balance} required className="text-right" />
                </Field>
                <SubmitButton pendingText="Adjusting…">Adjust against vendor bill</SubmitButton>
              </form>
            </SectionCard>
          ) : (
            <SectionCard title="Settlement">
              <p className="text-sm text-ink-soft">
                {isDraft ? "Post the debit note first. Then it can be adjusted against the vendor's bills."
                  : balance <= 0 ? "This debit note is fully adjusted." : "Accounts or Purchase can adjust the balance against one of the vendor's bills."}
              </p>
            </SectionCard>
          )}
        </>
      }
    >
      <SectionCard title="Details">
        <KeyValueGrid columns={2} items={[
          { label: "Vendor", value: row.vendorName },
          { label: "Return date", value: fmtDate(r.date) },
          { label: "Vendor bill", value: billLink ? <>{billLink} dated {fmtDate(row.billDate)}</> : null },
          { label: "Reason", value: r.reason },
        ]} />
      </SectionCard>

      <SectionCard title="Lines" count={lines.length} flush empty={lines.length === 0 && "No lines on this debit note yet. Edit the draft to add the items going back."}>
        <ResponsiveTable flush rows={lines} columns={lineCols} rowKey={({ l }) => l.id} caption="Debit note lines"
          footerRows={[{
            label: "Totals", labelAlign: "right", className: "", labelClassName: "font-medium",
            cells: {
              amount: { value: money(r.subtotal), className: "font-semibold" },
              gst: <>{money(r.taxAmount)}<div className="text-caption font-semibold text-ink">Total {money(r.total)}</div></>,
            },
          }]} />
      </SectionCard>

      <SectionCard title="Adjustments" count={history.length} flush
        empty={history.length === 0 && "Not adjusted yet. Adjustments against vendor bills appear here."}>
        <ResponsiveTable flush rows={history} columns={histCols} rowKey={(_h, i) => i} caption="Adjustments" />
      </SectionCard>
    </DetailPage>
  );
}
