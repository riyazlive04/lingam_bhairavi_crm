import "server-only";
import { asc, ne } from "drizzle-orm";
import type { DB } from "@/db";
import { projects } from "@/db/schema";
import { EXPENSE_CATEGORIES } from "@/lib/constants";

export const categoryLabel = (k: string) => EXPENSE_CATEGORIES[k as keyof typeof EXPENSE_CATEGORIES] ?? k;

/** Projects that can still receive expenses (everything except closed). */
export function bookableProjects(db: DB) {
  return db
    .select({ id: projects.id, code: projects.code, name: projects.name })
    .from(projects)
    .where(ne(projects.status, "closed"))
    .orderBy(asc(projects.code));
}

/** First / last day bounds for a 'YYYY-MM' month; null when invalid. */
export function monthBounds(month: string | undefined) {
  if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { from: `${month}-01`, toExcl: `${next}-01` };
}
