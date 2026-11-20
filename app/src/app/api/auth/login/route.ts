import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from "@/lib/session";
import { audit } from "@/lib/audit";
import type { Role } from "@/lib/constants";

export const runtime = "nodejs";

// Basic brute-force throttle (per instance): 8 failed attempts / 15 min per IP+email.
const attempts = new Map<string, { n: number; until: number }>();
// constant-time-ish: always run one bcrypt compare even for unknown emails
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

const Body = z.object({ email: z.string().trim().toLowerCase().email().max(160), password: z.string().min(1).max(200), next: z.string().optional() });

/**
 * Only same-origin, in-app paths. Rejects "//host", "/\host", and control characters
 * (browsers/WHATWG URL strip tab/CR/LF, so "/<TAB>/evil.com" would otherwise become "//evil.com").
 */
function safeNext(n: string | undefined, base: string): string {
  if (!n || !n.startsWith("/") || n.length > 2000) return "/";
  if (/[\\\u0000-\u001f\u007f]/.test(n)) return "/";
  if (n.startsWith("//") || n.startsWith("/api")) return "/";
  try {
    const u = new URL(n, base);
    if (u.origin !== new URL(base).origin) return "/";
    return u.pathname + u.search + u.hash;
  } catch {
    return "/";
  }
}

/** Login CSRF guard: if the browser sent an Origin header it must be ours. */
function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return true; // non-browser clients / old browsers; SameSite + no state change before auth
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function pruneAttempts(now: number) {
  if (attempts.size < 5000) return;
  for (const [k, v] of attempts) if (v.until <= now) attempts.delete(k);
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return new NextResponse("Forbidden", { status: 403 });
  const form = await req.formData();
  const parsed = Body.safeParse({ email: form.get("email"), password: form.get("password"), next: form.get("next") ?? undefined });
  const back = (msg: string) => NextResponse.redirect(new URL(`/login?err=${encodeURIComponent(msg)}`, req.url), 303);
  if (!parsed.success) return back("Enter a valid email and password");
  const { email, password } = parsed.data;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const key = `${ip}|${email}`;
  pruneAttempts(Date.now());
  const a = attempts.get(key);
  if (a && a.n >= 8 && a.until > Date.now()) return back("Too many attempts. Try again in 15 minutes.");

  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const ok = await bcrypt.compare(password, u?.passwordHash ?? DUMMY_HASH);
  if (!u || !ok || !u.active) {
    attempts.set(key, { n: (a && a.until > Date.now() ? a.n : 0) + 1, until: Date.now() + 15 * 60 * 1000 });
    await audit(db, u?.id ?? null, "login_failed", "user", u?.id ?? null, { ip, email, reason: !u ? "unknown_email" : !ok ? "bad_password" : "inactive" });
    return back("Invalid email or password");
  }
  attempts.delete(key);

  const token = await signSession({ id: u.id, name: u.name, email: u.email, role: u.role as Role });
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, u.id));
  await audit(db, u.id, "login", "user", u.id, { ip });

  const res = NextResponse.redirect(new URL(safeNext(parsed.data.next, req.url), req.url), 303);
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_TTL_SECONDS,
  });
  // marker so the startup digest pops up once per login
  res.cookies.set("lbe_digest", "1", { httpOnly: false, sameSite: "lax", path: "/", maxAge: SESSION_TTL_SECONDS });
  return res;
}
