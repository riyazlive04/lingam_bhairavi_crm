import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { canWrite } from "@/lib/rbac";
import { Flash } from "@/components/ui";
import { FormPage } from "@/components/patterns";
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
    <FormPage title="New item" subtitle="Add an item to the price master." back={{ href: "/items", label: "Item and price master" }} notices={<Flash err={sp.err} />}>
      <ItemForm action={createItem} groups={groups} makes={makes} cancelHref="/items" />
    </FormPage>
  );
}
