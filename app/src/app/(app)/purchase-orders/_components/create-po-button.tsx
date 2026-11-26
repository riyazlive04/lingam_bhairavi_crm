"use client";
/**
 * "Create vendor PO" button for a customer sales order (rule 16). Opens /purchase-orders/new?salesOrderId=…,
 * which prefills the order's pending lines. Place it on the sales order page for users who can write purchase orders.
 */
import { ClipboardList } from "lucide-react";
import { LinkButton } from "@/components/ui";

export function CreateVendorPoButton({ salesOrderId, label = "Create vendor PO", variant = "secondary", size = "md" }: {
  salesOrderId: number;
  label?: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
}) {
  return (
    <LinkButton href={`/purchase-orders/new?salesOrderId=${encodeURIComponent(String(salesOrderId))}`} variant={variant} size={size}>
      <ClipboardList className="icon-sm" aria-hidden /> {label}
    </LinkButton>
  );
}
