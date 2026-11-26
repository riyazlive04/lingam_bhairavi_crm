import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { boqTemplateLines, boqTemplates } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { Flash } from "@/components/ui";
import { FormPage } from "@/components/patterns";
import { saveTemplate } from "../../actions";
import { TemplateEditor } from "../../_components/template-editor";
import { loadPickerItems } from "../../../quotations/_lib/data";

export const metadata = { title: "Edit BOQ template" };

export default async function EditTemplatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const user = await requireUser("boq");
  if (!canWrite(user.role, "boq")) redirect("/forbidden");
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const db = await getDb();
  const sp = await searchParams;
  const [t] = await db.select().from(boqTemplates).where(eq(boqTemplates.id, id));
  if (!t) notFound();
  const [lines, items] = await Promise.all([
    db.select().from(boqTemplateLines).where(eq(boqTemplateLines.templateId, id)).orderBy(asc(boqTemplateLines.sortOrder), asc(boqTemplateLines.id)),
    loadPickerItems(db),
  ]);
  return (
    <FormPage width="wide" eyebrow="Edit BOQ template" title={t.name} back={{ href: `/boq-templates/${id}`, label: t.name }} notices={<Flash ok={sp.ok} err={sp.err} />}>
      <TemplateEditor
        cancelHref={`/boq-templates/${id}`}
        action={saveTemplate}
        template={{ id: t.id, name: t.name, system: t.system, description: t.description ?? "", active: t.active }}
        initialLines={lines.map((l) => ({
          key: `l${l.id}`, section: l.section ?? "", boqRef: l.boqRef ?? "", itemId: l.itemId, description: l.description, uom: l.uom, defaultQty: l.defaultQty,
        }))}
        items={items}
      />
    </FormPage>
  );
}
