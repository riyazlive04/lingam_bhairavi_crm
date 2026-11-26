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
import { Card, EmptyState, Table, Td, Th } from "@/components/ui";
import { PoStatusBadge, ReceivedBar } from "./po-bits";

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

  return (
    <Card title={`Vendor POs (${pos.length})`} icon={ClipboardList} className={className} bodyClassName={pos.length ? "p-0" : undefined}>
      {pos.length === 0 ? (
        <EmptyState title="No vendor POs yet">Purchase orders placed with suppliers for this {salesOrderId != null ? "order" : "project"} appear here.</EmptyState>
      ) : (
        <Table className="rounded-none border-0 shadow-none">
          <thead><tr><Th>PO</Th><Th>Vendor</Th><Th>Date</Th>{showTotal && <Th className="text-right">Total</Th>}<Th>Status</Th><Th>Received</Th></tr></thead>
          <tbody>
            {pos.map((p) => (
              <tr key={p.id}>
                <Td>{link ? <Link href={`/purchase-orders/${p.id}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">{p.number}</Link> : p.number}</Td>
                <Td className="max-w-48 truncate">{p.vendorName ?? "-"}</Td>
                <Td className="whitespace-nowrap">{fmtDate(p.poDate)}</Td>
                {showTotal && <Td className="text-right tabular-nums">{money0(p.total)}</Td>}
                <Td><PoStatusBadge status={p.status} /></Td>
                <Td><ReceivedBar pct={poReceivedPct(lines.filter((l) => l.poId === p.id))} /></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
