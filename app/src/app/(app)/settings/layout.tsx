import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";

/** Settings header (the one h1 for every settings route). Each page renders <SettingsTabs /> first. */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireUser("settings");
  return (
    <div className="max-w-5xl">
      <PageHeader title="Settings" subtitle="Company details, pricing rules, users and system health. Owner and admin only." />
      {children}
    </div>
  );
}
