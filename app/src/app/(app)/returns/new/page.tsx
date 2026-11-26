import { redirect } from "next/navigation";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, projects, salesInvoices, salesOrderLines, salesOrders } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { fmtDate } from "@/lib/format";
import { returnableInvoiceLines, returnableOrderLines } from "@/lib/returns";
import { Button, EmptyState, Field, Flash, Select } from "@/components/ui";
import { FormPage, SectionCard } from "@/components/patterns";
import { SalesReturnForm } from "../_components/sales-return-form";
import { toEditorLines } from "../_components/lines";

export const metadata = { title: "New customer return" };

export default async function NewCustomerReturnPage({ searchParams }: { searchParams: Promise<{ orderId?: string; invoiceId?: string; err?: string }> }) {
  const user = await requireUser("returns");
  if (!canWrite(user.role, "returns")) redirect("/returns?err=" + encodeURIComponent("You do not have permission to record returns"));
  const sp = await searchParams;
  const db = await getDb();
  const orderId = Number(sp.orderId) || undefined;
  const invoiceId = Number(sp.invoiceId) || undefined;

  if (orderId) {
    const [row] = await db.select({ o: salesOrders, customerName: customers.name, projectName: projects.name })
      .from(salesOrders).innerJoin(customers, eq(customers.id, salesOrders.customerId)).leftJoin(projects, eq(projects.id, salesOrders.projectId))
      .where(eq(salesOrders.id, orderId));
    if (row) {
      const [lines, invs] = await Promise.all([
        returnableOrderLines(db, orderId),
        db.select({ id: salesInvoices.id, number: salesInvoices.number, invoiceDate: salesInvoices.invoiceDate }).from(salesInvoices)
          .where(and(eq(salesInvoices.orderId, orderId), ne(salesInvoices.status, "cancelled"), ne(salesInvoices.status, "draft")))
          .orderBy(desc(salesInvoices.invoiceDate)),
      ]);
      return (
        <FormPage eyebrow="Step 2 of 2" title="New customer return" subtitle={`Against order ${row.o.number}`} back={{ href: `/orders/${orderId}`, label: row.o.number }}
          width="wide" notices={<Flash err={sp.err} />}>
          {lines.length === 0 ? (
            <EmptyState title="Nothing delivered on this order yet">Only delivered material can be returned. Record the delivery first.</EmptyState>
          ) : (
            <SalesReturnForm
              cancelHref={`/orders/${orderId}`}
              orderId={orderId}
              invoiceChoices={invs}
              details={[
                ["Customer", row.customerName],
                ["Order", `${row.o.number}${row.o.customerPoNumber ? ` (PO ${row.o.customerPoNumber})` : ""}`],
                ["Project", row.projectName || "-"],
                ["Order date", fmtDate(row.o.orderDate)],
              ]}
              lines={toEditorLines(lines)}
            />
          )}
        </FormPage>
      );
    }
  }

  if (invoiceId) {
    const [row] = await db.select({ inv: salesInvoices, customerName: customers.name, orderNo: salesOrders.number })
      .from(salesInvoices).innerJoin(customers, eq(customers.id, salesInvoices.customerId)).leftJoin(salesOrders, eq(salesOrders.id, salesInvoices.orderId))
      .where(eq(salesInvoices.id, invoiceId));
    if (row && row.inv.status !== "cancelled" && row.inv.status !== "draft") {
      const lines = await returnableInvoiceLines(db, invoiceId);
      return (
        <FormPage eyebrow="Step 2 of 2" title="New customer return" subtitle={`Against invoice ${row.inv.number}`} back={{ href: "/returns/new", label: "Choose another order or invoice" }}
          width="wide" notices={<Flash err={sp.err} />}>
          <SalesReturnForm
            cancelHref="/returns"
            invoiceId={invoiceId}
            details={[
              ["Customer", row.customerName],
              ["Invoice", `${row.inv.number} dated ${fmtDate(row.inv.invoiceDate)}`],
              ["Order", row.orderNo || "-"],
            ]}
            lines={toEditorLines(lines)}
          />
        </FormPage>
      );
    }
  }

  // picker: orders with deliveries, or issued invoices
  const [orders, invoices] = await Promise.all([
    db.selectDistinct({ id: salesOrders.id, number: salesOrders.number, orderDate: salesOrders.orderDate, customerName: customers.name })
      .from(salesOrders).innerJoin(customers, eq(customers.id, salesOrders.customerId))
      .innerJoin(salesOrderLines, eq(salesOrderLines.orderId, salesOrders.id))
      .where(and(ne(salesOrders.status, "cancelled"), sql`${salesOrderLines.deliveredQty} - ${salesOrderLines.returnedQty} > 0`))
      .orderBy(desc(salesOrders.orderDate), desc(salesOrders.id)).limit(300),
    db.select({ id: salesInvoices.id, number: salesInvoices.number, invoiceDate: salesInvoices.invoiceDate, customerName: customers.name })
      .from(salesInvoices).innerJoin(customers, eq(customers.id, salesInvoices.customerId))
      .where(inArray(salesInvoices.status, ["issued", "partially_paid", "paid"]))
      .orderBy(desc(salesInvoices.invoiceDate), desc(salesInvoices.id)).limit(300),
  ]);
  const notFoundMsg = orderId || invoiceId ? "We couldn't find that order or invoice. Pick one below." : undefined;
  return (
    <FormPage eyebrow="Step 1 of 2" title="New customer return" subtitle="Start from the order or the invoice the goods were supplied on." back={{ href: "/returns", label: "Returns" }}
      notices={<Flash err={sp.err ?? notFoundMsg} />}>
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="From an order" description="Best when the goods were delivered but not yet billed."
          empty={orders.length === 0 && "No orders with delivered material yet."}>
          <form method="get" className="grid gap-3">
            <Field label="Order" required>
              <Select name="orderId" required defaultValue="">
                <option value="" disabled>Select order</option>
                {orders.map((o) => <option key={o.id} value={o.id}>{o.number} · {o.customerName} · {fmtDate(o.orderDate)}</option>)}
              </Select>
            </Field>
            <div><Button type="submit" className="max-sm:w-full">Next: choose items</Button></div>
          </form>
        </SectionCard>
        <SectionCard title="From an invoice" description="Use this when the goods were already billed."
          empty={invoices.length === 0 && "No invoices issued yet."}>
          <form method="get" className="grid gap-3">
            <Field label="Invoice" required>
              <Select name="invoiceId" required defaultValue="">
                <option value="" disabled>Select invoice</option>
                {invoices.map((i) => <option key={i.id} value={i.id}>{i.number} · {i.customerName} · {fmtDate(i.invoiceDate)}</option>)}
              </Select>
            </Field>
            <div><Button type="submit" className="max-sm:w-full">Next: choose items</Button></div>
          </form>
        </SectionCard>
      </div>
    </FormPage>
  );
}
