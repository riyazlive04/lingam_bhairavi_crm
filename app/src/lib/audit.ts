import "server-only";
import type { DB } from "@/db";
import { auditLog } from "@/db/schema";

/** Append-only audit trail. Never throws (audit must not break business actions). */
export async function audit(db: DB, userId: number | null, action: string, entityType: string, entityId: number | null, details?: unknown) {
  try {
    await db.insert(auditLog).values({ userId, action, entityType, entityId, details: (details ?? null) as never });
  } catch (e) {
    console.error("audit failed", e);
  }
}
