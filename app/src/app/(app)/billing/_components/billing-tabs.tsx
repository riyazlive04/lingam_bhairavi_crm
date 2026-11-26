import { Tabs } from "@/components/patterns";

const TABS = [
  { id: "overview", href: "/billing", label: "Overview" },
  { id: "invoices", href: "/billing/invoices", label: "Invoices" },
  { id: "receivables", href: "/billing/receivables", label: "Receivables" },
  { id: "payables", href: "/billing/payables", label: "Payables" },
  { id: "payments", href: "/billing/payments", label: "Payments" },
  { id: "advances", href: "/billing/advances", label: "Advances" },
] as const;

export type BillingSection = (typeof TABS)[number]["id"];

/** Billing section tabs (separate routes) on the shared kit Tabs. Pass it to ListPage `filters` or above the content. */
export function BillingTabs({ active }: { active: BillingSection }) {
  return <Tabs label="Billing sections" active={active} items={TABS.map((t) => ({ id: t.id, label: t.label, href: t.href }))} />;
}
