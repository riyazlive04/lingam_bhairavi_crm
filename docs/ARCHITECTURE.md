# Architecture: LBE Fire Safety CRM

**Prepared by:** Sirah Digital (Architect), https://sirahdigital.in/ · **Status:** v1.0 (2026-11-21) · **Related:** [REQUIREMENTS.md](REQUIREMENTS.md), [AUTOMATION_AGENTS.md](AUTOMATION_AGENTS.md), [../app/CONVENTIONS.md](../app/CONVENTIONS.md)

## 1. Goals and constraints
| Driver | Decision |
|---|---|
| Budget-friendly ("give it budget-friendly, we are growing") | Vercel Hobby/Pro and the Neon free tier. No paid SaaS dependencies. **No AI calls at runtime**: all automation runs on fixed rules. |
| Small team, mixed roles, site engineers on the move | One responsive web app with menus for each role, and server-rendered pages that work on low-end phones. |
| The last CRM failed because staff didn't enter data | Data Hygiene agent, a pop-up digest at login, an audit log, only a few required fields and sensible defaults everywhere. |
| Prices change daily (pipes) | Prices are captured **from purchase invoices** (the system of record) and never typed twice. |
| Tally/Vyapar remains the books of accounts | The CRM covers operations (quote → order → delivery → invoice → collection). Excel exports handle the hand-off. Tally XML sync is future scope. |

