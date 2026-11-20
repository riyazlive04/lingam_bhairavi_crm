import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { SYSTEMS } from "@/lib/constants";
import { Flash, PageHeader } from "@/components/ui";
import { saveTemplate } from "../actions";
import { TemplateEditor } from "../_components/template-editor";
import { loadPickerItems } from "../../quotations/_lib/data";

export const metadata = { title: "New BOQ template" };

export default async function NewTemplatePage({ searchParams }: { searchParams: Promise<{ system?: string; err?: string }> }) {
  const user = await requireUser("boq");
  if (!canWrite(user.role, "boq")) redirect("/forbidden");
  const db = await getDb();
  const sp = await searchParams;
  const items = await loadPickerItems(db);
  const system = sp.system && sp.system in SYSTEMS ? sp.system : "hydrant_sprinkler";
  return (
    <div>
      <PageHeader title="New BOQ template" back={{ href: "/boq-templates", label: "BOQ templates" }} />
      <Flash err={sp.err} />
      <TemplateEditor action={saveTemplate} template={{ name: "", system, description: "", active: true }} initialLines={[]} items={items} />
    </div>
  );
}
