# Architecture — LBE Fire Safety CRM

**Owner:** Architect · **Status:** v1.0 (2026-11-21) · **Related:** [REQUIREMENTS.md](REQUIREMENTS.md), [AUTOMATION_AGENTS.md](AUTOMATION_AGENTS.md), [../app/CONVENTIONS.md](../app/CONVENTIONS.md)

## 1. Goals and constraints
| Driver | Decision |
|---|---|
| Budget-friendly ("give it budget-friendly, we are growing") | Vercel Hobby/Pro + Neon free tier. No paid SaaS dependencies. **No AI/LLM calls at runtime**: automation is deterministic rules. |
| Small team, mixed roles, mobile site engineers | Single responsive web app, role-based menus, server-rendered pages that work on low-end phones. |
| Data-entry discipline was the failure mode of the last CRM | Data Hygiene agent, pop-up digest at login, audit log, minimal required fields, defaults everywhere. |
| Prices change daily (pipes) | Price is captured **from purchase invoices** (the system of record), never typed twice. |
| Tally/Vyapar stays the books of accounts | The CRM is operational (quote → order → delivery → invoice → collection). Excel exports for hand-off; Tally XML sync is future scope. |

## 2. Stack
- **Next.js 15 (App Router, React 19, Server Components + Server Actions)**, TypeScript strict, Tailwind v4.
- **Drizzle ORM** on **Postgres**: Neon serverless (production, `DATABASE_URL`) or embedded **PGlite** (WASM Postgres: local dev and zero-config demo).
- Auth: email + bcrypt password, **HS256 JWT in an httpOnly cookie** (`jose`), 12 h TTL; RBAC matrix in `src/lib/rbac.ts`, enforced in **middleware (edge)**, again in **every page** (`requireUser`) and **every mutation** (`requireWrite`).
- Excel: `exceljs` (quotation in the client's SUPPLY/ERECTION BOQ format, price master, receivables, costing sheets).
- Email: `nodemailer` → **Office 365 SMTP** (`smtp.office365.com:587` STARTTLS) via an outbox table; demo mode logs instead of sending.
- Scheduling: **Vercel Cron**, daily at 08:00 IST → `/api/cron/agents` (Bearer `CRON_SECRET`). Agents also refresh on login if the last run is more than 6 h old.
- Hosting: Vercel project `lbe-fire-crm`, region `bom1` (Mumbai); Neon Postgres via the Vercel Marketplace.

## 3. Logical view
```
Browser (desktop / phone)
   │  HTTPS, httpOnly session cookie
   ▼
Vercel Edge Middleware ── JWT verify + RBAC route gate + security headers
   ▼
Next.js server (Node runtime, bom1)
   ├─ Server Components (pages)  ── read via Drizzle
   ├─ Server Actions (mutations) ── zod validate → requireWrite → transaction → audit_log
   ├─ Route handlers: /api/auth/*, /api/cron/agents, /…/export (xlsx)
   └─ Rule engine src/lib/agents  ── alerts, email_outbox, agent_runs
   ▼
Postgres (Neon)  ◄── migrations embedded in bundle, applied at cold start under an advisory lock
   ▲
Office 365 SMTP ◄── outbox flusher
```

## 4. Module map (routes → tables)
| Module | Routes | Main tables |
|---|---|---|
| Dashboard / Alerts / Agents | `/`, `/alerts`, `/agents` | alerts, agent_rules, agent_runs |
| Quotations & BOQ | `/quotations`, `/boq-templates`, `/follow-ups` | quotations, quotation_lines, boq_templates, boq_template_lines, follow_ups |
| Orders & Delivery | `/orders` | sales_orders, sales_order_lines, deliveries, delivery_lines |
| Purchase | `/purchases` | purchase_invoices, purchase_invoice_lines → price_history, vendor_items, stock_movements |
| Item & Price Master | `/items` | items, price_history |
| Vendors / Customers | `/vendors`, `/customers` | vendors, vendor_items, customers |
| Stock | `/stock` | stock_movements, stock_allocations |
| Projects & Expenses | `/projects`, `/expenses` | projects, expenses, expense_allocations (+ stock_movements issue_project) |
| Billing | `/billing`, `/emails` | sales_invoices, sales_invoice_lines, payments, email_outbox |
| Refill tracker | `/refills` | extinguisher_assets, refill_services |
| Meeting notes | `/meeting-notes` | meeting_notes, meeting_note_revisions (versioned) |
| Settings | `/settings` | settings, users, audit_log |

## 5. Key data flows
1. **Latest price, automatically.** Post a purchase invoice → for each line: `price_history(kind=purchase)`, upsert `vendor_items`, stock in (or straight to the project's cost centre), update `items.last_purchase_rate/date/vendor`. Quotations read `last_purchase_rate` (fallback `list_price`) and apply markup, so nobody re-verifies prices by phone.
2. **BOQ → quotation.** Pick a system template, enter quantities. Lines with qty 0 are dropped, and all others are kept. Supply rate = cost × (1 + markup), erection rate from the item master. Cost snapshot per line enables margin guard.
3. **Won → order → delivery → invoice → cash.** A won quote creates a sales order (customer PO) and optionally a project. Line-level delivery status drives the *pending delivery* pop-up. Invoices update the sales price history. Payments reduce outstanding, and the dunning agent emails what is overdue.
4. **Project costing.** Materials issued (stock movements) + purchase invoices tagged to the project + approved expense allocations (split across projects) = actual cost, compared with budget and contract value.
5. **Refills.** Every installed extinguisher is an asset with `next_due_date`. The agent alerts 10 days before (internal only), and recording a refill rolls the date forward by the interval.

## 6. Automation agents (rule engine)
`runAgents()` loads `agent_rules` (enable flag + params), evaluates each rule with SQL, **upserts alerts by `dedupe_key`**, auto-resolves alerts whose condition has cleared, queues emails, and writes `agent_runs` with estimated minutes saved. It is idempotent, so running it twice a day creates no duplicates. See [AUTOMATION_AGENTS.md](AUTOMATION_AGENTS.md).

## 7. Security
- Passwords bcrypt (cost 10). Login throttle 8 attempts per 15 min per IP+email. Generic error messages; a dummy hash prevents user enumeration by timing.
- Session JWT httpOnly + SameSite=Lax + Secure (prod). `AUTH_SECRET` ≥ 32 chars is required in production (hard fail).
- RBAC enforced at three layers (middleware, page, action). Buying prices and margins are hidden from engineer/store roles (`canSeeCost`).
- Server Actions carry Next's built-in origin check (CSRF). All input is zod-validated, and all SQL is parameterised (Drizzle).
- Headers: HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy. `robots: noindex`.
- Cron endpoint requires `Authorization: Bearer $CRON_SECRET`.
- Secrets live only in Vercel env / `.env.local` (git-ignored). The Sarvam key is used **only** by the offline transcription script and is **not** deployed.
- Audit log on logins and every create/update/post/approve.

## 8. Environments & configuration
| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | Vercel (auto from Neon) | Postgres connection. If absent, PGlite is used (`PGLITE_DIR`, default `./.data/pglite`; on Vercel `/tmp`, ephemeral). |
| `AUTH_SECRET` | Vercel | JWT signing key (≥ 32 chars). |
| `CRON_SECRET` | Vercel | Protects `/api/cron/agents`. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Vercel (when client shares Office 365 details) | Real email delivery. Without them, emails are **logged** in the outbox. |
| `SHOW_DEMO_LOGINS` | Vercel (demo only) | Shows demo credentials on the login page. **Remove at go-live** and change all passwords. |
| `SARVAM_API_KEY` | project-root `.env.local` only | Meeting transcription script. Never deployed. |

## 9. Database lifecycle
- Schema in `app/src/db/schema.ts` → `npx drizzle-kit generate` → `node scripts/embed-migrations.mjs` (embeds SQL into the bundle). Migrations auto-apply at cold start under `pg_advisory_lock`.
- First boot on an empty DB seeds the master data (client price list and BOQ templates) **plus demo transactions**. For go-live, truncate transactional tables (see devops guide) and keep the masters.
- Backups: Neon point-in-time restore (free tier 1 day, paid 7–30 days). Weekly Excel exports of masters as an extra safety net.

## 10. Scalability and future
- Expected volumes (hundreds of quotes per year, thousands of lines) are tiny for Postgres; indexes exist on hot paths (status, item/date, due dates).
- Future: distributorship stock with allocations (tables already exist), Tally XML export, WhatsApp Business API reminders, customer portal for refill certificates, PDF generation server-side, multi-branch.

## 11. Architecture decision records (summary)
| ADR | Decision | Why |
|---|---|---|
| 001 | Monolith Next.js app | One deployable unit, cheapest to run, small team. |
| 002 | Postgres + Drizzle; PGlite fallback | Real relational integrity for money flows; zero-config demo. |
| 003 | Rule engine instead of AI | Zero running cost and deterministic, explainable alerts, as the client requested. |
| 004 | Outbox pattern for email | Retries, audit of what was sent, and a safe demo mode. |
| 005 | Purchase invoice = source of truth for cost | Removes manual price verification, the core pain point. |
| 006 | Doubles for money, rounded to 2 dp | Simplicity; volumes are small. Revisit (numeric) if accounting integration needs paise-exact ledgers. |
