import { redirect } from "next/navigation";
import { asc, desc, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, items, projects, salesOrderLines, salesOrders } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { addDays, fmtDate, qty, round2, todayIST } from "@/lib/format";
import { Card, DL, Field, Flash, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { createInvoice } from "../../actions";
import { InvoiceLineEditor, type InvEditorLine, type InvPickItem } from "../../_components/invoice-line-editor";

export const metadata = { title: "New tax invoice" };

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ orderId?: string; err?: string }> }) {
  const user = await requireUser("billing");
  if (!canWrite(user.role, "billing")) redirect("/billing/invoices?err=" + encodeURIComponent("You do not have permission to create invoices"));
  const sp = await searchParams;
  const db = await getDb();
  const today = todayIST();

  const itemRows = await db.select({ id: items.id, code: items.code, name: items.name, uom: items.uom, gstRate: items.gstRate, lastSaleRate: items.lastSaleRate, listPrice: items.listPrice })
    .from(items).where(eq(items.active, true)).orderBy(asc(items.code));
  const pick: InvPickItem[] = itemRows.map((i) => ({ id: i.id, code: i.code, name: i.name, uom: i.uom, gstRate: Number(i.gstRate), rate: Number(i.lastSaleRate ?? i.listPrice ?? 0) }));
  const gstOf = new Map(itemRows.map((i) => [i.id, Number(i.gstRate)]));

  const orderId = Number(sp.orderId) || undefined;
  let order: { o: typeof salesOrders.$inferSelect; c: typeof customers.$inferSelect; projectName: string | null } | undefined;
  let initial: InvEditorLine[] = [];
  if (orderId) {
    [order] = await db.select({ o: salesOrders, c: customers, projectName: projects.name }).from(salesOrders)
      .innerJoin(customers, eq(customers.id, salesOrders.customerId)).leftJoin(projects, eq(projects.id, salesOrders.projectId))
      .where(eq(salesOrders.id, orderId));
    if (order) {
      const ol = await db.select().from(salesOrderLines).where(eq(salesOrderLines.orderId, orderId)).orderBy(asc(salesOrderLines.sortOrder));
      initial = ol
        .filter((l) => l.deliveryStatus !== "cancelled" && Number(l.qty) - Number(l.invoicedQty) > 1e-6)
        .map((l) => {
          const room = round2(Number(l.qty) - Number(l.invoicedQty));
          const def = Math.max(0, Math.min(room, round2(Number(l.deliveredQty) - Number(l.invoicedQty))));
          return {
            orderLineId: l.id, itemId: l.itemId, description: l.description, uom: l.uom, qty: def, rate: Number(l.rate),
            gstRate: l.itemId ? gstOf.get(l.itemId) ?? 18 : 18, maxQty: room,
            info: `Ordered ${qty(l.qty)} · delivered ${qty(l.deliveredQty)} · invoiced ${qty(l.invoicedQty)} ${l.uom}`,
          };
        });
    }
  }

  const [custList, projList] = order ? [[], []] : await Promise.all([
    db.select({ id: customers.id, name: customers.name, terms: customers.paymentTermsDays }).from(customers).where(eq(customers.active, true)).orderBy(asc(customers.name)),
    db.select({ id: projects.id, code: projects.code, name: projects.name }).from(projects).where(ne(projects.status, "closed")).orderBy(desc(projects.id)).limit(300),
  ]);

  return (
    <>
      <PageHeader
        title="New tax invoice"
        subtitle={order ? `Against order ${order.o.number}` : "Manual invoice (not linked to an order)"}
        back={order ? { href: `/orders/${order.o.id}`, label: order.o.number } : { href: "/billing/invoices", label: "Invoices" }}
      />
      <Flash err={sp.err} />
      {orderId && !order && <Flash err="Order not found — creating a manual invoice instead." />}

      <form action={createInvoice} className="space-y-4">
        <Card title="Invoice details">
          {order ? (
            <>
              <input type="hidden" name="orderId" value={order.o.id} />
              <input type="hidden" name="customerId" value={order.c.id} />
              {order.o.projectId && <input type="hidden" name="projectId" value={order.o.projectId} />}
              <div className="mb-4">
                <DL items={[
                  ["Customer", order.c.name],
                  ["GSTIN", order.c.gstin || "—"],
                  ["Customer PO", order.o.customerPoNumber ? `${order.o.customerPoNumber} (${fmtDate(order.o.customerPoDate)})` : "—"],
                  ["Project", order.projectName || "—"],
                ]} />
              </div>
            </>
          ) : (
            <div className="mb-4 grid gap-4 sm:grid-cols-2">
              <Field label="Customer" required>
                <Select name="customerId" required defaultValue="">
                  <option value="" disabled>Select customer</option>
                  {custList.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.terms} days credit)</option>)}
                </Select>
              </Field>
              <Field label="Project">
                <Select name="projectId" defaultValue="">
                  <option value="">— None —</option>
                  {projList.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
                </Select>
              </Field>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Invoice date" required><Input type="date" name="invoiceDate" required defaultValue={today} /></Field>
            <Field label="Due date" hint={order ? `Leave blank for ${order.c.paymentTermsDays} days credit (${fmtDate(addDays(today, order.c.paymentTermsDays))})` : "Leave blank to use the customer's credit days"}>
              <Input type="date" name="dueDate" />
            </Field>
            <Field label="Notes / terms" className="sm:col-span-2">
              <Textarea name="notes" maxLength={4000} defaultValue={order?.o.customerPoNumber ? `Against your PO ${order.o.customerPoNumber}${order.o.customerPoDate ? ` dated ${fmtDate(order.o.customerPoDate)}` : ""}` : ""} />
            </Field>
          </div>
        </Card>
        <Card title="Invoice lines">
          {order && initial.length === 0 && <p className="mb-3 text-sm text-amber-700 dark:text-amber-300">All order lines are fully invoiced. You can still add extra lines (e.g. transport).</p>}
          {order && initial.length > 0 && <p className="mb-3 text-sm text-ink-soft">Quantities default to delivered − already invoiced. Adjust if billing in advance (up to ordered qty).</p>}
          <InvoiceLineEditor items={pick} initial={initial} />
        </Card>
        <div className="flex justify-end">
          <SubmitButton pendingText="Issuing…" confirm="Issue this invoice? It will update price history and order invoiced quantities.">Issue invoice</SubmitButton>
        </div>
      </form>
    </>
  );
}
