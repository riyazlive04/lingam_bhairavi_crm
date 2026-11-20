"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

const TABS = [
  { href: "/settings", label: "Company & pricing" },
  { href: "/settings/users", label: "Users" },
  { href: "/settings/system", label: "System" },
  { href: "/settings/audit", label: "Audit log" },
];

export function SettingsNav() {
  const path = usePathname();
  return (
    <nav aria-label="Settings sections" className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-line px-1">
      {TABS.map((t) => {
        const active = t.href === "/settings" ? path === "/settings" : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
              active ? "border-brand-600 text-brand-700 dark:text-brand-300" : "border-transparent text-ink-soft hover:text-ink",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
