/** Server-side auth helpers. OWNED BY: Architect + Security. */
import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession, type SessionUser } from "./session";
import { canRead, canWrite, type Module } from "./rbac";

export async function getSession(): Promise<SessionUser | null> {
  const c = await cookies();
  return verifySession(c.get(SESSION_COOKIE)?.value);
}

/** Call at the top of every page: redirects to /login or /forbidden. */
export async function requireUser(module?: Module): Promise<SessionUser> {
  const u = await getSession();
  if (!u) redirect("/login");
  if (module && !canRead(u.role, module)) redirect("/forbidden");
  return u;
}

/** Call at the top of every server action that mutates data. Throws — never trust the client. */
export async function requireWrite(module: Module): Promise<SessionUser> {
  const u = await getSession();
  if (!u) throw new Error("Not signed in");
  if (!canWrite(u.role, module)) throw new Error("You do not have permission for this action");
  return u;
}
