"use client";
/**
 * Tabs for sections that are separate routes, rendered once in a layout (client: reads the pathname).
 * The active tab is the item whose href matches the current path, the longest match winning, so
 * "/settings/users/12" highlights "Users" and "/settings" only matches itself or its unlisted children.
 * Maintainer: Sirah Digital.
 */
import { usePathname } from "next/navigation";
import { Tabs, type TabItem } from "./tabs";

export type RouteTabItem = Omit<TabItem, "href" | "id"> & { href: string; id?: string };

/** Index of the item that owns `pathname` (longest matching href), or -1. Pure, exported for tests. */
export function activeRouteIndex(pathname: string, hrefs: string[]): number {
  let best = -1, bestLen = -1;
  hrefs.forEach((h, i) => {
    const hit = pathname === h || pathname.startsWith(h.endsWith("/") ? h : `${h}/`);
    if (hit && h.length > bestLen) { best = i; bestLen = h.length; }
  });
  return best;
}

/**
 * @example
 * // app/(app)/settings/layout.tsx
 * <RouteTabs label="Settings sections" items={[
 *   { label: "Company and pricing", href: "/settings" },
 *   { label: "Users", href: "/settings/users" },
 * ]} />
 */
export function RouteTabs({ items, label = "Sections", className }: { items: RouteTabItem[]; label?: string; className?: string }) {
  const pathname = usePathname() ?? "";
  const tabs: TabItem[] = items.map((t) => ({ ...t, id: t.id ?? t.href }));
  const i = activeRouteIndex(pathname, items.map((t) => t.href));
  return <Tabs label={label} items={tabs} active={i >= 0 ? tabs[i].id : ""} className={className} />;
}
