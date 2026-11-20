import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { Flash, PageHeader } from "@/components/ui";
import { ItemForm } from "../_components/item-form";
import { itemLookups } from "../_components/item-lookups";
import { createItem } from "../actions";

export default async function NewItemPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const user = await requireUser("items");
  if (!canWrite(user.role, "items")) redirect("/forbidden");
  const sp = await searchParams;
  const db = await getDb();
  const { groups, makes } = await itemLookups(db);
  return (
    <div className="max-w-4xl">
      <PageHeader title="New item" back={{ href: "/items", label: "Item & Price Master" }} />
      <Flash err={sp.err} />
      <ItemForm action={createItem} groups={groups} makes={makes} cancelHref="/items" />
    </div>
  );
}
