import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { items } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { Flash, PageHeader } from "@/components/ui";
import { ItemForm } from "../../_components/item-form";
import { itemLookups } from "../../_components/item-lookups";
import { updateItem } from "../../actions";

export default async function EditItemPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }> }) {
  const user = await requireUser("items");
  if (!canWrite(user.role, "items")) redirect("/forbidden");
  const { id } = await params;
  const sp = await searchParams;
  const itemId = Number(id);
  if (!Number.isInteger(itemId)) notFound();
  const db = await getDb();
  const [item] = await db.select().from(items).where(eq(items.id, itemId));
  if (!item) notFound();
  const { groups, makes } = await itemLookups(db);
  return (
    <div className="max-w-4xl">
      <PageHeader title={`Edit ${item.code}`} subtitle={item.name} back={{ href: `/items/${item.id}`, label: item.name }} />
      <Flash err={sp.err} />
      <ItemForm action={updateItem.bind(null, item.id)} item={item} groups={groups} makes={makes} cancelHref={`/items/${item.id}`} />
    </div>
  );
}
