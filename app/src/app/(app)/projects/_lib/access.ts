import { canSeeCost, canWrite } from "@/lib/rbac";
import type { SessionUser } from "@/lib/session";

/**
 * Project visibility rules:
 * - admin / sales / purchase / accounts (canSeeCost): full costing sheet incl. contract value & margin.
 * - assigned site engineer: budget vs actual spend, materials (qty + value), expenses (no contract value / margin / billing).
 * - other engineers: basic project info only (read-only).
 * - editing: admin any project; engineer only projects assigned to them.
 */
export function projectAccess(user: SessionUser, project: { engineerId: number | null }) {
  const full = canSeeCost(user.role);
  const assigned = project.engineerId != null && project.engineerId === user.id;
  return {
    full,
    assigned,
    spend: full || assigned,
    edit: canWrite(user.role, "projects") && (user.role === "admin" || assigned),
  };
}
