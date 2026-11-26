import { notFound, redirect } from "next/navigation";
import { and, desc, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, salesInvoices, salesOrders, salesReturnLines, salesReturns } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { fmtDate } from "@/lib/format";
import { returnableInvoiceLines, returnableOrderLines, type ReturnableLine } from "@/lib/returns";
import { Flash, PageHeader } from "@/components/ui";
import { SalesReturnForm } from "../../_components/sales-return-form";
import { toEditorLines } from "../../_components/lines";

export const metadata = { title: "Edit customer return" };

export default async function EditCustomerReturnPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }> }) {
  const user = await requireUser("returns");
  const { id } = await params;
  const sp = await searchParams;
  const returnId = Number(id);
  if (!Number.isInteger(returnId) || returnId <= 0) notFound();
  if (!canWrite(user.role, "returns")) redirect(`/returns/${returnId}?err=` + encodeURIComponent("You do not have permission to change returns"));
  const db = await getDb();
  const [row] = await db.select({ r: salesReturns, customerName: customers.name, orderNo: salesOrders.number, invNo: salesInvoices.number, invDate: salesInvoices.invoiceDate })
    .from(salesReturns).innerJoin(customers, eq(customers.id, salesReturns.customerId))
    .leftJoin(salesOrders, eq(salesOrders.id, salesReturns.orderId)).leftJoin(salesInvoices, eq(salesInvoices.id, salesReturns.salesInvoiceId))
    .where(eq(salesReturns.id, returnId));
  if (!row) notFound();
  const { r } = row;
  if (r.status !== "draft") redirect(`/returns/${returnId}?err=` + encodeURIComponent("Only a draft can be edited"));

  const saved = await db.select().from(salesReturnLines).where(eq(salesReturnLines.returnId, returnId));
  // same line set as the save action: order lines (when there is an order) plus invoice lines without an order line
  const invLines = r.salesInvoiceId ? await returnableInvoiceLines(db, r.salesInvoiceId) : [];
  const avail: ReturnableLine[] = r.orderId
    ? [...(await returnableOrderLines(db, r.orderId)), ...invLines.filter((l) => l.orderLineId == null)]
    : invLines;
  const savedMap = new Map<string, { qty: number; rate: number; gstRate: number; restock: boolean }>();
  for (const s of saved) {
    const a = s.orderLineId != null ? avail.find((x) => x.orderLineId === s.orderLineId) : avail.find((x) => x.orderLineId == null && x.itemId === s.itemId && x.description === s.description);
    if (a) savedMap.set(a.key, { qty: Number(s.qty), rate: Number(s.rate), gstRate: Number(s.gstRate), restock: s.restock });
  }
  const invs = r.orderId
    ? await db.select({ id: salesInvoices.id, number: salesInvoices.number, invoiceDate: salesInvoices.invoiceDate }).from(salesInvoices)
      .where(and(eq(salesInvoices.orderId, r.orderId), ne(salesInvoices.status, "cancelled"), ne(salesInvoices.status, "draft"))).orderBy(desc(salesInvoices.invoiceDate))
    : undefined;

  return (
    <>
      <PageHeader title="Edit draft credit note" subtitle={row.customerName} back={{ href: `/returns/${returnId}`, label: "Draft credit note" }} />
      <Flash err={sp.err} />
      <SalesReturnForm
        returnId={returnId}
        orderId={r.orderId}
        invoiceId={r.orderId ? undefined : r.salesInvoiceId}
        invoiceChoices={invs}
        selectedInvoiceId={r.salesInvoiceId}
        details={[
          ["Customer", row.customerName],
          ["Order", row.orderNo || "-"],
          ["Invoice", row.invNo ? `${row.invNo} dated ${fmtDate(row.invDate)}` : "-"],
        ]}
        lines={toEditorLines(avail, savedMap)}
        date={r.date}
        reason={r.reason}
        notes={r.notes}
      />
    </>
  );
}
