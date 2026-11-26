# Architecture: LBE Fire Safety CRM

**Prepared by:** Sirah Digital (Architect), https://sirahdigital.in/ · **Status:** v2.1 (2026-11-26; v1.0 was 2026-11-21) · **Related:** [REQUIREMENTS.md](REQUIREMENTS.md), [AUTOMATION_AGENTS.md](AUTOMATION_AGENTS.md), [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md), [UX_AUDIT.md](UX_AUDIT.md), [SECURITY_REVIEW.md](SECURITY_REVIEW.md), [../app/CONVENTIONS.md](../app/CONVENTIONS.md)

## 1. Goals and constraints
| Driver | Decision |
|---|---|
| Budget-friendly ("give it budget-friendly, we are growing") | Vercel and the Neon free tier. No paid SaaS dependencies. **No AI calls at runtime**: all automation runs on fixed rules, and the BOQ import matches items with text rules. Vercel Hobby is for non-commercial use only, so the live system needs **Vercel Pro** (or a small VPS) before go-live. |
| Small team, mixed roles, site engineers on the move | One responsive web app with menus for each role, a bottom tab bar on phones, and server-rendered pages that work on low-end phones. |
| The last CRM failed because staff didn't enter data | Data Hygiene agent, a pop-up digest at login, an audit log, only a few required fields and sensible defaults everywhere. |
| Prices change daily (pipes) | Prices are captured **from purchase invoices** (the system of record) and never typed twice. Each quote line keeps the price date and supplier, so the age of a price is visible. |
| Tally/Vyapar remains the books of accounts | The CRM covers operations (quote → order → delivery → invoice → collection, plus returns, advances and AMC). Excel exports handle the hand-off. Tally XML sync is future scope. |
| Version 2 must reach a live demo database that already holds data | Migrations are **additive only**, and a one-time, guarded upgrade step runs at boot (ADR-007). |

