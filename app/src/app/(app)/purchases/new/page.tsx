import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { addDays, qty, todayIST } from "@/lib/format";
import { PO_STATUS_LABEL, RECEIVABLE_PO_STATUSES, invoicePrefillFromPo, isPoStatus } from "@/lib/purchase-orders";
import { Flash } from "@/components/ui";
import { FormPage } from "@/components/patterns";
import { PurchaseForm, type PFLine } from "../_components/purchase-form";
import { purchaseFormData } from "../_components/form-data";
import { createPurchase } from "../actions";

export const metadata = { title: "New purchase invoice" };

export default async function NewPurchasePage({ searchParams }: { searchParams: Promise<{ vendor?: string; project?: string; po?: string; err?: string }> }) {
  const user = await requireUser("purchases");
  if (!canWrite(user.role, "purchases")) redirect("/forbidden");
  const sp = await searchParams;
  const db = await getDb();
  const today = todayIST();

  // Rule 16: /purchases/new?po=ID prefills the bill from a vendor purchase order (qty = ordered − received).
  const poId = Number(sp.po);
  const prefill = Number.isInteger(poId) && poId > 0 ? await invoicePrefillFromPo(db, poId) : null;
  if (sp.po && !prefill) redirect("/purchases/new?err=" + encodeURIComponent("Purchase order not found"));
  if (prefill && !(RECEIVABLE_PO_STATUSES as readonly string[]).includes(prefill.po.status)) {
    const st = isPoStatus(prefill.po.status) ? PO_STATUS_LABEL[prefill.po.status].toLowerCase() : prefill.po.status;
    redirect(`/purchase-orders/${prefill.po.id}?err=` + encodeURIComponent(`This PO is ${st}. Bills can only be raised against a sent or partly received PO`));
  }
  if (prefill && !prefill.lines.length) {
    redirect(`/purchase-orders/${prefill.po.id}?err=` + encodeURIComponent(prefill.draftBills
      ? "Everything still to receive is already on a draft bill. Post or edit that bill instead"
      : "Nothing left to receive on this PO"));
  }

  const data = await purchaseFormData(db, prefill ? prefill.lines.map((l) => l.itemId) : []);
  const vendor = data.vendors.find((v) => (prefill ? v.id === prefill.po.vendorId : String(v.id) === sp.vendor));
  const projectId = prefill ? prefill.po.projectId : data.projects.find((p) => String(p.id) === sp.project)?.id ?? null;
  const lines: PFLine[] = prefill
    ? prefill.lines.map((l) => ({
      itemId: l.itemId, description: l.description, qty: l.qty, rate: l.rate, gstRate: l.gstRate, poLineId: l.poLineId,
      poInfo: `ordered ${qty(l.ordered)}, received ${qty(l.received)}${l.onDrafts ? `, ${qty(l.onDrafts)} on draft bills` : ""}`,
    }))
    : [];
  return (
    <FormPage width="wide"
      title={prefill ? `Bill against ${prefill.po.number}` : "New purchase invoice"}
      subtitle={prefill
        ? <>Enter the supplier&apos;s bill for goods received on <Link href={`/purchase-orders/${prefill.po.id}`} className="text-brand-700 hover:underline dark:text-brand-300">{prefill.po.number}</Link>. Posting it updates the PO, latest prices and stock.</>
        : "Enter the supplier's bill. Posting it updates the item's latest price, the vendor master and stock automatically."}
      back={prefill ? { href: `/purchase-orders/${prefill.po.id}`, label: prefill.po.number } : { href: "/purchases", label: "Purchase invoices" }}
      notices={sp.err ? <Flash err={sp.err} /> : undefined}>
      <PurchaseForm
        action={createPurchase}
        vendors={data.vendors.filter((v) => v.active || v.id === vendor?.id)}
        projects={data.projects}
        items={data.items}
        vendorRates={data.vendorRates}
        po={prefill ? { id: prefill.po.id, number: prefill.po.number } : null}
        initial={{ vendorId: vendor?.id ?? null, invoiceNo: "", invoiceDate: today, dueDate: vendor ? addDays(today, vendor.paymentTermsDays) : "", projectId, notes: "", lines }}
      />
    </FormPage>
  );
}
