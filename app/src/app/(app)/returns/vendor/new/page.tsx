import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { purchaseInvoices, vendors } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { fmtDate, money } from "@/lib/format";
import { returnablePurchaseLines } from "@/lib/returns";
import { EmptyState, Field, Flash, Select } from "@/components/ui";
import { FormFooter, FormPage, FormSection } from "@/components/patterns";
import { SubmitButton } from "@/components/submit-button";
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
        <FormPage eyebrow="Step 2 of 2" title="Return to vendor" subtitle={`Against bill ${row.pi.invoiceNo} from ${row.vendorName}`}
          back={{ href: "/returns/vendor/new", label: "Choose another bill" }} width="wide" notices={<Flash err={sp.err} />}>
          {lines.length === 0 ? <EmptyState title="This bill has no lines">Pick another bill to return goods against.</EmptyState> : (
            <VendorReturnForm
              cancelHref="/returns?tab=vendor"
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
        </FormPage>
      );
    }
  }

  const bills = await db.select({ id: purchaseInvoices.id, invoiceNo: purchaseInvoices.invoiceNo, invoiceDate: purchaseInvoices.invoiceDate, vendorName: vendors.name, total: purchaseInvoices.total })
    .from(purchaseInvoices).innerJoin(vendors, eq(vendors.id, purchaseInvoices.vendorId))
    .where(eq(purchaseInvoices.status, "posted"))
    .orderBy(desc(purchaseInvoices.invoiceDate), desc(purchaseInvoices.id)).limit(300);
  return (
    <FormPage eyebrow="Step 1 of 2" title="Return to vendor" subtitle="Start from the vendor bill the goods came on." back={{ href: "/returns?tab=vendor", label: "Returns" }}
      width="narrow" notices={<Flash err={sp.err ?? (invoiceId ? "We couldn't find a posted bill with that reference. Pick one below." : undefined)} />}>
      {bills.length === 0 ? (
        <EmptyState title="No posted vendor bills yet">Post the vendor bill first, then come back to return goods against it.</EmptyState>
      ) : (
        <form method="get">
          <FormSection title="Choose the vendor bill" description="Only posted purchase invoices are listed." columns={1}>
            <Field label="Purchase invoice" required>
              <Select name="invoiceId" required defaultValue="">
                <option value="" disabled>Select bill</option>
                {bills.map((b) => <option key={b.id} value={b.id}>{b.vendorName} · {b.invoiceNo} · {fmtDate(b.invoiceDate)} · {money(b.total)}</option>)}
              </Select>
            </Field>
          </FormSection>
          <FormFooter cancelHref="/returns?tab=vendor">
            <SubmitButton pendingText="Loading…">Next: choose items</SubmitButton>
          </FormFooter>
        </form>
      )}
    </FormPage>
  );
}
