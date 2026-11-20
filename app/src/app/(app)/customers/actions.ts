"use server";
import { publicError } from "@/lib/errors";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { customers } from "@/db/schema";
import { requireWrite } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { firstErr, formObj, optStr, partyBase } from "../vendors/_components/party-schema";

const customerSchema = z.object({
  ...partyBase,
  type: z.enum(["customer", "consultant", "builder"]),
  state: optStr(60),
  creditLimit: z.coerce.number().min(0).default(0),
});

export async function createCustomer(fd: FormData) {
  const user = await requireWrite("customers");
  const p = customerSchema.safeParse(formObj(fd));
  if (!p.success) redirect("/customers/new?err=" + encodeURIComponent(firstErr(p.error)));
  const db = await getDb();
  let target: string;
  try {
    const dup = await db.select({ id: customers.id }).from(customers).where(sql`lower(${customers.name}) = lower(${p.data.name})`);
    if (dup.length) throw new Error(`A customer named “${p.data.name}” already exists`);
    const [c] = await db.insert(customers).values({ ...p.data, autoReminders: fd.get("autoReminders") === "on" }).returning({ id: customers.id });
    await audit(db, user.id, "create", "customer", c.id, { name: p.data.name });
    target = `/customers/${c.id}?ok=` + encodeURIComponent("Customer created");
  } catch (e) {
    target = "/customers/new?err=" + encodeURIComponent(publicError(e, "Could not create customer"));
  }
  revalidatePath("/customers");
  redirect(target);
}

export async function updateCustomer(id: number, fd: FormData) {
  const user = await requireWrite("customers");
  const p = customerSchema.safeParse(formObj(fd));
  if (!p.success) redirect(`/customers/${id}/edit?err=` + encodeURIComponent(firstErr(p.error)));
  const db = await getDb();
  let target: string;
  try {
    const r = await db.update(customers)
      .set({ ...p.data, autoReminders: fd.get("autoReminders") === "on", active: fd.get("active") === "on" })
      .where(eq(customers.id, id)).returning({ id: customers.id });
    if (!r.length) throw new Error("Customer not found");
    await audit(db, user.id, "update", "customer", id, p.data);
    target = `/customers/${id}?ok=` + encodeURIComponent("Customer updated");
  } catch (e) {
    target = `/customers/${id}/edit?err=` + encodeURIComponent(publicError(e, "Could not update customer"));
  }
  revalidatePath("/customers");
  redirect(target);
}
