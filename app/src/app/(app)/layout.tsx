import { and, count, eq, inArray, isNull, or } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { StartupDigest } from "@/components/startup-digest";
import { requireUser } from "@/lib/auth";
import { getDb, isDemoDatabase } from "@/db";
import { alerts } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const db = await getDb();
  const roles = user.role === "admin" ? undefined : [user.role];
  const [{ n }] = await db
    .select({ n: count() })
    .from(alerts)
    .where(and(eq(alerts.status, "open"),
      roles ? or(inArray(alerts.assignedRole, roles), eq(alerts.assignedUserId, user.id), isNull(alerts.assignedRole)) : undefined));
  return (
    <AppShell user={{ name: user.name, role: user.role }} alertCount={Number(n)} demo={isDemoDatabase()}>
      <StartupDigest user={user} />
      {children}
    </AppShell>
  );
}