## 2. Stack
- **Next.js 15 (App Router, React 19, Server Components and Server Actions)**, strict TypeScript and Tailwind v4.
- **Drizzle ORM** on **Postgres**: Neon serverless in production (`DATABASE_URL`), or embedded **PGlite** (Postgres in WASM) for local development and a demo that needs no setup.
- Auth: email and a bcrypt password, with an **HS256 JWT in an httpOnly cookie** (`jose`) that lasts 12 hours. The role matrix lives in `src/lib/rbac.ts` (23 modules) and is enforced in **middleware (edge)**, again on **every page** (`requireUser`) and again in **every mutation** (`requireWrite`).
- Excel: `exceljs` (quotations in the client's SUPPLY/ERECTION BOQ format, consultant BOQ import, the price master, receivables, payables, costing sheets and the P&L report).
- Email: `nodemailer` → **Office 365 SMTP** (`smtp.office365.com:587` STARTTLS) through an outbox table. In demo mode, emails are logged instead of sent.
- Scheduling: **Vercel Cron**, daily at 08:00 IST (`30 2 * * *` UTC in `app/vercel.json`) → `/api/cron/agents` (Bearer `CRON_SECRET`). The agents also refresh at login if the last run is more than 6 hours old.
- UI: one design system (tokens, page patterns and components in `src/components/patterns`, navigation model in `src/components/nav.ts`). See [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).
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
Postgres (Neon)  ◄── migrations embedded in bundle, applied at cold start under an advisory lock,
   ▲                 then a one-time guarded upgrade for databases created before v2
Office 365 SMTP ◄── outbox flusher
```

## 4. Module map (routes → tables)
The navigation groups follow the jobs people do (`src/components/nav.ts`). Each item keeps its own RBAC module.

| Nav group | Module | Routes | Main tables |
|---|---|---|---|
| Home / Automation | Home, Alerts, Automation agents | `/`, `/alerts`, `/agents` | alerts, agent_rules, agent_runs |
| Sell | Quotations (with approval) and BOQ | `/quotations`, `/boq-templates`, `/follow-ups` | quotations, quotation_lines, boq_templates, boq_template_lines, follow_ups |
| Sell | Import BOQ (v2) | `/boq-import` | writes quotations, quotation_lines (no table of its own) |
| Sell | Customers | `/customers` | customers |
| Deliver | Orders & delivery | `/orders` | sales_orders, sales_order_lines, deliveries, delivery_lines (cost_rate snapshot, v2) |
| Deliver | Returns (v2) | `/returns`, `/returns/vendor` | sales_returns, sales_return_lines, purchase_returns, purchase_return_lines → stock_movements |
| Buy | Purchase orders (v2) | `/purchase-orders` | purchase_orders, purchase_order_lines |
| Buy | Purchase invoices | `/purchases` | purchase_invoices, purchase_invoice_lines → price_history, vendor_items, stock_movements, purchase_order_lines.received_qty |
| Buy | Item & price master, Vendors, Stock | `/items`, `/vendors`, `/stock` | items, price_history, vendors, vendor_items, stock_movements, stock_allocations |
| Money | Billing & outstanding, Advances (v2), receipts (v2) | `/billing`, `/billing/advances`, `/billing/receipts/[paymentId]` | sales_invoices, sales_invoice_lines, payments (is_advance, allocated_amount), payment_allocations |
| Money | Reports & profit (v2) | `/reports` | read only: invoices, returns, deliveries, stock movements, expenses |
| Money | Email outbox | `/emails` | email_outbox |
| Projects & site | Projects (with history, v2), Expenses | `/projects`, `/projects/[id]/history`, `/expenses` | projects, expenses, expense_allocations (+ stock_movements issue_project) |
| Service | AMC (v2), Service calls (v2), Refills | `/amc`, `/service-calls`, `/refills` | amc_contracts, amc_visits, service_calls, extinguisher_assets, refill_services |
| Admin | Meeting notes, Settings & users, Help | `/meeting-notes`, `/settings`, `/help` | meeting_notes, meeting_note_revisions, settings, users, audit_log, sequences |

### 4.1 Tables added or changed in version 2 (migration `0001_v2_returns_amc_po_approval.sql`)
| Table | New / changed | Purpose |
|---|---|---|
| `purchase_orders`, `purchase_order_lines` | New | Vendor POs, optionally linked to a sales order and its lines; `received_qty` per line |
| `sales_returns`, `sales_return_lines` | New | Customer returns and GST credit notes (`adjusted_amount`, restock flag, `cost_rate`) |
| `purchase_returns`, `purchase_return_lines` | New | Returns to vendor and debit notes (`adjusted_amount`) |
| `payment_allocations` | New | How an advance is applied to invoices |
| `amc_contracts`, `amc_visits` | New | Contracts (systems, period, visits per year, coverage, response hours, renewal link) and scheduled visits with checklist results |
| `service_calls` | New | Breakdown calls with priority, engineer, `due_by` and status |
| `quotations` | Changed | `approval_status`, `approval_requested_at/by`, `approved_by/at`, `approval_note` |
| `quotation_lines` | Changed | `cost_date`, `cost_vendor_id`, `cost_source` (`purchase` / `list` / `manual`) |
| `delivery_lines` | Changed | `cost_rate` (cost snapshot at delivery) |
| `payments` | Changed | `is_advance`, `order_id`, `project_id`, `allocated_amount` |
| `purchase_invoices`, `purchase_invoice_lines` | Changed | `purchase_order_id`, `po_line_id` |
| `sales_order_lines` | Changed | `returned_qty` |

New stock movement types: `sales_return` (+) and `purchase_return` (−). New document numbers: `LBE/PO`, `LBE/CN`, `LBE/DN`, `LBE/AMC`, `LBE/SC` and `LBE/RCPT`, all per financial year.

## 5. Key data flows
The business rules behind these flows are numbered in [CONVENTIONS.md](../app/CONVENTIONS.md): rules 1 to 9 for version 1 and **rules 10 to 20 for version 2**. Where this section and CONVENTIONS differ, CONVENTIONS is correct.

1. **The latest price, automatically.** Post a purchase invoice, and for each line the system writes `price_history(kind=purchase)`, upserts `vendor_items`, books the stock in (or straight to the project's cost centre) and updates `items.last_purchase_rate/date/vendor`. Quotations read `last_purchase_rate` (falling back to `list_price`) and apply the markup, so nobody has to check prices again by phone (rules 1, 2 and 4).
2. **BOQ → quotation, with price freshness and approval.** Pick a system template, or import a consultant's BOQ Excel file (lines are matched to the item master automatically and the rest are reviewed by hand). Lines with qty 0 are dropped. Each line keeps a snapshot of its cost with the **price date and supplier** (rule 10), and is marked stale when the price is too old. If the approval setting requires it, the quote is blocked from "Mark sent" and "Email" until the owner approves (rule 11); a price change after approval sends it back for approval.
3. **Won → order → vendor PO → delivery → invoice → cash.** A won quote creates a sales order (the customer PO) and, if needed, a project. Pending lines can be turned into a **vendor PO** (rule 16); the goods are received by creating a purchase invoice from the PO, and posting it updates the PO's received qty. Each delivery saves the item's cost at that moment (rule 12). Invoices update the sales price history. Payments reduce the outstanding, and the dunning agent emails customers about what is overdue.
4. **Returns and credit or debit notes.** A customer return (rule 13) increases `returned_qty` on the order line, can put the goods back into stock (`sales_return` movement at the delivery cost, also credited to the project), and produces a GST credit note that can be adjusted against that customer's open invoices. A return to vendor (rule 14) takes stock out (`purchase_return`) and produces a debit note that can be adjusted against that vendor's open bills.
5. **Advances.** An advance is a payment with `is_advance` and no invoice (rule 15). "Apply advance" writes `payment_allocations` and raises the invoice's paid amount, never above the invoice outstanding or the unapplied advance. Each payment can print a receipt.
6. **Net outstanding.** Customer outstanding = Σ invoice (total − paid) − Σ posted credit notes (total − adjusted) − Σ advances (amount − allocated). Vendor outstanding subtracts unadjusted debit notes (rules 13 to 15).
7. **AMC and service.** Creating a contract schedules its visits evenly across the period (rule 19). Each visit records a checklist per system covered and prints a visit report. A service call gets a response deadline from the contract's response hours (48 h without a contract). Renewal creates a new contract linked by `renewal_of` and marks the old one renewed. The AMC & Service agent watches visits, renewals and deadlines.
8. **Project costing and history.** Materials issued, minus site returns and restocked customer returns, plus approved expense allocations (which can be split across projects), give the actual cost (rules 5 and 13). This is compared with the budget and the contract value. The project history page puts every related document on one timeline.
9. **Refills.** Every installed extinguisher is an asset with a `next_due_date`. The agent raises an alert 10 days before (internal only), and recording a refill moves the date forward by the interval (rule 8).

### 5.1 Profit formulas (reports)
| Report | Formula (summary) | Rule |
|---|---|---|
| Order P&L | Revenue = issued invoice subtotals for the order − posted credit-note subtotals. Cost = Σ delivery qty × delivery `cost_rate` − Σ restocked return qty × cost rate. Gross profit = revenue − cost | 17 |
| Monthly business P&L | Sales = invoice subtotals − credit-note subtotals. Cost of goods = delivery costs (orders without a project) + project material issues − restocked returns. Expenses = approved expenses. Gross profit, then net after expenses. **Purchases are not cost until delivered or issued** | 18 |
| Project, customer and item profitability | Buy vs sell built from the same figures, grouped by project, customer or item | 5, 17, 18 |

Reports and the order P&L card are shown only to roles that can read reports **and** see cost (admin and accounts).

## 6. Automation agents (rule engine)
`runAgents()` loads `agent_rules` (enable flag and parameters) and runs the **12 agents** in the order set in `src/lib/agents/registry.ts`. It **upserts alerts by `dedupe_key`**, closes alerts whose condition has cleared, queues emails and writes `agent_runs` with the estimated minutes saved. Running it twice a day is safe and creates no duplicates. Version 2 added the AMC & Service agent and the approvals check in Data Hygiene. See [AUTOMATION_AGENTS.md](AUTOMATION_AGENTS.md).

## 7. Security
- Passwords use bcrypt (cost 10). Logins are throttled to 8 attempts per 15 minutes per IP and email. Error messages are generic, and a dummy hash stops anyone from finding valid users by timing the response.
- The session JWT is httpOnly, SameSite=Lax and Secure (in production). Production refuses to start without an `AUTH_SECRET` of at least 32 characters.
- Role checks run at three layers (middleware, page and action). Buying prices and margins are hidden from the engineer and store roles (`canSeeCost`); reports need `canSeeCost` as well.
- Server Actions include Next's built-in origin check (CSRF). All input is validated with zod, all SQL is parameterised (Drizzle), and money totals are recomputed on the server.
- BOQ uploads are limited to 8 MB, macro-enabled files are refused, and zip bombs are rejected before the workbook is read (V2-02).
- Headers: CSP, HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy and Permissions-Policy. `robots: noindex`.
- The cron endpoint requires `Authorization: Bearer $CRON_SECRET`.
- Secrets live only in the Vercel environment and in `.env.local` (git-ignored). The Sarvam key is used **only** by the offline transcription script and is **not** deployed.
- The audit log records logins and every create, update, post, approve and adjust.
- Version 2 was reviewed separately: see the "Version 2 review" section of [SECURITY_REVIEW.md](SECURITY_REVIEW.md) (V2-01 to V2-17, all Medium findings fixed).

## 8. Environments and configuration
| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | Vercel (set automatically by Neon) | Postgres connection. If it is missing, PGlite is used (`PGLITE_DIR`, default `./.data/pglite`; on Vercel this is `/tmp` and does not persist). |
| `AUTH_SECRET` | Vercel | JWT signing key (at least 32 characters). |
| `CRON_SECRET` | Vercel | Protects `/api/cron/agents`. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Vercel (once the client shares the Office 365 details) | Real email delivery. Without them, emails are **logged** in the outbox. |
| `SHOW_DEMO_LOGINS` | Vercel (demo only) | Shows the demo credentials on the login page. **Remove it at go-live** and change all passwords. |
| `SEED_V2_DEMO` | Vercel (demo only) | When set to `1`, adds the version 2 demo data (vendor POs, returns, advances, AMC contracts and service calls) **once** to a database that was created before version 2. **Remove it at go-live.** A fresh database gets this demo data from the normal first-boot seed anyway. |
| `SARVAM_API_KEY` | Project-root `.env.local` only | Used by the meeting transcription script. Never deployed. |

## 9. Database lifecycle and upgrade path
- The schema lives in `app/src/db/schema.ts` → `npx drizzle-kit generate` → `node scripts/embed-migrations.mjs` (embeds the SQL into the bundle). Migrations apply automatically at cold start under `pg_advisory_lock` and are recorded in `__migrations`.
- Migrations so far: `0000_init` (version 1) and `0001_v2_returns_amc_po_approval` (version 2). Migration 0001 is **additive only**: `CREATE TABLE` and `ADD COLUMN` with defaults, with no `DROP`, `DELETE` or `TRUNCATE`.
- **First boot on an empty database** seeds the master data (the client's price list and BOQ templates) **plus demo transactions**, including the version 2 demo data.
- **Boot on an existing database** (any users present) runs `upgradeExisting()` once:
  1. `backfillV2()` fills the quote line cost date and supplier (rule 10) and the delivery line cost rate (rule 12) for older records. It touches only rows that have no cost source or a cost rate of 0, so it is safe on real data. Guard key: `migrations.v2_backfill_done` in `settings`.
  2. Only if `SEED_V2_DEMO=1`: `seedV2Demo()` adds the version 2 demo documents, each step skipping when its table already has rows. Guard key: `migrations.v2_demo_seeded`.
  3. The whole step is wrapped in `try/catch`, so a failure is logged and boot continues. The first cold start after a deploy waits for the backfill; two parallel cold starts may both run it, which is harmless because it is idempotent.
- The upgrade path was tested on a copy of the version 1 database before release (see [TEST_REPORT.md](TEST_REPORT.md)).
- For go-live, clear the transaction tables (now including the version 2 tables; see the DevOps guide) and keep the masters.
- Backups: Neon point-in-time restore (1 day on the free tier, 7 to 30 days on paid plans), plus weekly Excel exports of the masters as an extra safety net.

## 10. Scalability and future work
- The expected volumes (hundreds of quotes a year, thousands of lines) are tiny for Postgres. Indexes cover the busy paths (status, item and date, due dates, AMC end date, visit due date, service call status).
- Future: distributorship stock with allocations (the tables already exist), Tally XML export, WhatsApp Business API reminders, a customer portal for refill and AMC certificates, server-side PDF generation, bill photo upload for expenses and multiple branches. New work after version 2 is taken by written change request.

## 11. Architecture decision records (summary)
| ADR | Decision | Why |
|---|---|---|
| 001 | One Next.js app (monolith) | One unit to deploy, the cheapest to run, and right for a small team. |
| 002 | Postgres and Drizzle, with PGlite as a fallback | Proper relational integrity for money flows, and a demo that needs no setup. |
| 003 | A rule engine instead of AI | No running cost, and alerts that are predictable and easy to explain, as the client asked. |
| 004 | Outbox pattern for email | Retries, a record of what was sent, and a safe demo mode. |
| 005 | The purchase invoice is the source of truth for cost | It removes manual price checking, which is the core pain point. |
| 006 | Doubles for money, rounded to 2 decimal places | Kept simple because volumes are small. Revisit (numeric type) if an accounting integration needs ledgers exact to the paisa. |
| 007 | **Additive migrations with a boot-time, guarded upgrade** (v2) | The live demo already holds data. Only adding tables and columns (with defaults) means no existing row can be lost, and a one-time upgrade guarded by `settings` keys (`migrations.v2_backfill_done`, `migrations.v2_demo_seeded`) fills new fields without a manual step. Failure never blocks boot. Future versions follow the same pattern with their own guard keys. |
| 008 | **Delivery cost snapshot for order P&L** (v2) | The cost of goods for an order is the item's latest cost **at the moment of delivery**, saved on `delivery_lines.cost_rate`. Later price changes do not rewrite past profit, returns are valued at the same cost, and the P&L can be calculated from saved figures without guessing which purchase supplied which delivery. |
| 009 | **One design system and shared page patterns** (v2.1) | Every screen uses the same tokens, navigation model (`nav.ts`), page patterns (list, detail, form, board, report, A4 document) and components (`src/components/patterns`). This keeps about 95 screens consistent, makes new modules quicker to build and makes the app easier to learn for staff. See [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) and [UX_AUDIT.md](UX_AUDIT.md). |

## 12. Revision history
| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-11-21 | First version |
| 2.0 | 2026-11-26 | Version 2 modules, tables, data flows, profit formulas, the upgrade path, `SEED_V2_DEMO`, ADR-007 and ADR-008 |
| 2.1 | 2026-11-26 | UI rebuild: navigation groups in the module map, design system, ADR-009 |

---

Prepared by Sirah Digital · https://sirahdigital.in/
