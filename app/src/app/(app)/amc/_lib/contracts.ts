import "server-only";
import { and, eq } from "drizzle-orm";
import type { DB } from "@/db";
import { amcContracts, amcVisits, customers, projects, users } from "@/db/schema";
import { nextNumber } from "@/lib/sequence";
import { scheduleVisits } from "@/lib/amc";
import { UserError } from "../../projects/_lib/forms";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
type Reader = Pick<DB, "select">;

export type NewContract = {
  customerId: number;
  projectId: number | null;
  siteAddress: string | null;
  systems: string[];
  scope: string | null;
  startDate: string;
  endDate: string;
  value: number;
  billingFrequency: string;
  visitsPerYear: number;
  coverage: string;
  responseHours: number;
  engineerId: number | null;
  notes: string | null;
  renewalOf?: number | null;
};

/**
 * Inserts a contract numbered with nextNumber("amc") and its preventive visits spread evenly over the term (rule 19).
 * Run inside a transaction.
 */
export async function insertContract(tx: Tx, c: NewContract, userId: number): Promise<{ id: number; number: string; visits: number }> {
  const number = await nextNumber(tx as unknown as DB, "amc");
  const [row] = await tx.insert(amcContracts).values({
    ...c, number, status: "active", renewalOf: c.renewalOf ?? null, nextBillingDate: c.startDate, createdBy: userId,
  }).returning({ id: amcContracts.id });
  const dates = scheduleVisits(c.startDate, c.endDate, c.visitsPerYear);
  if (dates.length) {
    await tx.insert(amcVisits).values(dates.map((d) => ({ contractId: row.id, scheduledDate: d, status: "scheduled", engineerId: c.engineerId })));
  }
  return { id: row.id, number, visits: dates.length };
}

export async function assertCustomer(db: Reader, id: number) {
  const [c] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, id)).limit(1);
  if (!c) throw new UserError("Choose a valid customer");
}

export async function assertProjectOf(db: Reader, projectId: number, customerId: number) {
  const [p] = await db.select({ customerId: projects.customerId }).from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!p) throw new UserError("Project not found");
  if (p.customerId !== customerId) throw new UserError("The project belongs to a different customer");
}

/** Engineers can be assigned to AMC work: active users with the engineer (or admin) role. */
export async function assertEngineer(db: Reader, id: number) {
  const [u] = await db.select({ role: users.role }).from(users).where(and(eq(users.id, id), eq(users.active, true))).limit(1);
  if (!u || (u.role !== "engineer" && u.role !== "admin")) throw new UserError("Choose an active engineer");
}
