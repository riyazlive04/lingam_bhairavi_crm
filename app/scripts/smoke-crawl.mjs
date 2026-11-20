// Smoke crawler: logs in as each demo role and visits every reachable in-app link (GET only).
// Usage: node scripts/smoke-crawl.mjs http://localhost:3100 [maxPagesPerRole]
const BASE = process.argv[2] || "http://localhost:3100";
const MAX = Number(process.argv[3] || 400);
const ROLES = ["admin", "sales", "purchase", "accounts", "engineer", "store"];
const SKIP = [/\/api\//, /\/export/, /logout/];

async function login(role) {
  const fd = new URLSearchParams({ email: `${role}@lbe.demo`, password: "Demo@123", next: "/" });
  const r = await fetch(BASE + "/api/auth/login", { method: "POST", body: fd, redirect: "manual" });
  const cookies = (r.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
  if (!cookies.includes("lbe_session")) throw new Error("login failed for " + role + " status " + r.status);
  return cookies;
}

function normalise(href) {
  if (!href.startsWith("/") || href.startsWith("//")) return null;
  const u = new URL(href, BASE);
  if (SKIP.some((re) => re.test(u.pathname))) return null;
  // collapse numeric ids so we don't crawl 500 item pages: keep first 3 per pattern
  return u.pathname + u.search;
}

const problems = [];
for (const role of ROLES) {
  const cookie = await login(role);
  const seen = new Set(), patternCount = new Map(), from = new Map();
  const queue = ["/"];
  let visited = 0;
  while (queue.length && visited < MAX) {
    const path = queue.shift();
    if (seen.has(path)) continue;
    seen.add(path);
    const pattern = path.split("?")[0].replace(/\/\d+/g, "/:id") + (path.includes("?") ? "?q" : "");
    const pc = (patternCount.get(pattern) || 0) + 1;
    patternCount.set(pattern, pc);
    if (pc > 3) continue;
    visited++;
    const t = Date.now();
    let r, html = "";
    try {
      r = await fetch(BASE + path, { headers: { cookie }, redirect: "manual" });
      html = await r.text();
    } catch (e) { problems.push({ role, path, status: "FETCH", msg: String(e) }); continue; }
    const ms = Date.now() - t;
    const loc = r.headers.get("location") || "";
    if (r.status >= 500 || /Application error|Internal Server Error|digest:/.test(html)) problems.push({ role, path, status: r.status, msg: (html.match(/"message":"([^"]{0,200})/) || [])[1] || "" });
    else if (r.status === 404) problems.push({ role, path, status: 404, msg: "from " + from.get(path) });
    else if (r.status >= 300 && r.status < 400 && /forbidden/.test(loc)) { /* link shown to role without access */ problems.push({ role, path, status: "FORBIDDEN-LINK", msg: "from " + from.get(path) }); }
    if (ms > 4000) problems.push({ role, path, status: "SLOW", msg: ms + "ms" });
    for (const m of html.matchAll(/href="([^"#]+)"/g)) {
      const n = normalise(m[1].replace(/&amp;/g, "&"));
      if (n && !seen.has(n)) { queue.push(n); if (!from.has(n)) from.set(n, path); }
    }
  }
  console.log(`${role}: visited ${visited} pages`);
}
console.log("\nPROBLEMS:", problems.length);
for (const p of problems) console.log(JSON.stringify(p));
