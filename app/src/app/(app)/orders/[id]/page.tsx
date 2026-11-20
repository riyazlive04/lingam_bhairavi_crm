import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { AlertTriangle, FileText, Truck } from "lucide-react";
import { getDb } from "@/db";
import { customers, deliveries, deliveryLines, items, projects, quotations, salesInvoices, salesOrderLines, salesOrders } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canRead, canWrite } from "@/lib/rbac";
import { fmtDate, money, money0, qty, round2, todayIST } from "@/lib/format";
import { LINE_STATUS_LABEL, MANUAL_LINE_STATUSES, OPEN_ORDER_STATUSES } from "@/lib/orders";
import { Badge, Card, DL, EmptyState, Field, Flash, Input, LinkButton, PageHeader, Select, StatusBadge, Table, Td, Th, Textarea, cx } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { changeOrderStatus, recordDelivery, updateOrderLine } from "../actions";
import { LineProgress } from "../_components/progress";

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

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
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
  const pendingLines = active.filter((l) => Number(l.deliveredQty) < Number(l.qty) - 1e-6);
  const overdue = pendingLines.filter((l) => { const e = effectiveExpected(l, o.expectedDelivery); return e && e < today; });
  const isOpen = (OPEN_ORDER_STATUSES as readonly string[]).includes(o.status);
  const write = canWrite(user.role, "orders");
  const billingWrite = canWrite(user.role, "billing");
  const uninvoiced = active.some((l) => Number(l.deliveredQty) > Number(l.invoicedQty) + 1e-6);
  const delivTotalQty = new Map(delCounts.map((d) => [d.deliveryId, d]));

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-2">{o.number} <StatusBadge status={o.status} /></span>}
        subtitle={<>{order.customerName ?? "—"}{o.customerPoNumber ? ` · PO ${o.customerPoNumber}` : ""}{order.projectName ? ` · ${order.projectName}` : ""}</>}
        back={{ href: "/orders", label: "Orders" }}
        actions={
          <>
            {billingWrite && o.status !== "cancelled" && (
              <LinkButton href={`/billing/invoices/new?orderId=${o.id}`} variant={uninvoiced ? "primary" : "secondary"}>
                <FileText className="h-4 w-4" aria-hidden /> Create invoice
              </LinkButton>
            )}
            {write && isOpen && (
              <form action={changeOrderStatus}>
                <input type="hidden" name="orderId" value={o.id} />
                <input type="hidden" name="op" value="close" />
                <SubmitButton variant="secondary" pendingText="Closing…"
                  confirm={pendingLines.length ? `${pendingLines.length} line(s) are still pending. Close the order anyway? Pending lines will no longer be tracked.` : "Close this order?"}>
                  Close order
                </SubmitButton>
              </form>
            )}
            {write && isOpen && dels.length === 0 && (
              <form action={changeOrderStatus}>
                <input type="hidden" name="orderId" value={o.id} />
                <input type="hidden" name="op" value="cancel" />
                <SubmitButton variant="danger" pendingText="Cancelling…" confirm="Cancel this order? This cannot be used for deliveries afterwards.">Cancel</SubmitButton>
              </form>
            )}
            {write && (o.status === "closed" || o.status === "cancelled") && (
              <form action={changeOrderStatus}>
                <input type="hidden" name="orderId" value={o.id} />
                <input type="hidden" name="op" value="reopen" />
                <SubmitButton variant="secondary" pendingText="Reopening…">Reopen</SubmitButton>
              </form>
            )}
          </>
        }
      />
      <Flash ok={sp.ok} err={sp.err} />

      {isOpen && overdue.length > 0 && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span><strong>{overdue.length} line{overdue.length === 1 ? " is" : "s are"} overdue</strong> — expected date has passed and the item is not yet delivered. Update the status / expected date or record the delivery.</span>
        </div>
      )}

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card title="Order details" className="lg:col-span-2">
          <DL items={[
            ["Customer", order.customerName ?? "—"],
            ["Customer PO", o.customerPoNumber ? `${o.customerPoNumber}${o.customerPoDate ? ` dated ${fmtDate(o.customerPoDate)}` : ""}` : "—"],
            ["Order date", fmtDate(o.orderDate)],
            ["Expected delivery", fmtDate(o.expectedDelivery)],
            ["Project", order.projectName ? `${order.projectCode} · ${order.projectName}` : "—"],
            ["Quotation", order.quotationNumber && o.quotationId ? <Link className="text-brand-700 hover:underline dark:text-brand-300" href={`/quotations/${o.quotationId}`}>{order.quotationNumber}</Link> : "—"],
            ["Order value (ex-GST)", money(o.total)],
            ["Notes", o.notes || "—"],
          ]} />
        </Card>
        <Card title="Delivery progress">
          <LineProgress done={deliveredLines} total={active.length} />
          <ul className="mt-3 space-y-1 text-sm">
            <li className="flex justify-between"><span className="text-ink-soft">Pending lines</span><span className="font-medium tabular-nums">{pendingLines.length}</span></li>
            <li className="flex justify-between"><span className="text-ink-soft">Overdue lines</span><span className={cx("font-medium tabular-nums", overdue.length && "text-red-600")}>{overdue.length}</span></li>
            <li className="flex justify-between"><span className="text-ink-soft">Challans</span><span className="font-medium tabular-nums">{dels.length}</span></li>
            <li className="flex justify-between"><span className="text-ink-soft">Invoices</span><span className="font-medium tabular-nums">{invs.filter((i) => i.status !== "cancelled").length}</span></li>
          </ul>
        </Card>
      </div>

      <Card title={`Order lines (${lines.length})`} className="mb-4" bodyClassName="p-0">
        <Table className="rounded-none border-0 shadow-none">
          <thead>
            <tr>
              <Th>#</Th><Th>Item</Th><Th className="text-right">Ordered</Th><Th className="text-right">Delivered</Th><Th className="text-right">Invoiced</Th>
              <Th className="text-right">Pending</Th><Th className="text-right">Rate</Th><Th>Status</Th><Th>Expected</Th><Th>Remarks</Th>{write && isOpen && <Th><span className="sr-only">Actions</span></Th>}
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const pend = round2(Number(l.qty) - Number(l.deliveredQty));
              const exp = effectiveExpected(l, o.expectedDelivery);
              const late = isOpen && l.deliveryStatus !== "delivered" && l.deliveryStatus !== "cancelled" && exp && exp < today;
              return (
                <tr key={l.id} id={`line-${l.id}`} className={cx("scroll-mt-20 target:bg-amber-50 dark:target:bg-amber-950/40", late && "bg-red-50/60 dark:bg-red-950/30", l.deliveryStatus === "cancelled" && "opacity-60")}>
                  <Td className="text-ink-soft">{i + 1}</Td>
                  <Td className="max-w-72 whitespace-normal">{l.description}{l.itemCode && <div className="text-xs text-ink-faint">{l.itemCode}</div>}</Td>
                  <Td className="text-right tabular-nums">{qty(l.qty)} <span className="text-xs text-ink-soft">{l.uom}</span></Td>
                  <Td className="text-right tabular-nums">{qty(l.deliveredQty)}</Td>
                  <Td className="text-right tabular-nums">{qty(l.invoicedQty)}</Td>
                  <Td className={cx("text-right font-medium tabular-nums", pend > 0 && l.deliveryStatus !== "cancelled" && "text-amber-700 dark:text-amber-300")}>{l.deliveryStatus === "cancelled" ? "—" : qty(pend)}</Td>
                  <Td className="text-right tabular-nums">{money(l.rate)}</Td>
                  <Td><StatusBadge status={l.deliveryStatus} label={LINE_STATUS_LABEL[l.deliveryStatus]} /></Td>
                  <Td className="whitespace-nowrap">{fmtDate(exp)}{late && <div><Badge tone="red">late</Badge></div>}{!l.expectedDate && exp && <div className="text-xs text-ink-faint">order default</div>}</Td>
                  <Td className="max-w-56 whitespace-normal text-ink-soft">{l.remarks || "—"}</Td>
                  {write && isOpen && <Td>{l.deliveryStatus !== "delivered" && <LineUpdateForm orderId={o.id} line={l} />}</Td>}
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      {write && isOpen && pendingLines.length > 0 && (
        <Card title={<span className="inline-flex items-center gap-2"><Truck className="h-4 w-4" aria-hidden /> Record delivery (challan)</span>} className="mb-4">
          <form action={recordDelivery} className="space-y-4">
            <input type="hidden" name="orderId" value={o.id} />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Challan date" required><Input type="date" name="date" required defaultValue={today} max={today} /></Field>
              <Field label="Vehicle no."><Input name="vehicleNo" maxLength={30} placeholder="TN 70 AB 1234" autoCapitalize="characters" /></Field>
              <Field label="Received by"><Input name="receivedBy" maxLength={120} placeholder="Name at site" /></Field>
              <Field label="Notes"><Input name="notes" maxLength={2000} /></Field>
            </div>
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-ink">Quantity delivered now <span className="font-normal text-ink-soft">(defaults to the full pending qty — set 0 to skip a line)</span></legend>
              <ul className="divide-y divide-line rounded-lg border border-line">
                {pendingLines.map((l) => {
                  const pend = round2(Number(l.qty) - Number(l.deliveredQty));
                  return (
                    <li key={l.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <label htmlFor={`qty_${l.id}`} className="min-w-0 text-sm">
                        <span className="block font-medium text-ink">{l.description}</span>
                        <span className="text-xs text-ink-soft">Pending {qty(pend)} {l.uom} of {qty(l.qty)} · {LINE_STATUS_LABEL[l.deliveryStatus]}</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <Input id={`qty_${l.id}`} name={`qty_${l.id}`} type="number" inputMode="decimal" step="any" min={0} max={pend} defaultValue={pend} className="w-28 text-right" />
                        <span className="w-10 text-xs text-ink-soft">{l.uom}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
            <div className="flex justify-end">
              <SubmitButton pendingText="Recording…">Record delivery</SubmitButton>
            </div>
          </form>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Deliveries (${dels.length})`} bodyClassName={dels.length ? "p-0" : undefined}>
          {dels.length === 0 ? (
            <EmptyState title="No deliveries yet">Record a delivery challan when material leaves for the site.</EmptyState>
          ) : (
            <Table className="rounded-none border-0 shadow-none">
              <thead><tr><Th>Challan</Th><Th>Date</Th><Th>Vehicle</Th><Th>Received by</Th><Th className="text-right">Lines</Th></tr></thead>
              <tbody>
                {dels.map((d) => (
                  <tr key={d.id}>
                    <Td><Link href={`/orders/${o.id}/challan/${d.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">{d.number}</Link></Td>
                    <Td className="whitespace-nowrap">{fmtDate(d.date)}</Td>
                    <Td>{d.vehicleNo || "—"}</Td>
                    <Td>{d.receivedBy || "—"}</Td>
                    <Td className="text-right tabular-nums">{delivTotalQty.get(d.id)?.n ?? 0}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <Card title={`Invoices (${invs.length})`} bodyClassName={invs.length ? "p-0" : undefined}>
          {invs.length === 0 ? (
            <EmptyState title="Not invoiced yet">{billingWrite && o.status !== "cancelled" ? "Use “Create invoice” to bill delivered quantities." : "Accounts will raise the invoice."}</EmptyState>
          ) : (
            <Table className="rounded-none border-0 shadow-none">
              <thead><tr><Th>Invoice</Th><Th>Date</Th><Th className="text-right">Total</Th><Th>Status</Th></tr></thead>
              <tbody>
                {invs.map((v) => (
                  <tr key={v.id}>
                    <Td>{canRead(user.role, "billing")
                      ? <Link href={`/billing/invoices/${v.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">{v.number}</Link> : v.number}</Td>
                    <Td className="whitespace-nowrap">{fmtDate(v.invoiceDate)}</Td>
                    <Td className="text-right tabular-nums">{money0(v.total)}</Td>
                    <Td><StatusBadge status={v.status} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
