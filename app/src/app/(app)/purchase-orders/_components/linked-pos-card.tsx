/**
 * "Vendor POs" card for the sales order and project pages: purchase orders raised against that order or project,
 * with status and % received. Server component. Links to the PO only when the viewer can read purchase orders.
 */
import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { ClipboardList } from "lucide-react";
import { getDb } from "@/db";
import { purchaseOrderLines, purchaseOrders, vendors } from "@/db/schema";
import { fmtDate, money0 } from "@/lib/format";
import { poReceivedPct } from "@/lib/purchase-orders";
import { canRead, canSeeCost } from "@/lib/rbac";
import type { Role } from "@/lib/constants";
import { ProgressBar, ResponsiveTable, SectionCard, type Column } from "@/components/patterns";
import { PoStatusBadge } from "./po-bits";

export async function LinkedPosCard({ role, salesOrderId, projectId, className, hideWhenEmpty = false }: {
  role: Role; salesOrderId?: number; projectId?: number; className?: string; hideWhenEmpty?: boolean;
}) {
  if (salesOrderId == null && projectId == null) return null;
  const db = await getDb();
  const pos = await db.select({ id: purchaseOrders.id, number: purchaseOrders.number, poDate: purchaseOrders.poDate, status: purchaseOrders.status, total: purchaseOrders.total, vendorName: vendors.name })
    .from(purchaseOrders).leftJoin(vendors, eq(vendors.id, purchaseOrders.vendorId))
    .where(salesOrderId != null ? eq(purchaseOrders.salesOrderId, salesOrderId) : eq(purchaseOrders.projectId, projectId!))
    .orderBy(desc(purchaseOrders.poDate), desc(purchaseOrders.id));
  if (!pos.length && hideWhenEmpty) return null;
  const lines = pos.length
    ? await db.select({ poId: purchaseOrderLines.poId, qty: purchaseOrderLines.qty, receivedQty: purchaseOrderLines.receivedQty })
      .from(purchaseOrderLines).where(inArray(purchaseOrderLines.poId, pos.map((p) => p.id)))
    : [];
  const link = canRead(role, "purchaseOrders");
  // PO totals are buying prices: hidden from roles that may not see cost (engineers on the order / project page)
  const showTotal = link || canSeeCost(role);

  type Po = (typeof pos)[number];
  const columns: Column<Po>[] = [
    { key: "no", header: "PO", card: "title", nowrap: true,
      cell: (p) => link ? <Link href={`/purchase-orders/${p.id}`} className="rt-stretch font-medium text-brand-700 hover:underline dark:text-brand-300">{p.number}</Link> : p.number },
    { key: "vendor", header: "Vendor", card: "subtitle", className: "max-w-48 truncate", cell: (p) => p.vendorName ?? "-" },
    { key: "date", header: "Date", nowrap: true, cell: (p) => fmtDate(p.poDate) },
    ...(showTotal ? [{ key: "total", header: "Total", align: "right" as const, card: "amount" as const, nowrap: true, cell: (p: Po) => money0(p.total) }] : []),
    { key: "status", header: "Status", card: "badge", cell: (p) => <PoStatusBadge status={p.status} /> },
    { key: "recv", header: "Received", cell: (p) => <ProgressBar size="sm" label="Received" value={poReceivedPct(lines.filter((l) => l.poId === p.id))} /> },
  ];

  return (
    <SectionCard title="Vendor POs" count={pos.length} icon={ClipboardList} className={className} flush
      empty={pos.length === 0 && `No vendor POs yet. Purchase orders placed with suppliers for this ${salesOrderId != null ? "order" : "project"} appear here.`}>
      <ResponsiveTable flush rows={pos} columns={columns} rowKey={(p) => p.id} caption="Vendor POs" />
    </SectionCard>
  );
}
