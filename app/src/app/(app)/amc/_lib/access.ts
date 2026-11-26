import { canRead, canSeeCost, canWrite } from "@/lib/rbac";
import type { Role } from "@/lib/constants";

/**
 * AMC and service call permissions (module "amc"):
 * - field work (record visits, reschedule, update and resolve calls): anyone with write on "amc" (admin, sales, engineer)
 * - contract management (create, renew, cancel, assign engineers, dispatch calls): admin and sales
 * - contract value and billing figures: roles that see commercial figures (engineers do not, same as projects)
 */
export function amcAccess(role: Role) {
  const write = canWrite(role, "amc");
  const manage = write && (role === "admin" || role === "sales");
  return {
    write,
    manage,
    money: canSeeCost(role),
    billing: canRead(role, "billing"),
  };
}