## 2. Stack
- **Next.js 15 (App Router, React 19, Server Components and Server Actions)**, strict TypeScript and Tailwind v4.
- **Drizzle ORM** on **Postgres**: Neon serverless in production (`DATABASE_URL`), or embedded **PGlite** (Postgres in WASM) for local development and a demo that needs no setup.
- Auth: email and a bcrypt password, with an **HS256 JWT in an httpOnly cookie** (`jose`) that lasts 12 hours. The role matrix lives in `src/lib/rbac.ts` and is enforced in **middleware (edge)**, again on **every page** (`requireUser`) and again in **every mutation** (`requireWrite`).
- Excel: `exceljs` (quotations in the client's SUPPLY/ERECTION BOQ format, the price master, receivables and costing sheets).
- Email: `nodemailer` → **Office 365 SMTP** (`smtp.office365.com:587` STARTTLS) through an outbox table. In demo mode, emails are logged instead of sent.
- Scheduling: **Vercel Cron**, daily at 08:00 IST → `/api/cron/agents` (Bearer `CRON_SECRET`). The agents also refresh at login if the last run is more than 6 hours old.
- Hosting: Vercel project `lbe-fire-crm` in region `bom1` (Mumbai), with Neon Postgres through the Vercel Marketplace.

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
1. **The latest price, automatically.** Post a purchase invoice, and for each line the system writes `price_history(kind=purchase)`, upserts `vendor_items`, books the stock in (or straight to the project's cost centre) and updates `items.last_purchase_rate/date/vendor`. Quotations read `last_purchase_rate` (falling back to `list_price`) and apply the markup, so nobody has to check prices again by phone.
2. **BOQ → quotation.** Pick a system template and enter quantities. Lines with qty 0 are dropped and everything else is kept. Supply rate = cost × (1 + markup), and the erection rate comes from the item master. Each line keeps a snapshot of its cost, which is what the margin guard uses.
3. **Won → order → delivery → invoice → cash.** A won quote creates a sales order (the customer PO) and, if needed, a project. The delivery status of each line drives the *pending delivery* pop-up. Invoices update the sales price history. Payments reduce the outstanding, and the dunning agent emails customers about what is overdue.
4. **Project costing.** Materials issued (stock movements), plus purchase invoices tagged to the project, plus approved expense allocations (which can be split across projects), give the actual cost. This is compared with the budget and the contract value.
5. **Refills.** Every installed extinguisher is an asset with a `next_due_date`. The agent raises an alert 10 days before (internal only), and recording a refill moves the date forward by the interval.

## 6. Automation agents (rule engine)
`runAgents()` loads `agent_rules` (enable flag and parameters) and checks each rule with SQL. It **upserts alerts by `dedupe_key`**, closes alerts whose condition has cleared, queues emails and writes `agent_runs` with the estimated minutes saved. Running it twice a day is safe and creates no duplicates. See [AUTOMATION_AGENTS.md](AUTOMATION_AGENTS.md).

## 7. Security
- Passwords use bcrypt (cost 10). Logins are throttled to 8 attempts per 15 minutes per IP and email. Error messages are generic, and a dummy hash stops anyone from finding valid users by timing the response.
- The session JWT is httpOnly, SameSite=Lax and Secure (in production). Production refuses to start without an `AUTH_SECRET` of at least 32 characters.
- Role checks run at three layers (middleware, page and action). Buying prices and margins are hidden from the engineer and store roles (`canSeeCost`).
- Server Actions include Next's built-in origin check (CSRF). All input is validated with zod, and all SQL is parameterised (Drizzle).
- Headers: HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy and Permissions-Policy. `robots: noindex`.
- The cron endpoint requires `Authorization: Bearer $CRON_SECRET`.
- Secrets live only in the Vercel environment and in `.env.local` (git-ignored). The Sarvam key is used **only** by the offline transcription script and is **not** deployed.
- The audit log records logins and every create, update, post and approve.

## 8. Environments and configuration
| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | Vercel (set automatically by Neon) | Postgres connection. If it is missing, PGlite is used (`PGLITE_DIR`, default `./.data/pglite`; on Vercel this is `/tmp` and does not persist). |
| `AUTH_SECRET` | Vercel | JWT signing key (at least 32 characters). |
| `CRON_SECRET` | Vercel | Protects `/api/cron/agents`. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Vercel (once the client shares the Office 365 details) | Real email delivery. Without them, emails are **logged** in the outbox. |
| `SHOW_DEMO_LOGINS` | Vercel (demo only) | Shows the demo credentials on the login page. **Remove it at go-live** and change all passwords. |
| `SARVAM_API_KEY` | Project-root `.env.local` only | Used by the meeting transcription script. Never deployed. |

## 9. Database lifecycle
- The schema lives in `app/src/db/schema.ts` → `npx drizzle-kit generate` → `node scripts/embed-migrations.mjs` (embeds the SQL into the bundle). Migrations apply automatically at cold start under `pg_advisory_lock`.
- The first boot on an empty database seeds the master data (the client's price list and BOQ templates) **plus demo transactions**. For go-live, clear the transaction tables (see the DevOps guide) and keep the masters.
- Backups: Neon point-in-time restore (1 day on the free tier, 7 to 30 days on paid plans), plus weekly Excel exports of the masters as an extra safety net.

## 10. Scalability and future work
- The expected volumes (hundreds of quotes a year, thousands of lines) are tiny for Postgres. Indexes cover the busy paths (status, item and date, due dates).
- Future: distributorship stock with allocations (the tables already exist), Tally XML export, WhatsApp Business API reminders, a customer portal for refill certificates, server-side PDF generation and multiple branches.

## 11. Architecture decision records (summary)
| ADR | Decision | Why |
|---|---|---|
| 001 | One Next.js app (monolith) | One unit to deploy, the cheapest to run, and right for a small team. |
| 002 | Postgres and Drizzle, with PGlite as a fallback | Proper relational integrity for money flows, and a demo that needs no setup. |
| 003 | A rule engine instead of AI | No running cost, and alerts that are predictable and easy to explain, as the client asked. |
| 004 | Outbox pattern for email | Retries, a record of what was sent, and a safe demo mode. |
| 005 | The purchase invoice is the source of truth for cost | It removes manual price checking, which is the core pain point. |
| 006 | Doubles for money, rounded to 2 decimal places | Kept simple because volumes are small. Revisit (numeric type) if an accounting integration needs ledgers exact to the paisa. |
