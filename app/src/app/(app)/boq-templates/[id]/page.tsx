import { notFound } from "next/navigation";
import { asc, count, eq, inArray } from "drizzle-orm";
import { Copy, FileText, Pencil } from "lucide-react";
import { getDb } from "@/db";
import { boqTemplateLines, boqTemplates, items, quotations } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canSeeCost, canWrite } from "@/lib/rbac";
import { SYSTEMS, type SystemKey } from "@/lib/constants";
import { money, qty } from "@/lib/format";
import { getPricingSettings, suggestRates } from "@/lib/pricing";
import { groupBySection } from "@/lib/quotations";
import { Badge, Card, DL, EmptyState, Flash, LinkButton, PageHeader, Table, Td, Th } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { deleteTemplate, duplicateTemplate, toggleTemplateActive } from "../actions";

export const metadata = { title: "BOQ template" };

export default async function TemplateDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const user = await requireUser("boq");
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const db = await getDb();
  const sp = await searchParams;
  const [t] = await db.select().from(boqTemplates).where(eq(boqTemplates.id, id));
  if (!t) notFound();
  const lines = await db.select().from(boqTemplateLines).where(eq(boqTemplateLines.templateId, id)).orderBy(asc(boqTemplateLines.sortOrder), asc(boqTemplateLines.id));
  const itemIds = [...new Set(lines.map((l) => l.itemId).filter((x): x is number => x != null))];
  const itemRows = itemIds.length ? await db.select().from(items).where(inArray(items.id, itemIds)) : [];
  const itemMap = new Map(itemRows.map((i) => [i.id, i]));
  const pricing = await getPricingSettings(db);
  const [{ used }] = await db.select({ used: count() }).from(quotations).where(eq(quotations.templateId, id));
  const writable = canWrite(user.role, "boq");
  const showCost = canSeeCost(user.role);
  const unlinked = lines.filter((l) => l.itemId == null).length;

  return (
    <div>
      <PageHeader
        title={t.name}
        subtitle={SYSTEMS[t.system as SystemKey] ?? t.system}
        back={{ href: "/boq-templates", label: "BOQ templates" }}
        actions={<>
          {canWrite(user.role, "quotations") && <LinkButton href={`/quotations/new?templateId=${t.id}`}><FileText className="h-4 w-4" aria-hidden /> New quotation</LinkButton>}
          {writable && <LinkButton href={`/boq-templates/${t.id}/edit`} variant="secondary"><Pencil className="h-4 w-4" aria-hidden /> Edit</LinkButton>}
          {writable && (
            <form action={duplicateTemplate}>
              <input type="hidden" name="id" value={t.id} />
              <SubmitButton variant="secondary" pendingText="Duplicating…"><Copy className="h-4 w-4" aria-hidden /> Duplicate</SubmitButton>
            </form>
          )}
        </>}
      />
      <Flash ok={sp.ok} err={sp.err} />

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card title="Details" className="lg:col-span-2">
          <DL items={[
            ["System", SYSTEMS[t.system as SystemKey] ?? t.system],
            ["Status", t.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>],
            ["Lines", `${lines.length} (${unlinked} free-text)`],
            ["Used in quotations", String(Number(used))],
            ["Description", t.description || "—"],
          ]} />
        </Card>
        {writable && (
          <Card title="Manage">
            <div className="flex flex-col gap-2">
              <form action={toggleTemplateActive}>
                <input type="hidden" name="id" value={t.id} />
                <SubmitButton variant="secondary" className="w-full">{t.active ? "Deactivate" : "Activate"}</SubmitButton>
              </form>
              <form action={deleteTemplate}>
                <input type="hidden" name="id" value={t.id} />
                <SubmitButton variant="danger" className="w-full" pendingText="Deleting…"
                  confirm={Number(used) > 0 ? "This template is used by quotations — it will be deactivated instead. Continue?" : "Delete this template permanently?"}>
                  Delete template
                </SubmitButton>
              </form>
            </div>
          </Card>
        )}
      </div>

      {lines.length === 0 ? (
        <EmptyState title="This template has no lines" action={writable && <LinkButton href={`/boq-templates/${t.id}/edit`}>Add lines</LinkButton>} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>BOQ Ref</Th><Th>Description</Th><Th>Linked item</Th><Th>UOM</Th><Th className="text-right">Default qty</Th>
              {showCost && <Th className="text-right">Latest cost</Th>}
              <Th className="text-right">Supply rate*</Th><Th className="text-right">Erection rate</Th>
            </tr>
          </thead>
          <tbody>
            {groupBySection(lines).map((g) => (
              <SectionRows key={g.section || "_"} section={g.section} colSpan={showCost ? 8 : 7}>
                {g.lines.map((l) => {
                  const it = l.itemId != null ? itemMap.get(l.itemId) : undefined;
                  const r = it ? suggestRates(it, pricing.defaultMarkupPct) : null;
                  return (
                    <tr key={l.id}>
                      <Td className="whitespace-nowrap font-mono text-xs">{l.boqRef ?? ""}</Td>
                      <Td className="min-w-[18rem] max-w-xl whitespace-pre-line">{l.description}</Td>
                      <Td className="text-xs">{it ? <><span className="font-mono">{it.code}</span><br /><span className="text-ink-soft">{it.name}</span></> : <Badge tone="amber">Free text</Badge>}</Td>
                      <Td>{l.uom}</Td>
                      <Td className="text-right tabular-nums">{qty(l.defaultQty)}</Td>
                      {showCost && <Td className="text-right tabular-nums">{r ? money(r.costRate) : "—"}</Td>}
                      <Td className="text-right tabular-nums">{r ? money(r.supplyRate) : "—"}</Td>
                      <Td className="text-right tabular-nums">{r ? money(r.erectionRate) : "—"}</Td>
                    </tr>
                  );
                })}
              </SectionRows>
            ))}
          </tbody>
        </Table>
      )}
      <p className="mt-2 text-xs text-ink-soft">* Supply rate shown at the default markup of {pricing.defaultMarkupPct}% over the latest purchase cost; each quotation can set its own markup.</p>
    </div>
  );
}

function SectionRows({ section, colSpan, children }: { section: string; colSpan: number; children: React.ReactNode }) {
  return (
    <>
      {section && (
        <tr>
          <td colSpan={colSpan} className="border-b border-line bg-muted/60 px-3 py-2 text-sm font-semibold text-ink">{section}</td>
        </tr>
      )}
      {children}
    </>
  );
}
