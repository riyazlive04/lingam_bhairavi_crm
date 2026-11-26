import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { Pencil, Printer } from "lucide-react";
import { getDb } from "@/db";
import { auditLog, items, purchaseInvoices, purchaseReturnLines, purchaseReturns, users, vendors } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canRead, canWrite } from "@/lib/rbac";
import { fmtDate, fmtDateTime, money, qty } from "@/lib/format";
import { openPurchaseInvoices } from "@/lib/billing";
import { maxAdjustable, noteBalance } from "@/lib/returns";
import { Card, DL, EmptyState, Field, Flash, Input, LinkButton, PageHeader, Select, StatusBadge, Table, Td, Th } from "@/components/ui";
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

  return (
    <>
      <PageHeader
        eyebrow="Return to vendor"
        title={<span className="flex flex-wrap items-center gap-2">{isDraft ? "Draft debit note" : r.number} <StatusBadge status={r.status} /></span>}
        subtitle={<>{row.vendorName}{row.billNo ? ` · bill ${row.billNo}` : ""}</>}
        back={{ href: "/returns?tab=vendor", label: "Returns" }}
        actions={<>
          {isPosted && <LinkButton href={`/returns/vendor/${r.id}/print`} variant="secondary"><Printer className="h-4 w-4" aria-hidden /> Debit note</LinkButton>}
          {isDraft && write && <LinkButton href={`/returns/vendor/${r.id}/edit`} variant="secondary"><Pencil className="h-4 w-4" aria-hidden /> Edit</LinkButton>}
          {isDraft && write && (
            <form action={deleteVendorReturnDraft}>
              <input type="hidden" name="returnId" value={r.id} />
              <SubmitButton variant="ghost" pendingText="Deleting…" confirm="Delete this draft? Nothing has been posted yet.">Delete draft</SubmitButton>
            </form>
          )}
          {isDraft && write && (
            <form action={postVendorReturnAction}>
              <input type="hidden" name="returnId" value={r.id} />
              <SubmitButton pendingText="Posting…" confirm="Post this debit note? Stock will be reduced and the number is final.">Post debit note</SubmitButton>
            </form>
          )}
        </>}
      />
      <Flash ok={sp.ok} err={sp.err} />
      {isDraft && <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">This is a draft. Stock and the vendor balance change only when you post it.</p>}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-line bg-surface p-4"><div className="text-xs uppercase tracking-wide text-ink-soft">Debit total</div><div className="mt-1 text-xl font-semibold tabular-nums">{money(r.total)}</div></div>
        <div className="rounded-xl border border-line bg-surface p-4"><div className="text-xs uppercase tracking-wide text-ink-soft">GST</div><div className="mt-1 text-xl font-semibold tabular-nums">{money(r.taxAmount)}</div></div>
        <div className="rounded-xl border border-line bg-surface p-4"><div className="text-xs uppercase tracking-wide text-ink-soft">Adjusted</div><div className="mt-1 text-xl font-semibold tabular-nums text-emerald-600">{money(r.adjustedAmount)}</div></div>
        <div className="rounded-xl border border-line bg-surface p-4"><div className="text-xs uppercase tracking-wide text-ink-soft">Balance</div><div className="mt-1 text-xl font-semibold tabular-nums">{isPosted ? money(balance) : "-"}</div></div>
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card title="Details" className="lg:col-span-2">
          <DL items={[
            ["Vendor", row.vendorName],
            ["Return date", fmtDate(r.date)],
            ["Vendor bill", billLink ? <>{billLink} dated {fmtDate(row.billDate)}</> : "-"],
            ["Reason", r.reason || "-"],
          ]} />
        </Card>
        {isPosted && balance > 0 && canAdjust ? (
          <Card title="Adjust against vendor bill">
            {open.length === 0 ? (
              <p className="text-sm text-ink-soft">No unpaid bills from this vendor right now. The debit stays on their account and reduces what you owe them.</p>
            ) : (
              <form action={adjustDebitNoteAction} className="grid gap-3">
                <input type="hidden" name="returnId" value={r.id} />
                <Field label="Vendor bill" required>
                  <Select name="purchaseInvoiceId" required defaultValue={preferred ? String(preferred.id) : ""}>
                    {open.map((o) => <option key={o.id} value={o.id}>{o.number} · balance {money(o.outstanding)}</option>)}
                  </Select>
                </Field>
                <Field label="Amount (₹)" required hint={`Up to the debit balance ${money(balance)} or the bill balance, whichever is lower`}>
                  <Input name="amount" type="number" inputMode="decimal" step="0.01" min="0.01" max={balance} defaultValue={preferred ? maxAdjustable(balance, preferred.outstanding) : balance} required />
                </Field>
                <SubmitButton variant="success" pendingText="Adjusting…">Adjust against vendor bill</SubmitButton>
              </form>
            )}
          </Card>
        ) : (
          <Card title="Settlement">
            <p className="text-sm text-ink-soft">
              {isDraft ? "Post the debit note first. Then it can be adjusted against the vendor's bills."
                : balance <= 0 ? "This debit note is fully adjusted." : "Accounts or Purchase can adjust the balance against one of the vendor's bills."}
            </p>
          </Card>
        )}
      </div>

      <Card title={`Lines (${lines.length})`} className="mb-4" bodyClassName="p-0">
        <Table className="rounded-none border-0 shadow-none">
          <thead><tr><Th>#</Th><Th>Item</Th><Th className="text-right">Qty</Th><Th className="text-right">Rate</Th><Th className="text-right">Taxable</Th><Th className="text-right">GST</Th></tr></thead>
          <tbody>
            {lines.map(({ l, name, code, uom }, i) => (
              <tr key={l.id}>
                <Td className="text-ink-soft">{i + 1}</Td>
                <Td className="max-w-80 whitespace-normal">{name}<div className="text-xs text-ink-faint">{code}</div></Td>
                <Td className="text-right tabular-nums">{qty(l.qty)} <span className="text-xs text-ink-soft">{uom}</span></Td>
                <Td className="text-right tabular-nums">{money(l.rate)}</Td>
                <Td className="text-right tabular-nums">{money(l.amount)}</Td>
                <Td className="text-right tabular-nums">{money((Number(l.amount) * Number(l.gstRate)) / 100)} <span className="text-xs text-ink-soft">@{l.gstRate}%</span></Td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><Td colSpan={4} className="text-right font-medium">Totals</Td><Td className="text-right tabular-nums">{money(r.subtotal)}</Td><Td className="whitespace-nowrap text-right font-semibold tabular-nums">{money(r.taxAmount)} · Total {money(r.total)}</Td></tr>
          </tfoot>
        </Table>
      </Card>

      <Card title={`Adjustments (${history.length})`} bodyClassName={history.length ? "p-0" : undefined}>
        {history.length === 0 ? <EmptyState title="Not adjusted yet">Adjustments against vendor bills appear here.</EmptyState> : (
          <Table className="rounded-none border-0 shadow-none">
            <thead><tr><Th>When</Th><Th>Bill</Th><Th>By</Th><Th className="text-right">Amount</Th></tr></thead>
            <tbody>
              {history.map((h, i) => {
                const d = (h.details ?? {}) as { invoiceNo?: string; amount?: number };
                return (
                  <tr key={i}><Td className="whitespace-nowrap">{fmtDateTime(h.at)}</Td><Td>{d.invoiceNo ?? "-"}</Td><Td>{h.userName ?? "-"}</Td><Td className="text-right tabular-nums">{money(Number(d.amount ?? 0))}</Td></tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
