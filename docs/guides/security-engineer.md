# Security Engineer Guide

The CRM holds the client's **buying prices, margins, customer and vendor details, outstanding amounts and staff expense data**. For a contractor bidding against competitors, that is commercially sensitive. Security must be solid while staying within a small budget, with no paid security products needed.

## 1. OWASP Top 10 (2021) checklist

| # | Risk | Controls in this app | Check |
|---|---|---|---|
| A01 | Broken access control | `requireRole()` in every server action and route. Record-level checks (an engineer sees only their own expenses and projects). No IDOR: verify ownership on `id` params. Settings, Users and Agents are admin-only | ☐ |
| A02 | Cryptographic failures | HTTPS only (Vercel). Passwords hashed with bcrypt (cost ≥ 10) or argon2id. JWT signed HS256 with an `AUTH_SECRET` of at least 32 random bytes. DB connection uses `sslmode=require` | ☐ |
| A03 | Injection | Drizzle parameterised queries only, never SQL built from strings. Schema validation (zod) on all inputs. The Excel export escapes cells starting with `= + - @` (formula injection) | ☐ |
| A04 | Insecure design | Approval for below-margin quotes and for expenses. Soft-cancel. Audit fields. Rate-limited login | ☐ |
| A05 | Security misconfiguration | Security headers (CSP, X-Frame-Options DENY/frame-ancestors, X-Content-Type-Options, Referrer-Policy). No debug output in production. Default demo users disabled in production | ☐ |
| A06 | Vulnerable components | `npm audit` in CI, Dependabot or Renovate, and Next.js pinned to patched versions | ☐ |
| A07 | Identification & auth failures | Login throttling (for example 5 attempts per 15 min per user and IP). Generic error messages. Cookie `httpOnly`, `Secure`, `SameSite=Lax`. Session expiry (8 to 12 h) and logout invalidation. Strong initial passwords, with a forced change on first login | ☐ |
| A08 | Software & data integrity | Deploy only from the protected main branch through Vercel. Lockfile committed. PRs reviewed | ☐ |
| A09 | Logging & monitoring | Log logins (success and failure), role changes, price overrides, approvals, deletions and cancellations, e-mail sends and agent runs. Never log passwords or secrets | ☐ |
| A10 | SSRF | The server never fetches URLs supplied by users. Receipt uploads are stored, not fetched | ☐ |

Also: for file uploads (expense receipts), accept images and PDF only, up to 5 MB, with random file names, served with `Content-Disposition` and the correct type. For CSRF, Server Actions use origin checks, and we keep SameSite cookies.

## 2. Handling secrets

| Secret | Where it lives | Never |
|---|---|---|
| `DATABASE_URL` | Vercel env (Production and Preview set separately); local `.env.local` | In git, chat, screenshots or client e-mails |
| `AUTH_SECRET` | Vercel env, different in each environment | Shared between preview and production |
| `CRON_SECRET` | Vercel env | Exposed to the browser (no `NEXT_PUBLIC_` prefix) |
| `SMTP_USER` / `SMTP_PASS` | Vercel env (Production only) | A personal mailbox password. Use a dedicated mailbox (for example accounts@ on the client's domain, to be provided, A-04) |
| `SARVAM_API_KEY` | Project-root `.env.local` on the team machine only (for meeting transcription) | In the deployed app |

`.gitignore` already excludes `.env*` (except `.env.example`). Rotate any secret that has been pasted anywhere outside Vercel or `.env.local`. Rotate `AUTH_SECRET` and the SMTP password if a team member with access leaves.

## 3. Role access (RBAC) matrix review

C = create, R = read, U = update, A = approve, - = no access. "own" means only the records they created or are assigned to.

| Resource | admin | sales | purchase | accounts | engineer | store |
|---|---|---|---|---|---|---|
| Users, roles, settings, agent config | CRUA | - | - | - | - | - |
| Items / BOQ templates | CRU | R (proposed; see the open point below) | CRU | R | - | R |
| **Purchase rates & price history** | R | R (latest rate on quote only) | CRU (via invoices) | R | - | - |
| Vendors | CRU | - | CRU | R | - | - |
| Customers | CRU | CRU | R | CRU | R | R |
| Quotations, follow-ups | CRUA | CRU | R | R | - | - |
| Below-margin approval | A | - | - | - | - | - |
| Sales orders | CRU | CRU | R | R | R | R |
| Deliveries | CRU | R | R | R | CU (site confirm) | CRU |
| Purchase invoices | CRU | - | CRU | CRU | - | R |
| Stock (Phase 2) | CRU | R | CRU | R | - | CRU |
| Projects & costing | CRU | R | R | R | R own | - |
| Expenses | CRUA | CRU own | CRU own | RA | CRU own | CRU own |
| Sales invoices, payments | CRUA | R | - | CRU | - | - |
| Outstanding (customer / vendor) | R | R (customer) | R (vendor) | R | - | - |
| Refill tracker | CRU | CRU | - | - | CRU | - |
| Meeting notes | CRU | CRU | CRU | CRU | CRU | CRU |
| Audit log | R | - | - | - | - | - |

Open points to review with the client (add them to the next meeting): Should sales see raw purchase rates, or only margin %? (Buying prices are the most sensitive data.) Can sales edit BOQ templates, or only admin?

How to review: for every route and action, a test calls it as each role and checks that it is allowed or denied as expected (automate this in CI).

## 4. Backups and recovery

- **Neon**: turn on point-in-time restore. History retention depends on the plan, and the free tier keeps only a short window, so confirm it and upgrade if the client wants longer.
- **Logical backup**: a scheduled `pg_dump` (weekly, for example from a GitHub Action or the team machine), encrypted and stored in the client's own storage (OneDrive with Office 365). Test a restore into a Neon branch every month.
- Receipts and attachments are part of the backup plan.
- RPO target 24 h, RTO target 4 h (*proposed*).

## 5. India: a note on the DPDP Act 2023

The Digital Personal Data Protection Act, 2023 covers digital personal data such as the names, phone numbers and e-mails of customer contact persons, and staff data (expense records). In practice, this is what it means for this CRM. The client is the *Data Fiduciary*, and Sirah Digital acts as a processor while hosting and supporting the system.

- **Purpose limitation and minimisation.** Collect only the business contact data needed for quotations, orders, invoicing and reminders.
- **Notice.** Customers who receive automated reminder e-mails should be existing business contacts. Include the sender's identity and a way to opt out of reminders (`reminders_enabled`).
- **Security safeguards.** The controls above: access control, encryption in transit, backups and logging.
- **Breach response.** Have a contact person and a procedure. Personal-data breaches must be reported to the Data Protection Board and to the people affected, as the Act and Rules require.
- **Retention and erasure.** Delete personal data once it is no longer needed, subject to legal retention (GST and accounting records usually have to be kept for several years, so confirm with the client's auditor).
- **Processor agreement.** Spell out Sirah Digital's role and data-handling commitments in the contract.

This is a practical summary, not legal advice. The client should confirm it with their own advisor.

## 6. Security sign-off before go-live

- [ ] RBAC tests pass for all six roles.
- [ ] Demo and seed users removed or their passwords changed; admin password rotated.
- [ ] Secrets live only in Vercel; `.env.local` is not committed; preview uses a separate DB branch.
- [ ] Security headers verified and HTTPS enforced.
- [ ] Backup and restore tested.
- [ ] The Office 365 sending mailbox is dedicated, with MFA on the human account and SMTP AUTH enabled only for that mailbox.
- [ ] `npm audit` shows no high or critical issues.
