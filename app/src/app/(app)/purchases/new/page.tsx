import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { addDays, todayIST } from "@/lib/format";
import { Flash, PageHeader } from "@/components/ui";
import { PurchaseForm } from "../_components/purchase-form";
import { purchaseFormData } from "../_components/form-data";
import { createPurchase } from "../actions";

export default async function NewPurchasePage({ searchParams }: { searchParams: Promise<{ vendor?: string; project?: string; err?: string }> }) {
  const user = await requireUser("purchases");
  if (!canWrite(user.role, "purchases")) redirect("/forbidden");
  const sp = await searchParams;
  const db = await getDb();
  const data = await purchaseFormData(db);
  const today = todayIST();
  const vendor = data.vendors.find((v) => String(v.id) === sp.vendor);
  const project = data.projects.find((p) => String(p.id) === sp.project);
  return (
    <div className="max-w-5xl">
      <PageHeader title="New purchase invoice" subtitle="Enter the supplier's bill. Posting it updates the item's latest price, the vendor master and stock automatically."
        back={{ href: "/purchases", label: "Purchase invoices" }} />
      <Flash err={sp.err} />
      <PurchaseForm
        action={createPurchase}
        vendors={data.vendors.filter((v) => v.active)}
        projects={data.projects}
        items={data.items}
        vendorRates={data.vendorRates}
        initial={{ vendorId: vendor?.id ?? null, invoiceNo: "", invoiceDate: today, dueDate: vendor ? addDays(today, vendor.paymentTermsDays) : "", projectId: project?.id ?? null, notes: "", lines: [] }}
      />
    </div>
  );
}
