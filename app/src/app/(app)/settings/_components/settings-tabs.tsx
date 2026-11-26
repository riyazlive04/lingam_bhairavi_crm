import { Tabs } from "@/components/patterns";

const ITEMS = [
  { id: "company", label: "Company and pricing", href: "/settings" },
  { id: "users", label: "Users", href: "/settings/users" },
  { id: "system", label: "System", href: "/settings/system" },
  { id: "audit", label: "Audit log", href: "/settings/audit" },
];

export type SettingsTab = "company" | "users" | "system" | "audit";

/**
 * Section tabs for the settings routes. Each page renders it first (the layout cannot know the
 * current route on the server), so the order is: layout header, tabs, page content.
 */
export function SettingsTabs({ active }: { active: SettingsTab }) {
  return <Tabs label="Settings sections" items={ITEMS} active={active} className="mb-4" />;
}
