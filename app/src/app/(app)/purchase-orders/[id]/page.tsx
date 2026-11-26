import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { Ban, FileText, Lock, Pencil, Printer, Send } from "lucide-react";
import { getDb } from "@/db";
import {
  auditLog, customers, items, projects, purchaseInvoices, purchaseOrderLines, purchaseOrders, salesOrderLines, salesOrders, users, vendors,
} from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canRead, canWrite } from "@/lib/rbac";
import { fmtDate, fmtDateTime, money, pct, qty, todayIST } from "@/lib/format";
import { PO_STATUS_LABEL, isPoStatus, pendingReceipt, poReceivedPct } from "@/lib/purchase-orders";
import { Field, Flash, Input, LinkButton, Td, cx } from "@/components/ui";
import {
  ActivityFeed, Callout, ConfirmButton, DetailPage, KeyValueGrid, MenuSeparator, MetaChip, ResponsiveTable, SectionCard, StatusPill, SummaryRows,
  type Column, type TimelineItem,
} from "@/components/patterns";
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

  type L = (typeof lines)[number];
  const lineCols: Column<L>[] = [
    {
      key: "item", header: "Item", card: "title", className: "max-w-96 whitespace-normal",
      cell: ({ l, code, name, size, make, soDesc, soStatus }) => (
        <>
          <Link href={`/items/${l.itemId}`} className="font-medium hover:underline">{name}</Link>
          <div className="font-mono text-caption font-normal text-ink-faint">{code}{size ? ` · ${size}` : ""}{make ? ` · ${make}` : ""}</div>
          {l.description && <div className="text-caption font-normal text-ink-soft">{l.description}</div>}
          {soDesc && (
            <div className="mt-0.5 flex flex-wrap items-center gap-1 text-caption font-normal text-info">
              For customer line: <span className="line-clamp-1">{soDesc}</span> {soStatus && <StatusPill status={soStatus} />}
            </div>
          )}
        </>
      ),
    },
    { key: "qty", header: "Qty", align: "right", nowrap: true, cell: ({ l, uom }) => <>{qty(l.qty)} <span className="text-caption text-ink-faint">{uom}</span></> },
    {
      key: "recv", header: "Received", nowrap: true,
      cell: ({ l }) => {
        const left = pendingReceipt(l);
        const linePct = l.qty > 0 ? (Math.min(l.receivedQty, l.qty) / l.qty) * 100 : 0;
        return (
          <div>
            <div className={cx("text-sm tabular-nums", l.receivedQty > l.qty && "text-warning")}>{receivedText(l.receivedQty, l.qty)}</div>
            <ReceivedBar pct={linePct} className="mt-1" />
            {left > 0 && po.status !== "draft" && po.status !== "cancelled" && <div className="text-caption text-ink-soft">{qty(left)} to come</div>}
            {l.receivedQty > l.qty && <div className="text-caption text-warning">More than ordered</div>}
          </div>
        );
      },
    },
    { key: "rate", header: "Rate", align: "right", priority: 3, nowrap: true, cell: ({ l }) => money(l.rate) },
    { key: "gst", header: "GST", align: "right", priority: 3, cell: ({ l }) => pct(l.gstRate, 0) },
    { key: "amount", header: "Amount", align: "right", card: "amount", nowrap: true, cell: ({ l }) => money(l.amount) },
  ];
  type B = (typeof bills)[number];
  const billCols: Column<B>[] = [
    {
      key: "no", header: "Bill", card: "title", nowrap: true,
      cell: (b) => billRead
        ? <Link href={`/purchases/${b.id}`} className="rt-stretch font-medium text-brand-700 hover:underline dark:text-brand-300">{b.invoiceNo}</Link>
        : <span className="font-medium">{b.invoiceNo}</span>,
    },
    { key: "date", header: "Date", card: "subtitle", nowrap: true, cell: (b) => fmtDate(b.invoiceDate) },
    { key: "status", header: "Status", card: "badge", cell: (b) => <StatusPill status={b.status} /> },
    { key: "total", header: "Total", align: "right", card: "amount", nowrap: true, cell: (b) => money(b.total) },
  ];

  const isDraft = write && po.status === "draft";
  const canBill = billWrite && live && leftToBill;
  const primary = isDraft ? (
    <form action={markPoSent}>
      <input type="hidden" name="id" value={id} />
      <SubmitButton pendingText="Updating…" confirm="Mark this PO as sent to the vendor? Linked customer order lines will show as ordered.">
        <Send className="icon-sm" aria-hidden /> Mark as sent
      </SubmitButton>
    </form>
  ) : canBill ? (
    <LinkButton href={`/purchases/new?po=${id}`}><FileText className="icon-sm" aria-hidden /> Create purchase invoice</LinkButton>
  ) : null;
  const secondary = (
    <>
      <LinkButton href={`/purchase-orders/${id}/print`} variant="secondary"><Printer className="icon-sm" aria-hidden /> Print</LinkButton>
      {isDraft && <LinkButton href={`/purchase-orders/${id}/edit`} variant="secondary"><Pencil className="icon-sm" aria-hidden /> Edit</LinkButton>}
    </>
  );
  const more = (canCancel || canClose) ? (
    <>
      {canClose && (
        <form action={closePo} className="space-y-2 p-1">
          <input type="hidden" name="id" value={id} />
          <Field label="Reason for closing" hint="Nothing more will come from the vendor. Bills already raised stay as they are.">
            <Input name="reason" maxLength={500} placeholder="e.g. balance not required" />
          </Field>
          <ConfirmButton variant="ghost" stacked pendingText="Closing…" confirmLabel="Yes, close PO" confirm="Close this purchase order?">
            <Lock className="icon-sm" aria-hidden /> Close PO
          </ConfirmButton>
        </form>
      )}
      {canClose && canCancel && <MenuSeparator />}
      {canCancel && (
        <form action={cancelPo} className="space-y-2 p-1">
          <input type="hidden" name="id" value={id} />
          <Field label="Reason for cancelling"><Input name="reason" maxLength={500} placeholder="e.g. vendor cannot supply" /></Field>
          <ConfirmButton variant="ghost" className="text-danger" confirmVariant="danger" stacked pendingText="Cancelling…" confirmLabel="Yes, cancel PO"
            confirm="Cancel this purchase order? Linked customer order lines go back to pending.">
            <Ban className="icon-sm" aria-hidden /> Cancel PO
          </ConfirmButton>
        </form>
      )}
    </>
  ) : undefined;

  const activityItems: TimelineItem[] = activity.map((a) => {
    const d = (a.details && typeof a.details === "object" ? a.details : {}) as Record<string, unknown>;
    const st = typeof d.status === "string" && isPoStatus(d.status) ? PO_STATUS_LABEL[d.status] : null;
    const what = a.action === "create" ? "Created" : d.received ? `Goods received on a bill${st ? `, now ${st.toLowerCase()}` : ""}` : st ? `Status: ${st}` : "Updated";
    return { id: a.id, title: what, by: a.userName ?? "System", at: fmtDateTime(a.at), status: typeof d.status === "string" ? d.status : undefined };
  });

  return (
    <DetailPage
      back={{ href: "/purchase-orders", label: "Purchase orders" }}
      eyebrow="Purchase order"
      title={po.number}
      status={<PoStatusBadge status={po.status} />}
      meta={
        <>
          <MetaChip label="Vendor" href={vendor && canRead(user.role, "vendors") ? `/vendors/${vendor.id}` : undefined}>{vendor ? vendor.name : "Unknown vendor"}</MetaChip>
          <MetaChip label="Date">{fmtDate(po.poDate)}</MetaChip>
          {row.soNumber && <MetaChip label="Customer order">{row.soNumber}</MetaChip>}
          <MetaChip label="Value">{money(po.total)}</MetaChip>
        </>
      }
      primaryAction={primary}
      secondaryActions={secondary}
      moreActions={more}
      notices={
        <>
          <Flash ok={sp.ok} err={sp.err} />
          {po.status === "draft" && (
            <Callout tone="warning" title="This PO is a draft">
              Print it or share it with the vendor, then mark it as sent. Bills can be raised once it is sent.
            </Callout>
          )}
          {draftBills.length > 0 && (
            <Callout tone="info">
              {draftBills.length} draft bill{draftBills.length === 1 ? " is" : "s are"} waiting to be posted. Received quantities update when a bill is posted.
            </Callout>
          )}
          {late && (
            <Callout tone="danger" title="Delivery is overdue">
              The expected date was {fmtDate(po.expectedDate)}. Follow up with the vendor.
            </Callout>
          )}
        </>
      }
      aside={
        <>
          <SectionCard title="Summary">
            <SummaryRows rows={[
              ["Subtotal", money(po.subtotal)],
              ["GST", money(po.taxAmount)],
              ["PO value", <strong key="t">{money(po.total)}</strong>],
              ["Received", <span key="r" className={cx(receivedPct >= 100 ? "text-success" : receivedPct > 0 && "text-warning")}>{pct(receivedPct, 0)}</span>],
              ["Bills", activeBills.length ? `${activeBills.length} · ${money(activeBills.reduce((s, b) => s + b.total, 0))}` : "None yet"],
              ["Expected delivery", <span key="e" className={cx(late && "text-danger")}>{po.expectedDate ? fmtDate(po.expectedDate) : "-"}</span>],
            ]} />
          </SectionCard>
          <SectionCard title="Activity">
            <ActivityFeed items={activityItems} />
          </SectionCard>
        </>
      }
    >
      <SectionCard title="Lines" count={lines.length} flush
        actions={isDraft && lines.length === 0 ? <LinkButton href={`/purchase-orders/${id}/edit`} size="sm" variant="secondary">Add lines</LinkButton> : undefined}
        empty={lines.length === 0 && "No lines on this PO yet. Edit the draft to add items."}>
        <ResponsiveTable flush rows={lines} columns={lineCols} rowKey={(x) => x.l.id} caption="PO lines"
          footer={
            <>
              <tr><Td colSpan={5} className="text-right text-ink-soft">Subtotal</Td><Td className="text-right tabular-nums">{money(po.subtotal)}</Td></tr>
              <tr><Td colSpan={5} className="text-right text-ink-soft">GST</Td><Td className="text-right tabular-nums">{money(po.taxAmount)}</Td></tr>
              <tr><Td colSpan={5} className="text-right font-semibold">Total</Td><Td className="text-right font-semibold tabular-nums">{money(po.total)}</Td></tr>
            </>
          } />
      </SectionCard>

      <SectionCard title="Bills" count={bills.length} icon={FileText} flush
        empty={bills.length === 0 && (live ? "No bills yet. When the vendor's invoice arrives, use Create purchase invoice." : "No bills raised against this PO.")}>
        <ResponsiveTable flush rows={bills} columns={billCols} rowKey={(b) => b.id} caption="Bills" />
      </SectionCard>

      <SectionCard title="Details">
        <KeyValueGrid items={[
          { label: "Vendor", value: vendor ? <span>{vendor.name}{vendor.contactPerson ? <span className="text-ink-soft"> · {vendor.contactPerson}</span> : null}</span> : null },
          { label: "Vendor contact", value: [vendor?.phone, vendor?.email].filter(Boolean).join(" · ") || null },
          { label: "Vendor GSTIN", value: vendor?.gstin ? <span className="font-mono">{vendor.gstin}</span> : null },
          {
            label: "Customer order", value: row.soNumber ? (
              <span>{canRead(user.role, "orders") ? <Link href={`/orders/${po.salesOrderId}`} className="text-brand-700 hover:underline dark:text-brand-300">{row.soNumber}</Link> : row.soNumber}
                {row.customerName ? <span className="text-ink-soft"> · {row.customerName}</span> : null}{row.soCustomerPo ? <span className="text-ink-soft"> (PO {row.soCustomerPo})</span> : null}</span>
            ) : "Not linked",
          },
          {
            label: "Project", value: row.projectCode
              ? (canRead(user.role, "projects") ? <Link href={`/projects/${po.projectId}`} className="text-brand-700 hover:underline dark:text-brand-300">{row.projectCode} · {row.projectName}</Link> : `${row.projectCode} · ${row.projectName}`)
              : "Stock",
          },
          { label: "Expected delivery", value: fmtDate(po.expectedDate) },
          { label: "Raised by", value: row.createdByName },
          { label: "Raised at", value: fmtDateTime(po.createdAt) },
          ...(po.notes ? [{ label: "Internal notes", value: <span className="whitespace-pre-line font-normal text-ink-soft">{po.notes}</span>, wide: true }] : []),
          ...(po.terms ? [{ label: "Terms printed on the PO", value: <span className="whitespace-pre-line font-normal text-ink-soft">{po.terms}</span>, wide: true }] : []),
        ]} />
      </SectionCard>
    </DetailPage>
  );
}
