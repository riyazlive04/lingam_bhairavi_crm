import { count, desc } from "drizzle-orm";
import { Database, Settings2 } from "lucide-react";
import { getDb, isDemoDatabase } from "@/db";
import { agentRuns, customers, emailOutbox, items, projects, quotations, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { smtpConfigured } from "@/lib/email";
import { fmtDateTime } from "@/lib/format";
import { Flash } from "@/components/ui";
import { KeyValueGrid, Metric, MetricStrip, SectionCard, StatusPill, statusLabel } from "@/components/patterns";

export const metadata = { title: "System" };

function Check({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return <StatusPill semantic={ok ? "success" : "warning"} label={ok ? yes : no} />;
}

export default async function SystemPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requireUser("settings");
  const sp = await searchParams;
  const db = await getDb();
  const demo = isDemoDatabase();
  const smtp = smtpConfigured();
  // booleans only; never render secret values
  const cron = !!process.env.CRON_SECRET;
  const authSecret = !!process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 32;

  const cnt = (rows: { n: number }[]) => Number(rows[0]?.n ?? 0);
  const [nUsers, nCustomers, nItems, nQuotes, nProjects, nEmails, lastRun] = await Promise.all([
    db.select({ n: count() }).from(users).then(cnt),
    db.select({ n: count() }).from(customers).then(cnt),
    db.select({ n: count() }).from(items).then(cnt),
    db.select({ n: count() }).from(quotations).then(cnt),
    db.select({ n: count() }).from(projects).then(cnt),
    db.select({ n: count() }).from(emailOutbox).then(cnt),
    db.select({ startedAt: agentRuns.startedAt, status: agentRuns.status, trigger: agentRuns.trigger }).from(agentRuns).orderBy(desc(agentRuns.startedAt)).limit(1),
  ]);

  return (
    <>
      <div className="space-y-4">
        <Flash ok={sp.ok} err={sp.err} />
        <SectionCard title="Configuration" icon={Settings2} description="Secrets live in the hosting environment variables and are never shown here.">
          <KeyValueGrid
            items={[
              {
                label: "Database",
                value: <Check ok={!demo} yes="Postgres (production)" no="Embedded demo database" />,
                hint: demo ? "Set DATABASE_URL to use the production database." : undefined,
              },
              { label: "Email (Office 365 SMTP)", value: <Check ok={smtp} yes="Configured, emails are sent" no="Not configured, emails are only logged" /> },
              { label: "Automation cron secret", value: <Check ok={cron} yes="Set" no="Not set, so scheduled agents cannot run" /> },
              { label: "Session signing secret", value: <Check ok={authSecret} yes="Set" no="Using the development default. Set AUTH_SECRET" /> },
              { label: "Environment", value: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown" },
              {
                label: "Last agent run",
                value: lastRun[0]
                  ? <span className="inline-flex flex-wrap items-center gap-2">{fmtDateTime(lastRun[0].startedAt)} · {lastRun[0].trigger} <StatusPill status={lastRun[0].status} label={statusLabel(lastRun[0].status)} /></span>
                  : "Never",
              },
            ]}
          />
        </SectionCard>
        <SectionCard title="Data" icon={Database} description="Record counts in this database.">
          <MetricStrip className="lg:grid-cols-3">
            <Metric label="Users" value={nUsers} />
            <Metric label="Customers" value={nCustomers} />
            <Metric label="Items" value={nItems} />
            <Metric label="Quotations" value={nQuotes} />
            <Metric label="Projects" value={nProjects} />
            <Metric label="Emails in outbox" value={nEmails} />
          </MetricStrip>
        </SectionCard>
      </div>
    </>
  );
}
