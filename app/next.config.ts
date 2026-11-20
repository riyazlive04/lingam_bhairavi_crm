import type { NextConfig } from "next";

/**
 * Content-Security-Policy. App Router injects inline bootstrap scripts, so without per-request nonces
 * script-src needs 'unsafe-inline'; everything else is locked to our own origin (next/font self-hosts fonts).
 * 'unsafe-eval' only in `next dev` (React Refresh). Email previews render in <iframe sandbox="" srcDoc>, which
 * inherits this policy — so remote images/scripts inside stored e-mail HTML cannot load either.
 */
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // PGlite ships WASM + data files; keep it external so its assets resolve at runtime.
  serverExternalPackages: ["@electric-sql/pglite", "exceljs", "nodemailer"],
  outputFileTracingIncludes: {
    "/**": ["./node_modules/@electric-sql/pglite/dist/**/*.{wasm,data}"],
  },
  poweredByHeader: false,
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: CSP },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      ],
    }];
  },
};

export default nextConfig;
