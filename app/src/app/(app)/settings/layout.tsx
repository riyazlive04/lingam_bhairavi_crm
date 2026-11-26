import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { RouteTabs } from "@/components/patterns";

const SECTIONS = [
  { label: "Company and pricing", href: "/settings" },
  { label: "Users", href: "/settings/users" },
  { label: "System", href: "/settings/system" },
  { label: "Audit log", href: "/settings/audit" },
];

/** Settings header (the one h1 for every settings route) and the section tabs. */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireUser("settings");
  return (
    <div className="max-w-5xl">
      <PageHeader title="Settings" subtitle="Company details, pricing rules, users and system health. Owner and admin only." />
      <RouteTabs label="Settings sections" items={SECTIONS} className="mb-4" />
      {children}
    </div>
  );
}
