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

function safeNext(n?: string) {
  return n && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/api") ? n : "/";
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const parsed = Body.safeParse({ email: form.get("email"), password: form.get("password"), next: form.get("next") ?? undefined });
  const back = (msg: string) => NextResponse.redirect(new URL(`/login?err=${encodeURIComponent(msg)}`, req.url), 303);
  if (!parsed.success) return back("Enter a valid email and password");
  const { email, password } = parsed.data;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const key = `${ip}|${email}`;
  const a = attempts.get(key);
  if (a && a.n >= 8 && a.until > Date.now()) return back("Too many attempts. Try again in 15 minutes.");

  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const ok = await bcrypt.compare(password, u?.passwordHash ?? DUMMY_HASH);
  if (!u || !ok || !u.active) {
    attempts.set(key, { n: (a && a.until > Date.now() ? a.n : 0) + 1, until: Date.now() + 15 * 60 * 1000 });
    return back("Invalid email or password");
  }
  attempts.delete(key);

  const token = await signSession({ id: u.id, name: u.name, email: u.email, role: u.role as Role });
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, u.id));
  await audit(db, u.id, "login", "user", u.id, { ip });

  const res = NextResponse.redirect(new URL(safeNext(parsed.data.next), req.url), 303);
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_TTL_SECONDS,
  });
  // marker so the startup digest pops up once per login
  res.cookies.set("lbe_digest", "1", { httpOnly: false, sameSite: "lax", path: "/", maxAge: SESSION_TTL_SECONDS });
  return res;
}
