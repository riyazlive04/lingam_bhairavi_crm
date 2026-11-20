import { count, desc } from "drizzle-orm";
import { getDb, isDemoDatabase } from "@/db";
import { agentRuns, customers, emailOutbox, items, projects, quotations, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { smtpConfigured } from "@/lib/email";
import { fmtDateTime } from "@/lib/format";
import { Badge, Card, DL } from "@/components/ui";

function Check({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return <Badge tone={ok ? "green" : "amber"}>{ok ? yes : no}</Badge>;
}

export default async function SystemPage() {
  await requireUser("settings");
  const db = await getDb();
  const demo = isDemoDatabase();
  const smtp = smtpConfigured();
  // booleans only — never render secret values
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
    <div className="space-y-6">
      <Card title="Configuration">
        <DL
          items={[
            ["Database", <span key="db" className="inline-flex flex-wrap items-center gap-2"><Check ok={!demo} yes="Postgres (production)" no="Embedded demo database" />{demo && <span className="text-xs text-ink-soft">Set DATABASE_URL to use the production database.</span>}</span>],
            ["Email (Office 365 SMTP)", <span key="smtp" className="inline-flex flex-wrap items-center gap-2"><Check ok={smtp} yes="Configured — emails are sent" no="Not configured — emails are only logged" /></span>],
            ["Automation cron secret", <Check key="cron" ok={cron} yes="Set" no="Not set — scheduled agents cannot run" />],
            ["Session signing secret", <Check key="auth" ok={authSecret} yes="Set" no="Using development default — set AUTH_SECRET" />],
            ["Environment", process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown"],
            ["Last agent run", lastRun[0] ? `${fmtDateTime(lastRun[0].startedAt)} · ${lastRun[0].trigger} · ${lastRun[0].status}` : "Never"],
          ]}
        />
        <p className="mt-4 text-xs text-ink-soft">Secrets are configured in the hosting environment variables and are never shown here.</p>
      </Card>
      <Card title="Data">
        <DL
          items={[
            ["Users", String(nUsers)],
            ["Customers", String(nCustomers)],
            ["Items", String(nItems)],
            ["Quotations", String(nQuotes)],
            ["Projects", String(nProjects)],
            ["Emails in outbox", String(nEmails)],
          ]}
        />
      </Card>
    </div>
  );
}
