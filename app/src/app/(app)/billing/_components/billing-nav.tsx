import Link from "next/link";
import { cx } from "@/components/ui";

const TABS = [
  { href: "/billing", label: "Overview" },
  { href: "/billing/invoices", label: "Invoices" },
  { href: "/billing/receivables", label: "Receivables" },
  { href: "/billing/payables", label: "Payables" },
  { href: "/billing/payments", label: "Payments" },
];

/** Section tabs for the billing module (horizontally scrollable on phones). */
export function BillingNav({ active }: { active: string }) {
  return (
    <nav aria-label="Billing sections" className="no-print -mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {TABS.map((t) => {
          const on = t.href === active;
          return (
            <li key={t.href}>
              <Link href={t.href} aria-current={on ? "page" : undefined}
                className={cx("-mb-px inline-block border-b-2 px-3 py-2 text-sm font-medium",
                  on ? "border-brand-600 text-brand-700 dark:text-brand-300" : "border-transparent text-ink-soft hover:border-line hover:text-ink")}>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
