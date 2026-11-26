import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { canRead, canWrite } from "@/lib/rbac";
import { addDays, qty, todayIST } from "@/lib/format";
import { getPoTerms, soPrefill } from "@/lib/purchase-orders";
import { Flash, PageHeader } from "@/components/ui";
import { PurchaseOrderForm, type POFLine } from "../_components/po-form";
import { poFormData } from "../_lib/data";
import { savePurchaseOrder } from "../actions";

export const metadata = { title: "New purchase order" };

export default async function NewPurchaseOrderPage({ searchParams }: { searchParams: Promise<{ salesOrderId?: string; vendor?: string; project?: string; err?: string }> }) {
  const user = await requireUser("purchaseOrders");
  if (!canWrite(user.role, "purchaseOrders")) redirect("/forbidden");
  const sp = await searchParams;
  const db = await getDb();
  const today = todayIST();

  // Rule 16: /purchase-orders/new?salesOrderId=X prefills the customer order's pending lines.
  const soId = Number(sp.salesOrderId);
  const pre = Number.isInteger(soId) && soId > 0 ? await soPrefill(db, soId) : null;
  if (sp.salesOrderId && !pre) redirect("/purchase-orders/new?err=" + encodeURIComponent("Customer order not found"));

  const [data, terms] = await Promise.all([
    poFormData(db, { includeItemIds: pre?.lines.map((l) => l.itemId) ?? [], includeSalesOrderId: pre?.so.id ?? null }),
    getPoTerms(db),
  ]);
  const vendor = data.vendors.find((v) => v.active && String(v.id) === sp.vendor);
  const lines: POFLine[] = (pre?.lines ?? []).map((l, i) => ({
    key: `so${l.salesOrderLineId}-${i}`, itemId: l.itemId, description: "", qty: l.toOrder, rate: 0, gstRate: l.gstRate,
    salesOrderLineId: l.salesOrderLineId,
    soInfo: `${qty(l.soQty)} ordered by customer, ${qty(l.deliveredQty)} delivered${l.alreadyOrdered ? `, ${qty(l.alreadyOrdered)} already on other POs` : ""}`,
  }));
  const so = pre?.so;
  const soLabel = so ? data.salesOrders.find((s) => s.id === so.id) : null;
  const ordersLink = so && canRead(user.role, "orders");

  return (
    <div className="max-w-5xl">
      <PageHeader
        title={so ? `Vendor PO for ${so.number}` : "New purchase order"}
        subtitle={so
          ? <>Lines still to buy for {soLabel?.customerName ?? "the customer"}&apos;s order{so.customerPoNumber ? ` (PO ${so.customerPoNumber})` : ""}. Remove lines you will buy from another vendor; you can raise a second PO for them.</>
          : "Order material from a vendor. Rates start from this vendor's last price, else the latest cost."}
        back={so && ordersLink ? { href: `/orders/${so.id}`, label: so.number } : { href: "/purchase-orders", label: "Purchase orders" }}
      />
      <Flash err={sp.err} />
      {pre && (pre.noItem > 0 || pre.covered > 0) && (
        <p role="note" className="mb-4 rounded-lg border border-line bg-muted px-4 py-3 text-sm text-ink-soft">
          {pre.covered > 0 && `${pre.covered} line${pre.covered === 1 ? " is" : "s are"} already delivered or fully on other POs. `}
          {pre.noItem > 0 && `${pre.noItem} free-text line${pre.noItem === 1 ? " is" : "s are"} not linked to the item master, so ${pre.noItem === 1 ? "it" : "they"} can't go on a PO. `}
          {ordersLink && <Link href={`/orders/${so!.id}`} className="text-brand-700 hover:underline">View the order</Link>}
        </p>
      )}
      {pre && pre.lines.length === 0 && (
        <p role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Nothing is left to buy for this order. You can still add items by hand.
        </p>
      )}
      <PurchaseOrderForm
        action={savePurchaseOrder}
        vendors={data.vendors.filter((v) => v.active)}
        projects={data.projects}
        salesOrders={data.salesOrders}
        items={data.items}
        vendorRates={data.vendorRates}
        initial={{
          vendorId: vendor?.id ?? null, poDate: today, expectedDate: addDays(today, 7), salesOrderId: so?.id ?? null,
          projectId: so?.projectId ?? (Number(sp.project) || null), terms, notes: "", lines,
        }}
      />
    </div>
  );
}
