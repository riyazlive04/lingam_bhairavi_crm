/** Server-side auth helpers. Maintainer: Sirah Digital. */
import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { ROLES, type Role } from "./constants";
import { SESSION_COOKIE, verifySession, type SessionUser } from "./session";
import { canRead, canWrite, type Module } from "./rbac";

/**
 * Re-validates the JWT subject against the database once per request (React `cache()` dedupes calls).
 * A deactivated or deleted user loses access immediately (not after the 12 h JWT expiry), and a role
 * change applies on the next request because the role/name are taken from the DB row, not the token.
 * The edge middleware still only checks the signature (edge-safe, no DB); pages/actions/routes are authoritative.
 */
const loadActiveUser = cache(async (id: number): Promise<SessionUser | null> => {
  if (!Number.isInteger(id) || id <= 0) return null;
  const db = await getDb();
  const [u] = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, active: users.active })
    .from(users).where(eq(users.id, id)).limit(1);
  if (!u || !u.active || !(u.role in ROLES)) return null;
  return { id: u.id, name: u.name, email: u.email, role: u.role as Role };
});

export async function getSession(): Promise<SessionUser | null> {
  const c = await cookies();
  const token = await verifySession(c.get(SESSION_COOKIE)?.value);
  if (!token) return null;
  return loadActiveUser(token.id);
}

/** Call at the top of every page: redirects to /login or /forbidden. */
export async function requireUser(module?: Module): Promise<SessionUser> {
  const u = await getSession();
  if (!u) redirect("/login");
  if (module && !canRead(u.role, module)) redirect("/forbidden");
  return u;
}

/** Call at the top of every server action that mutates data. Throws; never trust the client. */
export async function requireWrite(module: Module): Promise<SessionUser> {
  const u = await getSession();
  if (!u) throw new Error("Not signed in");
  if (!canWrite(u.role, module)) throw new Error("You do not have permission for this action");
  return u;
}
