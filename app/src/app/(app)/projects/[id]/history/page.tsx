import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, projects } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getCompany } from "@/lib/billing";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { EmptyState, PageHeader } from "@/components/ui";
import { DocumentSheet } from "@/components/patterns";
import { projectAccess } from "../../_lib/access";
import { loadProjectHistory } from "../../_lib/history";
import { HistoryFeed, HistoryFilters, applyHistoryFilter, historyFilter, type HistorySP } from "../../_components/history-feed";

export const metadata = { title: "Project history" };

/** Printable project history: one chronological feed of everything that happened on the project. */
export default async function ProjectHistoryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<HistorySP> }) {
  const user = await requireUser("projects");
  const { id } = await params;
  const sp = await searchParams;
  const pid = Number(id);
  if (!Number.isInteger(pid) || pid <= 0) notFound();
  const db = await getDb();
  const [row] = await db
    .select({ p: projects, customerName: customers.name })
    .from(projects)
    .innerJoin(customers, eq(customers.id, projects.customerId))
    .where(eq(projects.id, pid))
    .limit(1);
  if (!row) notFound();
  const p = row.p;
  const acc = projectAccess(user, p);
  const back = { href: `/projects/${p.id}?tab=history`, label: `Back to ${p.name}` };

  if (!acc.spend) {
    return (
      <div>
        <PageHeader title="Project history" back={back} />
        <EmptyState title="History is for the site engineer and management">Ask the admin to assign you to this project if you need to see it.</EmptyState>
      </div>
    );
  }

  const [all, company] = await Promise.all([loadProjectHistory(db, p, user, acc.full), getCompany(db)]);
  const filter = historyFilter(sp);
  const events = applyHistoryFilter(all, filter);

  return (
    <DocumentSheet
      company={company}
      title="Project history"
      numberLabel="Project"
      number={p.code}
      date={fmtDate(new Date())}
      meta={[["Printed by", user.name], ["Printed at", fmtDateTime(new Date())]]}
      facts={[["Project", p.name], ["Customer", row.customerName], ...(p.siteAddress ? [["Site", p.siteAddress] as [string, string]] : []), ["Events", String(events.length)]]}
      toolbar={{ backHref: back.href, backLabel: back.label }}
    >
      <HistoryFilters action={`/projects/${p.id}/history`} events={all} filter={filter} />
      <HistoryFeed events={events} />
    </DocumentSheet>
  );
}
