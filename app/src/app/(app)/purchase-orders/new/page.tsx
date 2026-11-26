import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { canRead, canWrite } from "@/lib/rbac";
import { addDays, qty, todayIST } from "@/lib/format";
import { getPoTerms, soPrefill } from "@/lib/purchase-orders";
import { Flash, LinkButton } from "@/components/ui";
import { Callout, FormPage } from "@/components/patterns";
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
    <FormPage
      width="wide"
      title={so ? `Vendor PO for ${so.number}` : "New purchase order"}
      subtitle={so
        ? <>Lines still to buy for {soLabel?.customerName ?? "the customer"}&apos;s order{so.customerPoNumber ? ` (PO ${so.customerPoNumber})` : ""}. Remove lines you will buy from another vendor. You can raise a second PO for them.</>
        : "Order material from a vendor. Rates start from this vendor's last price, else the latest cost."}
      back={so && ordersLink ? { href: `/orders/${so.id}`, label: so.number } : { href: "/purchase-orders", label: "Purchase orders" }}
      notices={
        <>
          <Flash err={sp.err} />
          {pre && (pre.noItem > 0 || pre.covered > 0) && (
            <Callout tone="info" action={ordersLink && <LinkButton href={`/orders/${so!.id}`} variant="secondary" size="sm">View the order</LinkButton>}>
              {pre.covered > 0 && `${pre.covered} line${pre.covered === 1 ? " is" : "s are"} already delivered or fully on other POs. `}
              {pre.noItem > 0 && `${pre.noItem} free-text line${pre.noItem === 1 ? " is" : "s are"} not linked to the item master, so ${pre.noItem === 1 ? "it" : "they"} cannot go on a PO.`}
            </Callout>
          )}
          {pre && pre.lines.length === 0 && (
            <Callout tone="warning">Nothing is left to buy for this order. You can still add items by hand.</Callout>
          )}
        </>
      }
    >
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
    </FormPage>
  );
}
