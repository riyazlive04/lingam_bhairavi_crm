import { eq, inArray, isNull, or, type SQL } from "drizzle-orm";
import { alerts } from "@/db/schema";
import type { Role } from "@/lib/constants";

/** Which alerts a user may see/act on: admin = all; others = their role, assigned to them, or unassigned. */
export function alertScope(user: { id: number; role: Role }): SQL | undefined {
  if (user.role === "admin") return undefined;
  return or(inArray(alerts.assignedRole, [user.role]), eq(alerts.assignedUserId, user.id), isNull(alerts.assignedRole));
}

export function canActOnAlert(user: { id: number; role: Role }, a: { assignedRole: string | null; assignedUserId: number | null }): boolean {
  return user.role === "admin" || a.assignedRole == null || a.assignedRole === user.role || a.assignedUserId === user.id;
}
