import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { Flash } from "@/components/ui";
import { FormPage } from "@/components/patterns";
import { ProjectForm } from "../../_components/project-form";
import { projectAccess } from "../../_lib/access";

export default async function EditProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }> }) {
  const user = await requireUser("projects");
  const { id } = await params;
  const sp = await searchParams;
  const pid = Number(id);
  if (!Number.isInteger(pid) || pid <= 0) notFound();
  const db = await getDb();
  const [p] = await db.select().from(projects).where(eq(projects.id, pid)).limit(1);
  if (!p) notFound();
  const acc = projectAccess(user, p);
  if (!acc.edit) redirect("/forbidden");
  return (
    <FormPage eyebrow={p.code} title={`Edit ${p.name}`} back={{ href: `/projects/${p.id}`, label: "Costing sheet" }} notices={<Flash err={sp.err} />}>
      <ProjectForm db={db} values={p} showFinancials={acc.full} canAssign={user.role === "admin"} />
    </FormPage>
  );
}
