import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { purchaseInvoices, vendors } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { fmtDate, money } from "@/lib/format";
import { returnablePurchaseLines } from "@/lib/returns";
import { Button, Card, EmptyState, Field, Flash, PageHeader, Select } from "@/components/ui";
import { VendorReturnForm } from "../../_components/vendor-return-form";
import { toVendorEditorLines } from "../../_components/lines";

export const metadata = { title: "Return to vendor" };

export default async function NewVendorReturnPage({ searchParams }: { searchParams: Promise<{ invoiceId?: string; err?: string }> }) {
  const user = await requireUser("returns");
  if (!canWrite(user.role, "returns")) redirect("/returns?tab=vendor&err=" + encodeURIComponent("You do not have permission to record returns"));
  const sp = await searchParams;
  const db = await getDb();
  const invoiceId = Number(sp.invoiceId) || undefined;

  if (invoiceId) {
    const [row] = await db.select({ pi: purchaseInvoices, vendorName: vendors.name }).from(purchaseInvoices)
      .innerJoin(vendors, eq(vendors.id, purchaseInvoices.vendorId)).where(eq(purchaseInvoices.id, invoiceId));
    if (row && row.pi.status === "posted") {
      const lines = await returnablePurchaseLines(db, invoiceId);
      return (
        <>
          <PageHeader title="Return to vendor" subtitle={`Against bill ${row.pi.invoiceNo} from ${row.vendorName}`} back={{ href: "/returns?tab=vendor", label: "Returns" }} />
          <Flash err={sp.err} />
          {lines.length === 0 ? <EmptyState title="This bill has no lines" /> : (
            <VendorReturnForm
              purchaseInvoiceId={invoiceId}
              details={[
                ["Vendor", row.vendorName],
                ["Vendor bill", `${row.pi.invoiceNo} dated ${fmtDate(row.pi.invoiceDate)}`],
                ["Bill total", money(row.pi.total)],
                ["Balance payable", money(Math.max(0, Number(row.pi.total) - Number(row.pi.paidAmount)))],
              ]}
              lines={toVendorEditorLines(lines)}
            />
          )}
        </>
      );
    }
  }

  const bills = await db.select({ id: purchaseInvoices.id, invoiceNo: purchaseInvoices.invoiceNo, invoiceDate: purchaseInvoices.invoiceDate, vendorName: vendors.name, total: purchaseInvoices.total })
    .from(purchaseInvoices).innerJoin(vendors, eq(vendors.id, purchaseInvoices.vendorId))
    .where(eq(purchaseInvoices.status, "posted"))
    .orderBy(desc(purchaseInvoices.invoiceDate), desc(purchaseInvoices.id)).limit(300);
  return (
    <>
      <PageHeader title="Return to vendor" subtitle="Start from the vendor bill the goods came on" back={{ href: "/returns?tab=vendor", label: "Returns" }} />
      <Flash err={sp.err ?? (invoiceId ? "We couldn't find a posted bill with that reference. Pick one below." : undefined)} />
      <Card title="Choose the vendor bill" className="max-w-2xl">
        {bills.length === 0 ? <p className="text-sm text-ink-soft">No posted purchase invoices yet. Post the vendor bill first.</p> : (
          <form method="get" className="grid gap-3">
            <Field label="Purchase invoice" required>
              <Select name="invoiceId" required defaultValue="">
                <option value="" disabled>Select bill</option>
                {bills.map((b) => <option key={b.id} value={b.id}>{b.vendorName} · {b.invoiceNo} · {fmtDate(b.invoiceDate)} · {money(b.total)}</option>)}
              </Select>
            </Field>
            <div><Button type="submit">Continue</Button></div>
          </form>
        )}
      </Card>
    </>
  );
}
