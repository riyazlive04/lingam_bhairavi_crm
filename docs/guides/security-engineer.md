# Security Engineer Guide

The CRM holds the client's **buying prices, margins, customer and vendor details, outstanding amounts and staff expense data** — commercially sensitive for a contractor bidding against competitors. Security must be solid while staying within a small budget (no paid security products required).

## 1. OWASP Top 10 (2021) checklist

| # | Risk | Controls in this app | Check |
|---|---|---|---|
| A01 | Broken access control | `requireRole()` in every server action/route; record-level checks (engineer sees own expenses/projects only); no IDOR — verify ownership on `id` params; admin-only for Settings/Users/Agents | ☐ |
| A02 | Cryptographic failures | HTTPS only (Vercel); passwords bcrypt (cost ≥ 10) or argon2id; JWT signed HS256 with `AUTH_SECRET` ≥ 32 random bytes; DB connection `sslmode=require` | ☐ |
| A03 | Injection | Drizzle parameterised queries only; no string-built SQL; schema validation (zod) on all inputs; Excel export escapes cells starting with `= + - @` (formula injection) | ☐ |
| A04 | Insecure design | Approval for below-margin quotes and expenses; soft-cancel; audit fields; rate-limited login | ☐ |
| A05 | Security misconfiguration | Security headers (CSP, X-Frame-Options DENY/frame-ancestors, X-Content-Type-Options, Referrer-Policy); no debug output in production; default demo users disabled in production | ☐ |
| A06 | Vulnerable components | `npm audit` in CI; Dependabot/Renovate; pin Next.js to patched versions | ☐ |
| A07 | Identification & auth failures | Login throttling (e.g. 5 attempts/15 min per user+IP); generic error messages; cookie `httpOnly`, `Secure`, `SameSite=Lax`; session expiry (8–12 h) and logout invalidation; strong initial passwords, forced change on first login | ☐ |
| A08 | Software & data integrity | Deploy only from protected main branch via Vercel; lockfile committed; review PRs | ☐ |
| A09 | Logging & monitoring | Log logins (success/fail), role changes, price overrides, approvals, deletions/cancellations, e-mail sends, agent runs; no passwords/secrets in logs | ☐ |
| A10 | SSRF | No user-supplied URLs fetched by the server; receipt uploads stored, not fetched | ☐ |

Also: file uploads (expense receipts) — accept images/PDF only, size ≤ 5 MB, random file names, served with `Content-Disposition` and correct type; CSRF — Server Actions use origin checks; keep SameSite cookies.

## 2. Secrets handling

| Secret | Where it lives | Never |
|---|---|---|
| `DATABASE_URL` | Vercel env (Production/Preview separately); local `.env.local` | In git, chat, screenshots, client e-mails |
| `AUTH_SECRET` | Vercel env; different per environment | Reused between preview and production |
| `CRON_SECRET` | Vercel env | Exposed to browser (no `NEXT_PUBLIC_` prefix) |
| `SMTP_USER` / `SMTP_PASS` | Vercel env (Production only) | Personal mailbox passwords — use a dedicated mailbox (e.g. accounts@ the client's domain, to be provided, A-04) |
| `SARVAM_API_KEY` | Project-root `.env.local` on the team machine only (meeting transcription) | In the deployed app |

`.gitignore` already excludes `.env*` (except `.env.example`). Rotate any secret that has been pasted anywhere outside Vercel/`.env.local`. Rotate `AUTH_SECRET` and SMTP password if a team member with access leaves.

## 3. RBAC matrix review

C = create, R = read, U = update, A = approve, — = no access. "own" = only records they created/are assigned to.

| Resource | admin | sales | purchase | accounts | engineer | store |
|---|---|---|---|---|---|---|
| Users, roles, settings, agent config | CRUA | — | — | — | — | — |
| Items / BOQ templates | CRU | R (proposed; see open point below) | CRU | R | — | R |
| **Purchase rates & price history** | R | R (latest rate on quote only) | CRU (via invoices) | R | — | — |
| Vendors | CRU | — | CRU | R | — | — |
| Customers | CRU | CRU | R | CRU | R | R |
| Quotations, follow-ups | CRUA | CRU | R | R | — | — |
| Below-margin approval | A | — | — | — | — | — |
| Sales orders | CRU | CRU | R | R | R | R |
| Deliveries | CRU | R | R | R | CU (site confirm) | CRU |
| Purchase invoices | CRU | — | CRU | CRU | — | R |
| Stock (Phase 2) | CRU | R | CRU | R | — | CRU |
| Projects & costing | CRU | R | R | R | R own | — |
| Expenses | CRUA | CRU own | CRU own | RA | CRU own | CRU own |
| Sales invoices, payments | CRUA | R | — | CRU | — | — |
| Outstanding (customer / vendor) | R | R (customer) | R (vendor) | R | — | — |
| Refill tracker | CRU | CRU | — | — | CRU | — |
| Meeting notes | CRU | CRU | CRU | CRU | CRU | CRU |
| Audit log | R | — | — | — | — | — |

Open review points for the client (add to next meeting): Should sales see raw purchase rates or only margin %? (Buying prices are the most sensitive data.) Can sales edit BOQ templates or only admin?

Review procedure: for every route/action, a test calls it as each role and asserts allow/deny (automate in CI).

## 4. Backups and recovery

- **Neon**: enable point-in-time restore (history retention per plan; free tier retention is short — confirm and upgrade if the client wants longer).
- **Logical backup**: scheduled `pg_dump` (weekly, e.g. GitHub Action or the team machine) encrypted and stored in the client's own storage (OneDrive with Office 365). Monthly restore test into a Neon branch.
- Receipts/attachments: included in backup plan.
- RPO target 24 h, RTO target 4 h (*proposed*).

## 5. India — DPDP Act 2023 note

The Digital Personal Data Protection Act, 2023 applies to digital personal data such as customer contact persons' names, phone numbers, e-mails, and staff data (expense records). Practical obligations for this CRM (the client is the *Data Fiduciary*; Sirah Digital acts as a processor while hosting/supporting):

- **Purpose limitation & minimisation** — collect only business contact data needed for quotations, orders, invoicing and reminders.
- **Notice** — customers receiving automated reminder e-mails should be existing business contacts; include sender identity and a way to opt out of reminders (`reminders_enabled`).
- **Security safeguards** — the controls above (access control, encryption in transit, backups, logging).
- **Breach response** — have a contact and procedure; personal-data breaches must be reported to the Data Protection Board and affected persons as per the Act/Rules.
- **Retention & erasure** — delete personal data when no longer needed, subject to legal retention (GST/accounting records generally must be retained for several years — confirm with the client's auditor).
- **Processor agreement** — clarify Sirah Digital's role and data-handling commitments in the contract.

This is a practical summary, not legal advice; the client should confirm with their advisor.

## 6. Pre-go-live security sign-off

- [ ] RBAC tests pass for all six roles.
- [ ] Demo/seed users removed or passwords changed; admin password rotated.
- [ ] Secrets only in Vercel; `.env.local` not committed; preview uses separate DB branch.
- [ ] Security headers verified; HTTPS enforced.
- [ ] Backup and restore tested.
- [ ] Office 365 sending mailbox is dedicated, with MFA on the human account and SMTP AUTH enabled only for that mailbox.
- [ ] `npm audit` has no high/critical issues.
