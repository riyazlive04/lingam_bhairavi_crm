import "server-only";
import { asc, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { items } from "@/db/schema";

/** Distinct groups and makes for form datalists. */
export async function itemLookups(db: DB) {
  const [groups, makes] = await Promise.all([
    db.selectDistinct({ v: items.groupName }).from(items).orderBy(asc(items.groupName)),
    db.selectDistinct({ v: items.make }).from(items).where(sql`${items.make} is not null`).orderBy(asc(items.make)),
  ]);
  return { groups: groups.map((g) => g.v), makes: makes.map((m) => m.v).filter((m): m is string => !!m) };
}
