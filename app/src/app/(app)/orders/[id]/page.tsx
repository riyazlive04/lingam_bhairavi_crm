import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { Ban, FileText, Lock, RotateCcw, Truck, Undo2, Wallet } from "lucide-react";
import { getDb } from "@/db";
import { customers, deliveries, deliveryLines, items, projects, quotations, salesInvoices, salesOrderLines, salesOrders } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canRead, canSeeCost, canWrite } from "@/lib/rbac";
import { fmtDate, money, money0, qty, todayIST } from "@/lib/format";
import { LINE_STATUS_LABEL, MANUAL_LINE_STATUSES, OPEN_ORDER_STATUSES, netDeliveredQty, pendingQtyOf } from "@/lib/orders";
import { noteBalance, reasonLabel, returnsForOrder } from "@/lib/returns";
import { customerAdvances, receiptNumber } from "@/lib/billing";
import { Field, Flash, Input, LinkButton, Select, Textarea, cx } from "@/components/ui";
import {
  Callout, ConfirmButton, DetailPage, KeyValueGrid, MetaChip, ProgressBar, ResponsiveTable, SectionCard, StatusPill, SummaryRows, Tabs, activeTab, tabHref,
  type Column, type TabItem,
} from "@/components/patterns";
import { SubmitButton } from "@/components/submit-button";
import { changeOrderStatus, recordDelivery, updateOrderLine } from "../actions";
import { CreateVendorPoButton } from "../../purchase-orders/_components/create-po-button";
import { LinkedPosCard } from "../../purchase-orders/_components/linked-pos-card";
import { OrderPnlCard } from "../../reports/_components/order-pnl-card";

/**
 * REFERENCE DETAIL PAGE (design system v2). Module teams copy this structure:
 * DetailPage > meta chips, primary / secondary / more actions (ConfirmButton for destructive ones),
 * Callout notices, Tabs (?tab=), SectionCard + ResponsiveTable per tab, summary aside.
 */
export const metadata = { title: "Customer order" };

type Line = typeof salesOrderLines.$inferSelect & { itemCode: string | null };

function effectiveExpected(l: Line, orderExpected: string | null) {
  return l.expectedDate ?? orderExpected;
}

