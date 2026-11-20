import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { canRead, moduleForPath } from "@/lib/rbac";

/** Edge gate: unauthenticated → /login; role without module access → /forbidden. Pages also re-check server-side. */
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const user = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  const m = moduleForPath(pathname);
  if (m && !canRead(user.role, m)) return NextResponse.redirect(new URL("/forbidden", req.url));
  const res = NextResponse.next();
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return res;
}

export const config = {
  // everything except login, auth API, cron API, static assets
  matcher: ["/((?!login|forbidden|api/auth|api/cron|_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
