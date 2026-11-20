/** JWT session token helpers — edge-safe (used by middleware and server). OWNED BY: Architect + Security. */
import { SignJWT, jwtVerify } from "jose";
import type { Role } from "./constants";

export const SESSION_COOKIE = "lbe_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12h

export type SessionUser = { id: number; name: string; email: string; role: Role };

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    if (process.env.VERCEL_ENV === "production") throw new Error("AUTH_SECRET (>=32 chars) must be set in production");
    return new TextEncoder().encode("dev-only-insecure-secret-change-me-0123456789");
  }
  return new TextEncoder().encode(s);
}

export async function signSession(u: SessionUser) {
  return new SignJWT({ name: u.name, email: u.email, role: u.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(u.id))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return { id: Number(payload.sub), name: String(payload.name), email: String(payload.email), role: payload.role as Role };
  } catch {
    return null;
  }
}
