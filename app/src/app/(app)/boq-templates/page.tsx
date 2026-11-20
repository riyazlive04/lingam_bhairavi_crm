import Link from "next/link";
import { and, asc, count, eq, ilike, or, type SQL } from "drizzle-orm";
import { Plus } from "lucide-react";
import { getDb } from "@/db";
import { boqTemplateLines, boqTemplates } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { SYSTEMS, type SystemKey } from "@/lib/constants";
import { Badge, EmptyState, FilterBar, Flash, LinkButton, PageHeader, Select, Table, Td, Th } from "@/components/ui";

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

  return (
    <div>
      <PageHeader
        title="BOQ templates"
        subtitle="Standard bills of quantities for each system. Pick one when you create a quotation and just enter the quantities."
        actions={writable && <LinkButton href="/boq-templates/new"><Plus className="h-4 w-4" aria-hidden /> New template</LinkButton>}
      />
      <Flash ok={sp.ok} err={sp.err} />
      <FilterBar q={sp.q} placeholder="Search templates…">
        <Select name="system" defaultValue={sp.system ?? ""} className="sm:max-w-xs" aria-label="System">
          <option value="">All systems</option>
          {Object.entries(SYSTEMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select name="show" defaultValue={sp.show ?? ""} className="sm:max-w-[10rem]" aria-label="Show">
          <option value="">Active only</option>
          <option value="all">Include inactive</option>
        </Select>
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState title="No BOQ templates found" action={writable && <LinkButton href="/boq-templates/new">Create a template</LinkButton>}>
          Templates hold the standard line items (pumps, pipes, valves…) for a system so quotations are never missing a line.
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {[...bySystem.entries()].map(([sys, list]) => (
            <section key={sys} aria-labelledby={`sys-${sys}`}>
              <h2 id={`sys-${sys}`} className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-soft">
                {SYSTEMS[sys as SystemKey] ?? sys} <span className="font-normal">({list.length})</span>
              </h2>
              <Table>
                <thead>
                  <tr><Th>Template</Th><Th className="text-right">Lines</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr>
                </thead>
                <tbody>
                  {list.map((t) => (
                    <tr key={t.id} className="hover:bg-muted/50">
                      <Td className="max-w-xl whitespace-normal">
                        <Link href={`/boq-templates/${t.id}`} className="font-medium text-brand-700 hover:underline">{t.name}</Link>
                        {t.description && <p className="mt-0.5 line-clamp-2 text-xs text-ink-soft">{t.description}</p>}
                      </Td>
                      <Td className="text-right tabular-nums">{Number(t.lines)}</Td>
                      <Td>{t.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</Td>
                      <Td className="text-right">
                        <div className="flex justify-end gap-2">
                          {canWrite(user.role, "quotations") && <LinkButton href={`/quotations/new?templateId=${t.id}`} variant="secondary" size="sm">Quote with this</LinkButton>}
                          {writable && <LinkButton href={`/boq-templates/${t.id}/edit`} variant="ghost" size="sm">Edit</LinkButton>}
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
