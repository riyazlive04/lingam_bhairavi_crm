import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { FileText, Pencil, Printer } from "lucide-react";
import { getDb } from "@/db";
import {
  auditLog, customers, items, projects, purchaseInvoices, purchaseOrderLines, purchaseOrders, salesOrderLines, salesOrders, users, vendors,
} from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canRead, canWrite } from "@/lib/rbac";
import { fmtDate, fmtDateTime, money, pct, qty, todayIST } from "@/lib/format";
import { PO_STATUS_LABEL, isPoStatus, pendingReceipt, poReceivedPct } from "@/lib/purchase-orders";
import { Card, DL, EmptyState, Field, Flash, Input, LinkButton, PageHeader, Stat, StatusBadge, Table, Td, Th, cx } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { cancelPo, closePo, markPoSent } from "../actions";
import { PoStatusBadge, ReceivedBar, receivedText } from "../_components/po-bits";

export const metadata = { title: "Purchase order" };

export default async function PurchaseOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const user = await requireUser("purchaseOrders");
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const sp = await searchParams;
  const db = await getDb();
  const [row] = await db.select({
    po: purchaseOrders, vendor: vendors, soNumber: salesOrders.number, soCustomerPo: salesOrders.customerPoNumber, customerName: customers.name,
    projectCode: projects.code, projectName: projects.name, createdByName: users.name,
  }).from(purchaseOrders)
    .leftJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
    .leftJoin(salesOrders, eq(salesOrders.id, purchaseOrders.salesOrderId))
    .leftJoin(customers, eq(customers.id, salesOrders.customerId))
    .leftJoin(projects, eq(projects.id, purchaseOrders.projectId))
    .leftJoin(users, eq(users.id, purchaseOrders.createdBy))
    .where(eq(purchaseOrders.id, id));
  if (!row) notFound();
  const { po, vendor } = row;

  const [lines, bills, activity] = await Promise.all([
    db.select({ l: purchaseOrderLines, code: items.code, name: items.name, uom: items.uom, size: items.size, make: items.make, soDesc: salesOrderLines.description, soStatus: salesOrderLines.deliveryStatus })
      .from(purchaseOrderLines).innerJoin(items, eq(items.id, purchaseOrderLines.itemId))
      .leftJoin(salesOrderLines, eq(salesOrderLines.id, purchaseOrderLines.salesOrderLineId))
      .where(eq(purchaseOrderLines.poId, id)).orderBy(asc(purchaseOrderLines.sortOrder), asc(purchaseOrderLines.id)),
    db.select({ id: purchaseInvoices.id, invoiceNo: purchaseInvoices.invoiceNo, invoiceDate: purchaseInvoices.invoiceDate, status: purchaseInvoices.status, total: purchaseInvoices.total })
      .from(purchaseInvoices).where(eq(purchaseInvoices.purchaseOrderId, id)).orderBy(desc(purchaseInvoices.invoiceDate), desc(purchaseInvoices.id)),
    db.select({ id: auditLog.id, at: auditLog.at, action: auditLog.action, details: auditLog.details, userName: users.name }).from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.userId))
      .where(and(eq(auditLog.entityType, "purchase_order"), eq(auditLog.entityId, id))).orderBy(desc(auditLog.at), desc(auditLog.id)).limit(15),
  ]);

  const write = canWrite(user.role, "purchaseOrders");
  const billWrite = canWrite(user.role, "purchases");
  const billRead = canRead(user.role, "purchases");
  const today = todayIST();
  const receivedPct = poReceivedPct(lines.map((x) => x.l));
  const live = po.status === "sent" || po.status === "partial";
  const late = live && po.expectedDate != null && po.expectedDate < today;
  const nothingReceived = lines.every((x) => !(x.l.receivedQty > 0));
  const activeBills = bills.filter((b) => b.status !== "cancelled");
  const draftBills = bills.filter((b) => b.status === "draft");
  const leftToBill = lines.some((x) => pendingReceipt(x.l) > 0);
  const canCancel = write && (po.status === "draft" || po.status === "sent") && nothingReceived && activeBills.length === 0;
  const canClose = write && ["sent", "partial", "received"].includes(po.status);

  return (
    <div className="space-y-6">
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-2">{po.number} <PoStatusBadge status={po.status} /></span>}
        subtitle={<>{vendor ? (canRead(user.role, "vendors") ? <Link href={`/vendors/${vendor.id}`} className="hover:underline">{vendor.name}</Link> : vendor.name) : "Unknown vendor"} · {fmtDate(po.poDate)}</>}
        back={{ href: "/purchase-orders", label: "Purchase orders" }}
        actions={<>
          <LinkButton href={`/purchase-orders/${id}/print`} variant="secondary"><Printer size={16} aria-hidden /> Print</LinkButton>
          {write && po.status === "draft" && <LinkButton href={`/purchase-orders/${id}/edit`} variant="secondary"><Pencil size={16} aria-hidden /> Edit</LinkButton>}
          {write && po.status === "draft" && (
            <form action={markPoSent}><input type="hidden" name="id" value={id} />
              <SubmitButton pendingText="Updating…" confirm="Mark this PO as sent to the vendor? Linked customer order lines will show as ordered.">Mark as sent</SubmitButton>
            </form>
          )}
          {billWrite && live && leftToBill && (
            <LinkButton href={`/purchases/new?po=${id}`}><FileText size={16} aria-hidden /> Create purchase invoice</LinkButton>
          )}
        </>}
      />
      <Flash ok={sp.ok} err={sp.err} />
      {po.status === "draft" && (
        <div role="note" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          This PO is a <strong>draft</strong>. Print it or share it with the vendor, then mark it as sent. Bills can be raised once it is sent.
        </div>
      )}
      {draftBills.length > 0 && (
        <div role="note" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
          {draftBills.length} draft bill{draftBills.length === 1 ? " is" : "s are"} waiting to be posted. Received quantities update when a bill is posted.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="PO value" value={money(po.total)} hint={`${money(po.subtotal)} + GST ${money(po.taxAmount)}`} />
        <Stat label="Received" value={pct(receivedPct, 0)} tone={receivedPct >= 100 ? "good" : receivedPct > 0 ? "warn" : "default"} hint={`${lines.length} line${lines.length === 1 ? "" : "s"}`} />
        <Stat label="Bills" value={activeBills.length} hint={activeBills.length ? money(activeBills.reduce((s, b) => s + b.total, 0)) : "None yet"} />
        <Stat label="Expected delivery" value={po.expectedDate ? fmtDate(po.expectedDate) : "-"} tone={late ? "bad" : "default"} hint={late ? "Overdue, follow up with the vendor" : undefined} />
      </div>

      <Card title={`Lines (${lines.length})`} bodyClassName="p-0">
        {lines.length === 0 ? (
          <div className="p-4"><EmptyState title="No lines on this PO" action={write && po.status === "draft" && <LinkButton href={`/purchase-orders/${id}/edit`}>Add lines</LinkButton>} /></div>
        ) : (
          <Table className="rounded-none border-0 shadow-none">
            <thead><tr><Th>Item</Th><Th className="text-right">Qty</Th><Th>Received</Th><Th className="text-right">Rate</Th><Th className="text-right">GST</Th><Th className="text-right">Amount</Th></tr></thead>
            <tbody>
              {lines.map(({ l, code, name, uom, size, make, soDesc, soStatus }) => {
                const left = pendingReceipt(l);
                const linePct = l.qty > 0 ? (Math.min(l.receivedQty, l.qty) / l.qty) * 100 : 0;
                return (
                  <tr key={l.id}>
                    <Td className="max-w-96 whitespace-normal">
                      <Link href={`/items/${l.itemId}`} className="font-medium hover:underline">{name}</Link>
                      <div className="font-mono text-xs text-ink-faint">{code}{size ? ` · ${size}` : ""}{make ? ` · ${make}` : ""}</div>
                      {l.description && <div className="text-xs text-ink-soft">{l.description}</div>}
                      {soDesc && (
                        <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-blue-700 dark:text-blue-300">
                          For customer line: <span className="line-clamp-1">{soDesc}</span> {soStatus && <StatusBadge status={soStatus} />}
                        </div>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-right tabular-nums">{qty(l.qty)} <span className="text-xs text-ink-faint">{uom}</span></Td>
                    <Td className="whitespace-nowrap">
                      <div className={cx("text-sm tabular-nums", l.receivedQty > l.qty && "text-amber-700 dark:text-amber-400")}>{receivedText(l.receivedQty, l.qty)}</div>
                      <ReceivedBar pct={linePct} className="mt-1" />
                      {left > 0 && po.status !== "draft" && po.status !== "cancelled" && <div className="text-xs text-ink-soft">{qty(left)} to come</div>}
                      {l.receivedQty > l.qty && <div className="text-xs text-amber-700 dark:text-amber-400">More than ordered</div>}
                    </Td>
                    <Td className="text-right tabular-nums">{money(l.rate)}</Td>
                    <Td className="text-right">{pct(l.gstRate, 0)}</Td>
                    <Td className="text-right tabular-nums">{money(l.amount)}</Td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr><Td colSpan={5} className="text-right text-ink-soft">Subtotal</Td><Td className="text-right tabular-nums">{money(po.subtotal)}</Td></tr>
              <tr><Td colSpan={5} className="text-right text-ink-soft">GST</Td><Td className="text-right tabular-nums">{money(po.taxAmount)}</Td></tr>
              <tr><Td colSpan={5} className="text-right font-semibold">Total</Td><Td className="text-right font-semibold tabular-nums">{money(po.total)}</Td></tr>
            </tfoot>
          </Table>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Details" className="lg:col-span-2">
          <DL items={[
            ["Vendor", vendor ? <span>{vendor.name}{vendor.contactPerson ? <span className="text-ink-soft"> · {vendor.contactPerson}</span> : null}</span> : null],
            ["Vendor contact", [vendor?.phone, vendor?.email].filter(Boolean).join(" · ") || null],
            ["Vendor GSTIN", vendor?.gstin ? <span className="font-mono">{vendor.gstin}</span> : null],
            ["Customer order", row.soNumber ? (
              <span>{canRead(user.role, "orders") ? <Link href={`/orders/${po.salesOrderId}`} className="text-brand-700 hover:underline">{row.soNumber}</Link> : row.soNumber}
                {row.customerName ? <span className="text-ink-soft"> · {row.customerName}</span> : null}{row.soCustomerPo ? <span className="text-ink-soft"> (PO {row.soCustomerPo})</span> : null}</span>
            ) : "Not linked"],
            ["Project", row.projectCode ? (canRead(user.role, "projects") ? <Link href={`/projects/${po.projectId}`} className="text-brand-700 hover:underline">{row.projectCode} · {row.projectName}</Link> : `${row.projectCode} · ${row.projectName}`) : "Stock"],
            ["Expected delivery", fmtDate(po.expectedDate)],
            ["Raised by", row.createdByName],
            ["Raised at", fmtDateTime(po.createdAt)],
          ]} />
          {po.notes && <p className="mt-4 whitespace-pre-line rounded-lg bg-muted p-3 text-sm text-ink-soft"><span className="font-medium text-ink">Internal notes: </span>{po.notes}</p>}
          {po.terms && (
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer font-medium text-ink">Terms printed on the PO</summary>
              <p className="mt-2 whitespace-pre-line text-ink-soft">{po.terms}</p>
            </details>
          )}
        </Card>

        <div className="space-y-6">
          <Card title={`Bills (${activeBills.length})`}>
            {bills.length === 0 ? (
              <p className="text-sm text-ink-soft">{live ? "No bills yet. When the vendor's invoice arrives, use “Create purchase invoice”." : "No bills raised against this PO."}</p>
            ) : (
              <ul className="divide-y divide-line text-sm">
                {bills.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0">
                      {billRead ? <Link href={`/purchases/${b.id}`} className="font-medium text-brand-700 hover:underline">{b.invoiceNo}</Link> : <span className="font-medium">{b.invoiceNo}</span>}
                      <span className="block text-xs text-ink-soft">{fmtDate(b.invoiceDate)}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <StatusBadge status={b.status} />
                      <span className="tabular-nums">{money(b.total)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {(canCancel || canClose) && (
            <Card title="Close or cancel">
              <div className="space-y-3">
                {canClose && (
                  <details className="rounded-lg border border-line p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-ink">Close PO</summary>
                    <form action={closePo} className="mt-3 space-y-2">
                      <input type="hidden" name="id" value={id} />
                      <p className="text-xs text-ink-soft">Use this when nothing more will come from the vendor (short supply accepted). Bills already raised stay as they are.</p>
                      <Field label="Reason"><Input name="reason" maxLength={500} placeholder="e.g. balance not required" /></Field>
                      <SubmitButton variant="secondary" size="sm" className="w-full" pendingText="Closing…" confirm="Close this purchase order?">Close PO</SubmitButton>
                    </form>
                  </details>
                )}
                {canCancel && (
                  <details className="rounded-lg border border-line p-3">
                    <summary className="cursor-pointer text-sm font-semibold text-red-700 dark:text-red-400">Cancel PO</summary>
                    <form action={cancelPo} className="mt-3 space-y-2">
                      <input type="hidden" name="id" value={id} />
                      <Field label="Reason"><Input name="reason" maxLength={500} placeholder="e.g. vendor can't supply" /></Field>
                      <SubmitButton variant="danger" size="sm" className="w-full" pendingText="Cancelling…" confirm="Cancel this purchase order? Linked customer order lines go back to pending.">Cancel PO</SubmitButton>
                    </form>
                  </details>
                )}
              </div>
            </Card>
          )}

          {activity.length > 0 && (
            <Card title="Activity">
              <ol className="space-y-2 text-xs text-ink-soft">
                {activity.map((a) => {
                  const d = (a.details && typeof a.details === "object" ? a.details : {}) as Record<string, unknown>;
                  const st = typeof d.status === "string" && isPoStatus(d.status) ? PO_STATUS_LABEL[d.status] : null;
                  const what = a.action === "create" ? "Created" : d.received ? `Goods received on a bill${st ? `, now ${st.toLowerCase()}` : ""}` : st ? `Status: ${st}` : "Updated";
                  return <li key={a.id}><span className="font-medium text-ink">{what}</span> by {a.userName ?? "system"}, {fmtDateTime(a.at)}</li>;
                })}
              </ol>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