/** Quick per-line status / expected date / remarks form. */
function LineUpdateForm({ orderId, line }: { orderId: number; line: Line }) {
  const current = (MANUAL_LINE_STATUSES as readonly string[]).includes(line.deliveryStatus) ? line.deliveryStatus : "pending";
  return (
    <details className="group">
      <summary className="cursor-pointer select-none rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-muted dark:text-brand-300">Update</summary>
      <form action={updateOrderLine} className="mt-2 grid w-64 gap-2 rounded-lg border border-line bg-surface p-3 shadow-sm">
        <input type="hidden" name="orderId" value={orderId} />
        <input type="hidden" name="lineId" value={line.id} />
        <Field label="Status">
          <Select name="status" defaultValue={current}>
            {MANUAL_LINE_STATUSES.map((s) => <option key={s} value={s}>{LINE_STATUS_LABEL[s]}</option>)}
          </Select>
        </Field>
        <Field label="Expected date" hint="Required for in-transit items">
          <Input type="date" name="expectedDate" defaultValue={line.expectedDate ?? ""} />
        </Field>
        <Field label="Remarks">
          <Textarea name="remarks" defaultValue={line.remarks ?? ""} maxLength={1000} className="min-h-14" placeholder="e.g. Vendor dispatch on 25th, LR no…" />
        </Field>
        <SubmitButton size="sm">Save line</SubmitButton>
      </form>
    </details>
  );
}

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string; tab?: string }> }) {
  const user = await requireUser("orders");
  const { id } = await params;
  const sp = await searchParams;
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId <= 0) notFound();
  const db = await getDb();
  const today = todayIST();

  const [order] = await db
    .select({
      o: salesOrders, customerName: customers.name, customerPhone: customers.phone, projectName: projects.name, projectCode: projects.code,
      quotationNumber: quotations.number,
    })
    .from(salesOrders)
    .leftJoin(customers, eq(customers.id, salesOrders.customerId))
    .leftJoin(projects, eq(projects.id, salesOrders.projectId))
    .leftJoin(quotations, eq(quotations.id, salesOrders.quotationId))
    .where(eq(salesOrders.id, orderId));
  if (!order) notFound();
  const o = order.o;

  const lineRows = await db.select({ l: salesOrderLines, itemCode: items.code }).from(salesOrderLines)
    .leftJoin(items, eq(items.id, salesOrderLines.itemId))
    .where(eq(salesOrderLines.orderId, orderId)).orderBy(asc(salesOrderLines.sortOrder), asc(salesOrderLines.id));
  const lines: Line[] = lineRows.map((r) => ({ ...r.l, itemCode: r.itemCode }));

  const dels = await db.select().from(deliveries).where(eq(deliveries.orderId, orderId)).orderBy(desc(deliveries.date), desc(deliveries.id));
  const delCounts = dels.length
    ? await db.select({ deliveryId: deliveryLines.deliveryId, n: sql<number>`count(*)`.mapWith(Number), q: sql<number>`coalesce(sum(${deliveryLines.qty}),0)`.mapWith(Number) })
      .from(deliveryLines).where(inArray(deliveryLines.deliveryId, dels.map((d) => d.id))).groupBy(deliveryLines.deliveryId)
    : [];
  const invs = await db.select({ id: salesInvoices.id, number: salesInvoices.number, invoiceDate: salesInvoices.invoiceDate, total: salesInvoices.total, paidAmount: salesInvoices.paidAmount, status: salesInvoices.status })
    .from(salesInvoices).where(eq(salesInvoices.orderId, orderId)).orderBy(desc(salesInvoices.invoiceDate));

  const active = lines.filter((l) => l.deliveryStatus !== "cancelled");
  const deliveredLines = active.filter((l) => l.deliveryStatus === "delivered").length;
  // rule 13: returned goods no longer count as delivered
  const pendingLines = active.filter((l) => pendingQtyOf(l) > 1e-6);
  const overdue = pendingLines.filter((l) => { const e = effectiveExpected(l, o.expectedDelivery); return e && e < today; });
  const isOpen = (OPEN_ORDER_STATUSES as readonly string[]).includes(o.status);
  const write = canWrite(user.role, "orders");
  const billingWrite = canWrite(user.role, "billing");
  const uninvoiced = active.some((l) => netDeliveredQty(l.deliveredQty, l.returnedQty) > Number(l.invoicedQty) + 1e-6);
  const delivTotalQty = new Map(delCounts.map((d) => [d.deliveryId, d]));
  const returnsRead = canRead(user.role, "returns");
  const returnsWrite = canWrite(user.role, "returns");
  const billingRead = canRead(user.role, "billing");
  const [creditNotes, advances] = await Promise.all([
    returnsRead ? returnsForOrder(db, orderId) : Promise.resolve([]),
    billingRead ? customerAdvances(db, { orderId }) : Promise.resolve([]),
  ]);
  const canReturn = o.status !== "cancelled" && lines.some((l) => netDeliveredQty(l.deliveredQty, l.returnedQty) > 1e-6);
  const anyReturned = lines.some((l) => Number(l.returnedQty) > 1e-6);
  const poWrite = canWrite(user.role, "purchaseOrders");
  const showPurchasing = canRead(user.role, "purchaseOrders") || canSeeCost(user.role);
  const canDeliver = write && isOpen && pendingLines.length > 0;
  const canInvoice = billingWrite && o.status !== "cancelled";

  // ------------------------------------------------------------------ tabs (?tab=)
  const tabIds = ["lines", "deliveries", ...(billingRead ? ["billing" as const] : []), ...(returnsRead ? ["returns" as const] : []),
    ...(showPurchasing ? ["purchasing" as const] : [])] as const;
  const tab = activeTab(sp.tab, tabIds);
  const tabItems: TabItem[] = [
    { id: "lines", label: "Lines", count: lines.length, alert: isOpen && overdue.length > 0 },
    { id: "deliveries", label: "Deliveries", count: dels.length },
    ...(billingRead ? [{ id: "billing", label: "Invoices & advances", count: invs.length + advances.length }] : []),
    ...(returnsRead ? [{ id: "returns", label: "Returns", count: creditNotes.length }] : []),
    ...(showPurchasing ? [{ id: "purchasing", label: "Vendor POs & profit" }] : []),
  ];
  const base = `/orders/${o.id}`;
  const tabParams = { tab: sp.tab };

  // ------------------------------------------------------------------ table columns
  const lineCols: Column<Line>[] = [
    { key: "n", header: "#", card: "hidden", className: "text-ink-soft", cell: (_l, i) => i + 1 },
    { key: "item", header: "Item", card: "title", className: "max-w-72 whitespace-normal",
      cell: (l) => <>{l.description}{l.itemCode && <div className="text-caption font-normal text-ink-faint">{l.itemCode}</div>}</> },
    { key: "ordered", header: "Ordered", align: "right", nowrap: true, cell: (l) => <>{qty(l.qty)} <span className="text-caption text-ink-soft">{l.uom}</span></> },
    { key: "delivered", header: "Delivered", align: "right", cell: (l) => qty(l.deliveredQty) },
    ...(anyReturned ? [{ key: "returned", header: "Returned", align: "right" as const,
      cell: (l: Line) => Number(l.returnedQty) > 0 ? <span className="text-danger">{qty(l.returnedQty)}</span> : "-" }] : []),
    { key: "invoiced", header: "Invoiced", align: "right", priority: 3, cell: (l) => qty(l.invoicedQty) },
    { key: "pending", header: "Pending", align: "right", card: "amount",
      cell: (l) => {
        if (l.deliveryStatus === "cancelled") return "-";
        const pend = pendingQtyOf(l);
        return <span className={cx("font-medium", pend > 0 && "text-warning")}>{qty(pend)}<span className="sm:hidden"> pending</span></span>;
      } },
    { key: "rate", header: "Rate", align: "right", priority: 3, nowrap: true, cell: (l) => money(l.rate) },
    { key: "status", header: "Status", card: "badge", cell: (l) => <StatusPill status={l.deliveryStatus} label={LINE_STATUS_LABEL[l.deliveryStatus]} /> },
    { key: "expected", header: "Expected", nowrap: true,
      cell: (l) => {
        const exp = effectiveExpected(l, o.expectedDelivery);
        const late = isOpen && l.deliveryStatus !== "delivered" && l.deliveryStatus !== "cancelled" && exp && exp < today;
        return (
          <span className="inline-flex flex-col items-end sm:items-start">
            <span>{fmtDate(exp)}</span>
            {late && <StatusPill status="late" label="Late" />}
            {!l.expectedDate && exp && <span className="text-caption text-ink-faint">Order default</span>}
          </span>
        );
      } },
    { key: "remarks", header: "Remarks", priority: 3, className: "max-w-56 whitespace-normal text-ink-soft", cell: (l) => l.remarks || "-" },
    ...(write && isOpen ? [{ key: "actions", header: <span className="sr-only">Actions</span>, label: "Actions", card: "actions" as const,
      cell: (l: Line) => l.deliveryStatus !== "delivered" ? <LineUpdateForm orderId={o.id} line={l} /> : null }] : []),
  ];
  type Del = (typeof dels)[number];
  const delCols: Column<Del>[] = [
    { key: "no", header: "Challan", card: "title", nowrap: true,
      cell: (d) => <Link href={`/orders/${o.id}/challan/${d.id}`} className="rt-stretch font-medium text-brand-700 hover:underline dark:text-brand-300">{d.number}</Link> },
    { key: "date", header: "Date", card: "subtitle", nowrap: true, cell: (d) => fmtDate(d.date) },
    { key: "vehicle", header: "Vehicle", cell: (d) => d.vehicleNo || "-" },
    { key: "by", header: "Received by", cell: (d) => d.receivedBy || "-" },
    { key: "lines", header: "Lines", align: "right", card: "amount", cell: (d) => delivTotalQty.get(d.id)?.n ?? 0 },
  ];
  type Inv = (typeof invs)[number];
  const invCols: Column<Inv>[] = [
    { key: "no", header: "Invoice", card: "title", nowrap: true,
      cell: (v) => billingRead ? <Link href={`/billing/invoices/${v.id}`} className="rt-stretch font-medium text-brand-700 hover:underline dark:text-brand-300">{v.number}</Link> : v.number },
    { key: "date", header: "Date", card: "subtitle", nowrap: true, cell: (v) => fmtDate(v.invoiceDate) },
    { key: "total", header: "Total", align: "right", card: "amount", nowrap: true, cell: (v) => money0(v.total) },
    { key: "status", header: "Status", card: "badge", cell: (v) => <StatusPill status={v.status} /> },
  ];
  type Cn = (typeof creditNotes)[number];
  const cnCols: Column<Cn>[] = [
    { key: "no", header: "Credit note", card: "title", nowrap: true,
      cell: (r) => <Link href={`/returns/${r.id}`} className="rt-stretch font-medium text-brand-700 hover:underline dark:text-brand-300">{r.status === "draft" ? "Draft" : r.number}</Link> },
    { key: "date", header: "Date", card: "subtitle", nowrap: true, cell: (r) => fmtDate(r.date) },
    { key: "reason", header: "Reason", cell: (r) => reasonLabel(r.reason) },
    { key: "total", header: "Total", align: "right", card: "amount", nowrap: true,
      cell: (r) => <>{money0(r.total)}{r.status === "posted" && noteBalance(r.total, r.adjustedAmount) > 0.005 && <div className="text-caption font-normal text-ink-soft">{money0(noteBalance(r.total, r.adjustedAmount))} unadjusted</div>}</> },
    { key: "status", header: "Status", card: "badge", cell: (r) => <StatusPill status={r.status} /> },
  ];
  type Adv = (typeof advances)[number];
  const advCols: Column<Adv>[] = [
    { key: "no", header: "Receipt", card: "title", nowrap: true,
      cell: (a) => <Link href={`/billing/receipts/${a.id}`} className="rt-stretch font-medium text-brand-700 hover:underline dark:text-brand-300">{receiptNumber(a)}</Link> },
    { key: "date", header: "Date", card: "subtitle", nowrap: true, cell: (a) => fmtDate(a.date) },
    { key: "amount", header: "Amount", align: "right", card: "amount", nowrap: true, cell: (a) => money0(a.amount) },
    { key: "open", header: "Not yet applied", align: "right", nowrap: true, cell: (a) => a.balance > 0.005 ? money0(a.balance) : "-" },
  ];

  // ------------------------------------------------------------------ actions
  const invoiceBtn = (variant: "primary" | "secondary") => (
    <LinkButton href={`/billing/invoices/new?orderId=${o.id}`} variant={variant}>
      <FileText className="icon-sm" aria-hidden /> Create invoice
    </LinkButton>
  );
  // The most likely next step: bill what was delivered, otherwise deliver what is pending.
  const primary = canInvoice && uninvoiced
    ? invoiceBtn("primary")
    : canDeliver
      ? <LinkButton href={`${base}#record-delivery`}><Truck className="icon-sm" aria-hidden /> Record delivery</LinkButton>
      : null;
  const secondary = (
    <>
      {canInvoice && !uninvoiced && invoiceBtn("secondary")}
      {billingWrite && o.status !== "cancelled" && o.status !== "closed" && (
        <LinkButton href={`/billing/advances?orderId=${o.id}&from=order`} variant="secondary">
          <Wallet className="icon-sm" aria-hidden /> Record advance
        </LinkButton>
      )}
      {poWrite && isOpen && pendingLines.length > 0 && <CreateVendorPoButton salesOrderId={o.id} />}
      {returnsWrite && canReturn && (
        <LinkButton href={`/returns/new?orderId=${o.id}`} variant="secondary">
          <Undo2 className="icon-sm" aria-hidden /> Record return
        </LinkButton>
      )}
    </>
  );
  const hasSecondary = (canInvoice && !uninvoiced) || (billingWrite && o.status !== "cancelled" && o.status !== "closed")
    || (poWrite && isOpen && pendingLines.length > 0) || (returnsWrite && canReturn);
  const more = write && (
    <>
      {isOpen && (
        <form action={changeOrderStatus}>
          <input type="hidden" name="orderId" value={o.id} />
          <input type="hidden" name="op" value="close" />
          <ConfirmButton variant="ghost" stacked pendingText="Closing…" confirmLabel="Yes, close order"
            confirm={pendingLines.length ? `${pendingLines.length} line(s) are still pending. Close anyway? Pending lines will no longer be tracked.` : "Close this order?"}>
            <Lock className="icon-sm" aria-hidden /> Close order
          </ConfirmButton>
        </form>
      )}
      {isOpen && dels.length === 0 && (
        <form action={changeOrderStatus}>
          <input type="hidden" name="orderId" value={o.id} />
          <input type="hidden" name="op" value="cancel" />
          <ConfirmButton variant="ghost" className="text-danger" confirmVariant="danger" stacked pendingText="Cancelling…" confirmLabel="Yes, cancel order"
            confirm="Cancel this order? It cannot be used for deliveries afterwards.">
            <Ban className="icon-sm" aria-hidden /> Cancel order
          </ConfirmButton>
        </form>
      )}
      {(o.status === "closed" || o.status === "cancelled") && (
        <form action={changeOrderStatus}>
          <input type="hidden" name="orderId" value={o.id} />
          <input type="hidden" name="op" value="reopen" />
          <SubmitButton variant="ghost" pendingText="Reopening…"><RotateCcw className="icon-sm" aria-hidden /> Reopen order</SubmitButton>
        </form>
      )}
    </>
  );
  const hasMore = write && (isOpen || o.status === "closed" || o.status === "cancelled");

  return (
    <DetailPage
      back={{ href: "/orders", label: "Orders" }}
      eyebrow="Customer order"
      title={o.number}
      status={<StatusPill status={o.status} />}
      meta={
        <>
          <MetaChip label="Customer">{order.customerName ?? "-"}</MetaChip>
          {o.customerPoNumber && <MetaChip label="PO">{o.customerPoNumber}</MetaChip>}
          {order.projectName && <MetaChip label="Project">{order.projectName}</MetaChip>}
          <MetaChip label="Expected">{fmtDate(o.expectedDelivery)}</MetaChip>
          <MetaChip label="Value">{money0(o.total)}</MetaChip>
        </>
      }
      primaryAction={primary}
      secondaryActions={hasSecondary ? secondary : undefined}
      moreActions={hasMore ? more : undefined}
      notices={
        <>
          <Flash ok={sp.ok} err={sp.err} />
          {isOpen && overdue.length > 0 && (
            <Callout tone="danger" title={`${overdue.length} line${overdue.length === 1 ? " is" : "s are"} overdue`}
              action={tab !== "lines" && <LinkButton href={tabHref(base, tabParams, "lines", "lines")} variant="secondary" size="sm">Show lines</LinkButton>}>
              The expected date has passed and the item has not been delivered yet. Update the status or expected date, or record the delivery.
            </Callout>
          )}
        </>
      }
      tabs={<Tabs label="Order sections" basePath={base} params={tabParams} active={tab} items={tabItems} />}
      aside={
        <>
          <SectionCard title="Delivery progress" icon={Truck}>
            <ProgressBar value={deliveredLines} max={active.length} label={`${deliveredLines} of ${active.length} lines delivered`} caption={`${deliveredLines}/${active.length} lines`} />
            <SummaryRows className="mt-4" rows={[
              ["Pending lines", pendingLines.length],
              ["Overdue lines", <span key="o" className={cx(overdue.length > 0 && "text-danger")}>{overdue.length}</span>],
              ["Challans", dels.length],
              ["Invoices", invs.filter((i) => i.status !== "cancelled").length],
            ]} />
          </SectionCard>
          <SectionCard title="Order details">
            <KeyValueGrid columns={1} items={[
              { label: "Customer", value: order.customerName },
              { label: "Customer PO", value: o.customerPoNumber ? `${o.customerPoNumber}${o.customerPoDate ? ` dated ${fmtDate(o.customerPoDate)}` : ""}` : null },
              { label: "Order date", value: fmtDate(o.orderDate) },
              { label: "Expected delivery", value: fmtDate(o.expectedDelivery) },
              { label: "Project", value: order.projectName ? `${order.projectCode} · ${order.projectName}` : null },
              { label: "Quotation", value: order.quotationNumber && o.quotationId ? (canRead(user.role, "quotations") ? <Link className="text-brand-700 hover:underline dark:text-brand-300" href={`/quotations/${o.quotationId}`}>{order.quotationNumber}</Link> : order.quotationNumber) : null },
              { label: "Order value (ex-GST)", value: money(o.total) },
              { label: "Notes", value: o.notes },
            ]} />
          </SectionCard>
        </>
      }
    >
      {tab === "lines" && (
        <>
          <SectionCard title="Order lines" count={lines.length} flush>
            <ResponsiveTable flush rows={lines} columns={lineCols} rowKey={(l) => l.id} rowId={(l) => `line-${l.id}`} caption="Order lines"
              rowClassName={(l) => {
                const exp = effectiveExpected(l, o.expectedDelivery);
                const late = isOpen && l.deliveryStatus !== "delivered" && l.deliveryStatus !== "cancelled" && exp && exp < today;
                return cx("scroll-mt-36 target:bg-warning-soft", late && "bg-danger-soft", l.deliveryStatus === "cancelled" && "opacity-60");
              }} />
          </SectionCard>

          {canDeliver && (
            <SectionCard id="record-delivery" title="Record delivery (challan)" icon={Truck} description="Defaults to the full pending quantity. Set 0 to skip a line.">
              <form action={recordDelivery} className="space-y-4">
                <input type="hidden" name="orderId" value={o.id} />
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Field label="Challan date" required><Input type="date" name="date" required defaultValue={today} max={today} /></Field>
                  <Field label="Vehicle no."><Input name="vehicleNo" maxLength={30} placeholder="TN 70 AB 1234" autoCapitalize="characters" /></Field>
                  <Field label="Received by"><Input name="receivedBy" maxLength={120} placeholder="Name at site" /></Field>
                  <Field label="Notes"><Input name="notes" maxLength={2000} /></Field>
                </div>
                <fieldset>
                  <legend className="mb-2 text-sm font-medium text-ink">Quantity delivered now</legend>
                  <ul className="divide-y divide-line rounded-xl border border-line">
                    {pendingLines.map((l) => {
                      const pend = pendingQtyOf(l);
                      return (
                        <li key={l.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                          <label htmlFor={`qty_${l.id}`} className="min-w-0 text-sm">
                            <span className="block font-medium text-ink">{l.description}</span>
                            <span className="text-caption text-ink-soft">Pending {qty(pend)} {l.uom} of {qty(l.qty)} · {LINE_STATUS_LABEL[l.deliveryStatus]}{Number(l.returnedQty) > 0 ? ` · ${qty(l.returnedQty)} returned, replacement due` : ""}</span>
                          </label>
                          <div className="flex items-center gap-2">
                            <Input id={`qty_${l.id}`} name={`qty_${l.id}`} type="number" inputMode="decimal" step="any" min={0} max={pend} defaultValue={pend} className="w-28 text-right" />
                            <span className="w-10 text-caption text-ink-soft">{l.uom}</span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
                <div className="flex justify-end">
                  <SubmitButton pendingText="Recording…" className="max-sm:w-full">Record delivery</SubmitButton>
                </div>
              </form>
            </SectionCard>
          )}
        </>
      )}

      {tab === "deliveries" && (
        <SectionCard title="Deliveries" count={dels.length} icon={Truck} flush
          empty={dels.length === 0 && (canDeliver ? "No deliveries yet. Record a challan from the Lines tab when material leaves for the site." : "No deliveries yet.")}>
          <ResponsiveTable flush rows={dels} columns={delCols} rowKey={(d) => d.id} caption="Deliveries" />
        </SectionCard>
      )}

      {tab === "billing" && billingRead && (
        <>
          <SectionCard title="Invoices" count={invs.length} icon={FileText} flush
            empty={invs.length === 0 && (canInvoice ? "Not invoiced yet. Use “Create invoice” to bill delivered quantities." : "Not invoiced yet. Accounts will raise the invoice.")}>
            <ResponsiveTable flush rows={invs} columns={invCols} rowKey={(v) => v.id} caption="Invoices" />
          </SectionCard>
          <SectionCard title="Advances received" count={advances.length} icon={Wallet} flush
            empty={advances.length === 0 && (billingWrite && o.status !== "cancelled" ? "No advance recorded. If the customer paid an advance against this PO, use “Record advance”." : "Advances against this order appear here.")}>
            <ResponsiveTable flush rows={advances} columns={advCols} rowKey={(a) => a.id} caption="Advances" />
          </SectionCard>
        </>
      )}

      {tab === "returns" && returnsRead && (
        <SectionCard title="Credit notes" count={creditNotes.length} icon={Undo2} flush
          empty={creditNotes.length === 0 && (returnsWrite && canReturn ? "No returns on this order. If the customer sends material back, use “Record return”." : "Customer returns against this order appear here.")}>
          <ResponsiveTable flush rows={creditNotes} columns={cnCols} rowKey={(r) => r.id} caption="Credit notes" />
        </SectionCard>
      )}

      {tab === "purchasing" && showPurchasing && (
        <div className="grid gap-4 empty:hidden xl:grid-cols-2">
          <OrderPnlCard orderId={o.id} />
          <LinkedPosCard role={user.role} salesOrderId={o.id} />
        </div>
      )}
    </DetailPage>
  );
}
