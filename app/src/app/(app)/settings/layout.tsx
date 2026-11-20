import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { SettingsNav } from "./_components/settings-nav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  await requireUser("settings");
  return (
    <div className="max-w-5xl">
      <PageHeader title="Settings" subtitle="Owner / admin only." />
      <SettingsNav />
      {children}
    </div>
  );
}
