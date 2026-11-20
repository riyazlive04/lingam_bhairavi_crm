# Linga Bhairavi Enterprise — Fire Safety CRM

**Master project record.** Start here. It summarises everything decided and built so far and links to the detailed documents. Update it after every client meeting (see [§9](#9-how-to-update-after-the-next-meeting)).

| | |
|---|---|
| Client | Linga Bhairavi Enterprise, Hosur (Tamil Nadu): fire-protection turnkey contractor (extinguishers new and refilling, hydrant, sprinkler, fire alarm, PA / voice evacuation) |
| Delivered by | Sirah Digital |
| Kickoff meeting | 2026-11-20, recording `kcs-edcx-tez (2026-11-20 16_44 GMT+5_30).mp4` (31 min, Tamil/English), transcribed with Sarvam AI |
| Live demo | **https://lbe-fire-crm.vercel.app** (demo logins below) |
| Source | https://github.com/riyazlive04/lingam_bhairavi_crm (pushes to `main` auto-deploy to Vercel) |
| Status | v1.0 working demo with all requested features. Awaiting client inputs (see [§8](#8-open-items-and-next-steps)). |

---

## 1. What the client asked for (kickoff meeting, 2026-11-20)
Full notes: [docs/meetings/2026-11-20-kickoff-meeting.md](docs/meetings/2026-11-20-kickoff-meeting.md) · Full transcript: [docs/meeting-transcript.md](docs/meeting-transcript.md) · Requirements: [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)

| # | Pain point / requirement (client's words, paraphrased) | Where it is solved |
|---|---|---|
| 1 | "Keep a standard BOQ per system. Select hydrant + size and the standard bill of quantities appears. Zero qty must not appear, and nothing should be skipped." | **BOQ Templates → Quotations** (`/boq-templates`, `/quotations/new`) |
| 2 | "Take the latest price automatically. We verify every price with suppliers manually against each quote, so quotes get delayed." | **Purchase Invoices** update the **Item & Price Master** (latest procured rate is picked automatically) |
| 3 | "Price history: this month, last month, 2024, 2025, 2026, picked from supplier invoices. We buy from 3–4 suppliers." | `/items/[id]`: purchase history, year-wise min/avg/max, chart, vendor comparison |
| 4 | "After giving the quotation, a proper follow-up tracker: to whom, converted or not." | **Follow-ups** (`/follow-ups`), quotation status pipeline, conversion stats |
| 5 | "Customer PO has 10 lines, 9 delivered, 1 forgotten under other orders' pressure. It must pop up when we open the system. Mark in-transit, and get scheduled reminders." | **Orders & Delivery** line-level tracking, **login pop-up**, **Pending Delivery agent** |
| 6 | "Purchase invoices must be recorded and auto-link with item master and vendor master." | Posting a purchase invoice updates price history, vendor-items, stock and the project cost centre |
| 7 | "Vendor master: supplier, items, category, rates." | **Vendors** (`/vendors/[id]` items supplied, rates, competitiveness) |
| 8 | "Sales price history separate from purchase (40–50% difference)." | Item page: separate sales section (last quoted/sold per customer, margin) |
| 9 | "Refilling every 1 or 3 years. Remind us 10 days before expiry, internally only, no customer notification." | **Refill Tracker** (`/refills`) and **Refill Due agent** |
| 10 | "Project cost centre: petrol, lodging and material all add to the project costing sheet. Split a trip across 2 sites. How much given, spent, standing." | **Projects & Costing** and **Expenses** (split allocation, approvals) |
| 11 | "Vendor outstanding and customer outstanding. Auto-email when the outstanding date comes (Office 365)." | **Billing & Outstanding**, ledger statements, **Receivables (dunning) agent** |
| 12 | Future: distributorship stock, "100 panels — who asked, allocations". | **Stock** with reservations/allocations (ready now) |
| 13 | "The last CRM failed because staff didn't enter data." | **Data Hygiene agent**, login digest, audit log, minimal required fields |
| 14 | "Budget-friendly." | Vercel + Neon free tiers, **zero AI credits** (rule-based agents) |

## 2. What was built
A responsive web app (desktop and phone) with role-based access for **Owner/Admin, Sales, Purchase, Accounts, Site Engineer, Store**.

| Module | Route | Highlights |
|---|---|---|
| Dashboard | `/` | Role-aware KPIs: pipeline, conversion, pending PO lines, receivables/payables, refills due, project margins, hours saved |
| Automation agents | `/agents`, `/alerts` | 11 rule-based agents, enable/disable, thresholds, run now, history, hours saved; alert inbox with snooze/done |
| Quotations | `/quotations` | From a BOQ template or blank; qty-only lines saved; rates = latest cost × markup; margin guard; revise/duplicate; **Excel export in the client's SUPPLY/ERECTION format**; print/PDF; email |
| Follow-ups | `/follow-ups` | Overdue / today / upcoming / unscheduled; call and WhatsApp links; log outcome and next date |
| BOQ Templates | `/boq-templates` | 7 templates (4 from the client's sample quotation, verbatim) |
| Orders & Delivery | `/orders` | Customer POs, per-line status (ordered / in transit / partial / delivered), challans, pending-lines board |
| Billing | `/billing` | Tax invoices (CGST/SGST or IGST), payments in/out, ageing, ledger statements, Excel exports |
| Email outbox | `/emails` | Every automatic or manual email; Office 365 SMTP when configured (logged in demo mode) |
| Purchase invoices | `/purchases` | Draft → Post; price-jump warnings (≥5%); payments; project tagging |
| Item & Price Master | `/items` | 503 items from the client's price list; size × price matrix like their Excel; history and export |
| Vendors / Customers | `/vendors`, `/customers` | Masters with outstanding, history, items supplied, assets |
| Stock | `/stock` | On hand / reserved / available, issue to project, returns, adjustments, allocations |
| Projects & Costing | `/projects` | Contract vs budget vs actual; materials, purchases, expenses; billed/received; Excel costing sheet |
| Expenses | `/expenses` | Mobile voucher entry, split across projects, approve/reject |
| Refill Tracker | `/refills` | Due buckets; record refill (auto next-due); **one-click refill quotation**; WhatsApp reminder text |
| Meeting Notes | `/meeting-notes` | Versioned notes with revision history and carry-forward of action items; Markdown export |
| Settings | `/settings` | Company profile, pricing defaults, users and roles, system status, audit log |

## 3. Rule-based automation agents (no AI credits)
Details, rules, thresholds and assumptions: [docs/AUTOMATION_AGENTS.md](docs/AUTOMATION_AGENTS.md). They run daily at **08:00 IST** (Vercel Cron) and on login if the last run is more than 6 h old. Runs are idempotent (no duplicate alerts or emails), and an alert closes itself once the work is done.

| Agent | What it does |
|---|---|
| Pending Delivery | Every undelivered customer-PO line, overdue first (the client's #1 pain point) |
| Follow-up | Quotes whose follow-up date has passed, and sent quotes never followed up |
| Quote Expiry | Warns before validity ends; auto-expires lapsed quotes |
| Refill Due | Extinguishers due in 10 days or overdue, grouped per customer; HPT due |
| Receivables (dunning) | One consolidated reminder email per customer for overdue invoices (repeat every 7 days, capped) |
| Payables | Vendor bills due within the lead window |
| Stale Price | Pipe/cable prices older than 7 days, others older than 90 days, for items in use |
| Margin Guard | Quotes below minimum margin or lines below cost |
| Low Stock | Available below reorder level |
| Project Budget | Spend at 80% (warning) or 100% (critical) of budget |
| Data Hygiene | Won quotes without an order, delivered but not invoiced, pending expense approvals, draft bills left unposted, customers without email, idle projects |

Estimated saving ≈ **46 hours/month** (assumptions in the agents document). The bigger win is avoided losses: forgotten follow-ups, missed deliveries, quoting on stale pipe rates, missed refill revenue.

## 4. Demo
- URL: **https://lbe-fire-crm.vercel.app**
- Password for all demo users: `Demo@123`

| Email | Role |
|---|---|
| `admin@lbe.demo` | Owner / Admin |
| `sales@lbe.demo` | Sales |
| `purchase@lbe.demo` | Purchase |
| `accounts@lbe.demo` | Accounts |
| `engineer@lbe.demo` | Site Engineer |
| `store@lbe.demo` | Store |

Demo data: 503 items (client price list plus demo prices), 7 BOQ templates, 12 customers, 10 vendors, 40 purchase invoices over 30 months (price history), 18 quotations, 6 customer POs (some lines overdue), 10 sales invoices (some overdue), 5 projects, 25 expense vouchers and 60 extinguishers. It is planted so every agent has something to show.

> ⚠️ **462 of 503 list prices are demo assumptions.** The client's price list has prices for only a few rows. Each assumed item says so in its description. Replace them with real prices (or simply post real purchase invoices) before go-live.

**Suggested 10-minute demo script:** log in as admin → read the pop-up (pending deliveries, refills, receivables) → `/quotations/new` with the "Hydrant & Sprinkler — Sample 1" template, enter a few quantities and see latest-cost pricing and margins → save → Excel export → Mark Won → order created → `/orders` pending lines → `/purchases/new`, post an invoice at a higher pipe rate → `/items` shows the new latest price → `/projects/[id]` costing sheet → `/refills`, select due units → Create refill quotation → `/agents` Run all → `/alerts`.

## 5. Architecture (summary)
Full document: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · Code conventions: [app/CONVENTIONS.md](app/CONVENTIONS.md)

- **Next.js 15** (App Router, Server Components, Server Actions) · TypeScript · Tailwind v4
- **Postgres on Neon** (Vercel Marketplace) via **Drizzle ORM**; embedded **PGlite** for local/offline demo. Migrations are embedded and auto-applied; the first boot seeds the database.
- Auth: bcrypt + httpOnly JWT cookie; RBAC enforced in middleware, every page and every action; session re-validated against the DB per request
- Email: outbox table → Office 365 SMTP · Excel: exceljs · Cron: Vercel Cron (Mumbai region `bom1`)
- Rule engine: `app/src/lib/agents/` (deterministic SQL/TypeScript)

## 6. Quality and security
- **Tests:** 132 automated tests pass (59 unit, 7 integration on a seeded database, 66 HTTP end-to-end). A crawler visits about 540 pages across all 6 roles: 0 errors, 0 broken or forbidden links. See [docs/TEST_REPORT.md](docs/TEST_REPORT.md).
- **Security review:** no High findings; all 6 Medium fixed (session revalidation, login open-redirect, preview secret, CSP/framing, store-role order rights, DB error leakage). See [docs/SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md).

## 7. Guides
**Team (how to build, run and extend):** [Manager](docs/guides/manager.md) · [Business Consultant](docs/guides/business-consultant.md) · [Architect](docs/guides/architect.md) · [UI/UX Designer](docs/guides/ui-ux-designer.md) · [Frontend](docs/guides/frontend-developer.md) · [Backend](docs/guides/backend-developer.md) · [Full-stack](docs/guides/fullstack-developer.md) · [Tester](docs/guides/tester.md) · [Security](docs/guides/security-engineer.md) · [DevOps](docs/guides/devops.md)

**Client staff (daily use):** [Owner/Admin](docs/user-guides/owner-admin.md) · [Sales](docs/user-guides/sales.md) · [Purchase](docs/user-guides/purchase.md) · [Accounts](docs/user-guides/accounts.md) · [Site Engineer](docs/user-guides/site-engineer.md) · [Store](docs/user-guides/store.md)

**Developer quick start**
```bash
cd app
npm install                 # .npmrc sets legacy-peer-deps
npm run dev                 # http://localhost:3000, embedded PGlite at ./.data, auto-seeded
npm test                    # unit + integration (E2E: set E2E_BASE_URL)
npm run build
node scripts/smoke-crawl.mjs http://localhost:3000 300   # crawl every page as every role
```
Schema change: edit `app/src/db/schema.ts`, run `npx drizzle-kit generate`, then `node scripts/embed-migrations.mjs`, then commit. Deploy = push to `main`.

## 8. Open items and next steps
**Waiting on client** (action items in the meeting notes):
1. 4 sample BOQs/quotations exactly as sent to customers, plus the billing (invoice) format
2. Website and **Office 365 sender mailbox** (SMTP credentials) to switch emails from "logged" to "sent"
3. Real prices for the price list (or opening purchase invoices), and confirmation of: price unit for pipes (per metre or per 6 m length), default markup (assumed 40%) and minimum margin (15%), erection-rate basis, GST/IGST cases, refill intervals per type
4. Confirmation with Jagan sir; the list of staff and roles
5. 19 open questions are listed in §7 of the meeting notes

**Before go-live** (from the security review checklist):
- Remove `SHOW_DEMO_LOGINS` in Vercel, reset or delete demo users, create real users
- Truncate demo transactions and keep the masters (see [devops guide](docs/guides/devops.md))
- Set the `SMTP_*` variables; enable Neon point-in-time restore; turn on Vercel 2FA and deployment protection
- **Rotate the Sarvam API key** (it was shared in chat). It is stored only in the git-ignored `.env.local` at the project root and is never deployed.
- **The GitHub repository is public.** It contains the meeting transcript and client business details. Make it private unless that is intended.

**Proposed v1.1 backlog:** owner approval for below-margin quotes (S-16), consultant BOQ Excel import, Tally export, WhatsApp Business API reminders, bill photo upload for expenses, server-side PDF, credit notes / payment reversal, back-order allocations.

## 9. How to update after the next meeting
1. Put the new recording in the project root, then run:
   `python -I scripts/transcribe_meeting.py "<recording>.mp4" "<topic>"`
   This uses Sarvam AI (`SARVAM_API_KEY` in the root `.env.local`) and `ffmpeg`. It creates `docs/meetings/<date>-<topic>-transcript.md` and a notes skeleton with **open action items carried forward**.
2. Fill in the notes; add or modify requirements in [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) (keep REQ IDs, record the change in its change log).
3. Optionally paste the notes into the CRM: **Meeting Notes → New** (every edit is versioned with a change summary).
4. Update §1, §8 and the revision table below in this README.

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-11-21 | Kickoff transcribed; requirements, architecture and guides written; v1.0 built, tested, security-reviewed and deployed |
