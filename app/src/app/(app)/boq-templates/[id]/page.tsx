import { notFound } from "next/navigation";
import { asc, count, eq, inArray } from "drizzle-orm";
import { Copy, Eye, EyeOff, FileText, Pencil, Trash2 } from "lucide-react";
import { getDb } from "@/db";
import { boqTemplateLines, boqTemplates, items, quotations } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canSeeCost, canWrite } from "@/lib/rbac";
import { SYSTEMS, type SystemKey } from "@/lib/constants";
import { money, qty } from "@/lib/format";
import { getPricingSettings, suggestRates } from "@/lib/pricing";
import { groupBySection } from "@/lib/quotations";
import { Flash, LinkButton } from "@/components/ui";
import { Callout, ConfirmButton, DetailPage, KeyValueGrid, MetaChip, ResponsiveTable, SectionCard, StatusPill, type Column } from "@/components/patterns";
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

  type L = (typeof lines)[number];
  const rateOf = (l: L) => {
    const it = l.itemId != null ? itemMap.get(l.itemId) : undefined;
    return { it, r: it ? suggestRates(it, pricing.defaultMarkupPct) : null };
  };
  const columns: Column<L>[] = [
    { key: "ref", header: "BOQ ref", nowrap: true, card: "hidden", className: "font-mono text-caption", cell: (l) => l.boqRef ?? "" },
    { key: "desc", header: "Description", card: "title", className: "min-w-[18rem] max-w-xl whitespace-pre-line",
      cell: (l) => <>{l.boqRef && <span className="mr-1 font-mono text-caption text-ink-faint sm:hidden">{l.boqRef}</span>}{l.description}</> },
    { key: "item", header: "Linked item", card: "subtitle", className: "text-caption",
      cell: (l) => {
        const { it } = rateOf(l);
        return it ? <><span className="font-mono">{it.code}</span><span className="block text-ink-soft">{it.name}</span></> : <StatusPill semantic="warning" label="Free text" noDot />;
      } },
    { key: "uom", header: "UOM", cell: (l) => l.uom },
    { key: "qty", header: "Default qty", align: "right", card: "amount", cell: (l) => qty(l.defaultQty) },
    ...(showCost ? [{ key: "cost", header: "Latest cost", align: "right" as const, nowrap: true, priority: 3 as const, cell: (l: L) => { const { r } = rateOf(l); return r ? money(r.costRate) : "-"; } }] : []),
    { key: "supply", header: "Supply rate", align: "right", nowrap: true, cell: (l) => { const { r } = rateOf(l); return r ? money(r.supplyRate) : "-"; } },
    { key: "erection", header: "Erection rate", align: "right", nowrap: true, priority: 3, cell: (l) => { const { r } = rateOf(l); return r ? money(r.erectionRate) : "-"; } },
  ];
  const groups = groupBySection(lines);
  const systemLabel = SYSTEMS[t.system as SystemKey] ?? t.system;
  const rateNote = `Supply rate is shown at the default markup of ${pricing.defaultMarkupPct}% over the latest purchase cost. Each quotation can set its own markup.`;

  return (
    <DetailPage
      back={{ href: "/boq-templates", label: "BOQ templates" }}
      eyebrow="BOQ template"
      title={t.name}
      status={<StatusPill semantic={t.active ? "success" : "neutral"} label={t.active ? "Active" : "Inactive"} />}
      meta={<>
        <MetaChip label="System">{systemLabel}</MetaChip>
        <MetaChip label="Lines">{lines.length}</MetaChip>
        <MetaChip label="Used in">{Number(used)} quotation{Number(used) === 1 ? "" : "s"}</MetaChip>
      </>}
      primaryAction={canWrite(user.role, "quotations") && <LinkButton href={`/quotations/new?templateId=${t.id}`}><FileText className="icon-sm" aria-hidden /> New quotation</LinkButton>}
      secondaryActions={writable && <>
        <LinkButton href={`/boq-templates/${t.id}/edit`} variant="secondary"><Pencil className="icon-sm" aria-hidden /> Edit template</LinkButton>
        <form action={duplicateTemplate}>
          <input type="hidden" name="id" value={t.id} />
          <SubmitButton variant="secondary" pendingText="Duplicating…"><Copy className="icon-sm" aria-hidden /> Duplicate</SubmitButton>
        </form>
      </>}
      moreActions={writable && <>
        <form action={toggleTemplateActive}>
          <input type="hidden" name="id" value={t.id} />
          <SubmitButton variant="ghost" pendingText="Saving…">
            {t.active ? <><EyeOff className="icon-sm" aria-hidden /> Deactivate template</> : <><Eye className="icon-sm" aria-hidden /> Activate template</>}
          </SubmitButton>
        </form>
        <form action={deleteTemplate}>
          <input type="hidden" name="id" value={t.id} />
          <ConfirmButton variant="ghost" className="text-danger" confirmVariant="danger" stacked pendingText="Deleting…"
            confirmLabel={Number(used) > 0 ? "Yes, deactivate it" : "Yes, delete template"}
            confirm={Number(used) > 0 ? "Quotations use this template, so it will be deactivated instead of deleted. Continue?" : "Delete this template permanently? This cannot be undone."}>
            <Trash2 className="icon-sm" aria-hidden /> Delete template
          </ConfirmButton>
        </form>
      </>}
      notices={<>
        <Flash ok={sp.ok} err={sp.err} />
        {unlinked > 0 && (
          <Callout tone="info" title={`${unlinked} free text line${unlinked === 1 ? "" : "s"}`}>
            These lines are not linked to the item master, so they are priced by hand in each quotation.
          </Callout>
        )}
      </>}
      aside={
        <SectionCard title="Details">
          <KeyValueGrid columns={1} items={[
            { label: "System", value: systemLabel },
            { label: "Status", value: t.active ? "Active, shown when creating quotations" : "Inactive, hidden from new quotations" },
            { label: "Lines", value: `${lines.length} (${unlinked} free text)` },
            { label: "Used in quotations", value: String(Number(used)) },
            { label: "Description", value: t.description },
          ]} />
        </SectionCard>
      }
    >
      {lines.length === 0 ? (
        <SectionCard title="Bill of quantities" count={0}
          actions={writable && <LinkButton href={`/boq-templates/${t.id}/edit`} size="sm">Add lines</LinkButton>}
          empty="This template has no lines yet. Edit it to add items from the item master." />
      ) : groups.map((g) => (
        <SectionCard key={g.section || "_"} title={g.section || "Bill of quantities"} count={g.lines.length} flush description={groups.length === 1 || g === groups[0] ? rateNote : undefined}>
          <ResponsiveTable flush rows={g.lines} columns={columns} rowKey={(l) => l.id} caption={g.section || "Template lines"} />
        </SectionCard>
      ))}
    </DetailPage>
  );
}
