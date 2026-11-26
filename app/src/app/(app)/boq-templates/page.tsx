import Link from "next/link";
import { and, asc, count, eq, ilike, or, type SQL } from "drizzle-orm";
import { Plus } from "lucide-react";
import { getDb } from "@/db";
import { boqTemplateLines, boqTemplates } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { SYSTEMS, type SystemKey } from "@/lib/constants";
import { Flash, LinkButton, Select } from "@/components/ui";
import { FilterPills, ListEmpty, ListFilters, ListPage, ResponsiveTable, SectionCard, StatusPill, type Column } from "@/components/patterns";

export const metadata = { title: "BOQ templates" };

export default async function BoqTemplatesPage({ searchParams }: { searchParams: Promise<{ q?: string; system?: string; show?: string; ok?: string; err?: string }> }) {
  const user = await requireUser("boq");
  const db = await getDb();
  const sp = await searchParams;
  const writable = canWrite(user.role, "boq");

  const conds: SQL[] = [];
  if (sp.system && sp.system in SYSTEMS) conds.push(eq(boqTemplates.system, sp.system));
  if (sp.show !== "all") conds.push(eq(boqTemplates.active, true));
  if (sp.q?.trim()) {
    const like = `%${sp.q.trim()}%`;
    const c = or(ilike(boqTemplates.name, like), ilike(boqTemplates.description, like));
    if (c) conds.push(c);
  }

  const rows = await db
    .select({
      id: boqTemplates.id, name: boqTemplates.name, system: boqTemplates.system, description: boqTemplates.description,
      active: boqTemplates.active, lines: count(boqTemplateLines.id),
    })
    .from(boqTemplates)
    .leftJoin(boqTemplateLines, eq(boqTemplateLines.templateId, boqTemplates.id))
    .where(conds.length ? and(...conds) : undefined)
    .groupBy(boqTemplates.id)
    .orderBy(asc(boqTemplates.system), asc(boqTemplates.name));

  const bySystem = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = bySystem.get(r.system) ?? [];
    arr.push(r);
    bySystem.set(r.system, arr);
  }

  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: sp.q, system: sp.system, show: sp.show, ...patch })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/boq-templates?${s}` : "/boq-templates";
  };
  const activeFilters = [sp.q?.trim(), sp.system].filter(Boolean).length;
  const quoteWrite = canWrite(user.role, "quotations");

  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    {
      key: "name", header: "Template", card: "title", className: "max-w-xl whitespace-normal",
      cell: (t) => (
        <>
          <Link href={`/boq-templates/${t.id}`} className="rt-stretch font-medium text-brand-700 hover:underline dark:text-brand-300">{t.name}</Link>
          {t.description && <p className="mt-0.5 line-clamp-2 text-caption font-normal text-ink-soft">{t.description}</p>}
        </>
      ),
    },
    { key: "lines", header: "Lines", align: "right", card: "amount", cell: (t) => <>{Number(t.lines)}<span className="sm:hidden"> lines</span></> },
    { key: "status", header: "Status", card: "badge", cell: (t) => <StatusPill semantic={t.active ? "success" : "neutral"} label={t.active ? "Active" : "Inactive"} /> },
    ...((quoteWrite || writable) ? [{
      key: "actions", header: <span className="sr-only">Actions</span>, label: "Actions", card: "actions" as const, align: "right" as const,
      cell: (t: Row) => (
        <div className="flex justify-end gap-2 max-sm:justify-start">
          {quoteWrite && <LinkButton href={`/quotations/new?templateId=${t.id}`} variant="secondary" size="sm">Quote with this</LinkButton>}
          {writable && <LinkButton href={`/boq-templates/${t.id}/edit`} variant="ghost" size="sm">Edit</LinkButton>}
        </div>
      ),
    }] : []),
  ];

  return (
    <ListPage
      title="BOQ templates"
      subtitle="Standard bills of quantities for each system. Pick one when you create a quotation and just enter the quantities."
      primaryAction={writable && <LinkButton href="/boq-templates/new"><Plus className="icon-sm" aria-hidden /> New template</LinkButton>}
      notices={<Flash ok={sp.ok} err={sp.err} />}
      filters={
        <>
          <FilterPills label="Filter by status" items={[
            { label: "Active", href: qs({ show: undefined }), active: sp.show !== "all" },
            { label: "Include inactive", href: qs({ show: "all" }), active: sp.show === "all" },
          ]} />
          <ListFilters q={sp.q} placeholder="Search templates" clearHref={qs({ q: undefined, system: undefined })} activeCount={activeFilters} hidden={{ show: sp.show }}>
            <Select name="system" defaultValue={sp.system ?? ""} aria-label="System">
              <option value="">All systems</option>
              {Object.entries(SYSTEMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </ListFilters>
        </>
      }
      isEmpty={rows.length === 0}
      empty={
        <ListEmpty filtered={activeFilters > 0} noun="BOQ templates" clearHref={qs({ q: undefined, system: undefined })}
          action={writable && <LinkButton href="/boq-templates/new"><Plus className="icon-sm" aria-hidden /> Create the first template</LinkButton>}>
          Templates hold the standard line items (pumps, pipes, valves and so on) for a system, so quotations are never missing a line.
        </ListEmpty>
      }
      resultSummary={`${rows.length} template${rows.length === 1 ? "" : "s"}`}
    >
      <div className="space-y-4">
        {[...bySystem.entries()].map(([sys, list]) => (
          <SectionCard key={sys} title={SYSTEMS[sys as SystemKey] ?? sys} count={list.length} flush>
            <ResponsiveTable flush rows={list} columns={columns} rowKey={(t) => t.id} caption={`${SYSTEMS[sys as SystemKey] ?? sys} templates`} />
          </SectionCard>
        ))}
      </div>
    </ListPage>
  );
}
