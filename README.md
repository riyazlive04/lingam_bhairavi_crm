# Linga Bhairavi Enterprise: Fire Safety CRM

This is the master project record, so start here. It sums up everything we have decided and built so far, and links to the detailed documents. Please update it after every client meeting (see [§9](#9-how-to-update-after-the-next-meeting)).

| | |
|---|---|
| Client | Linga Bhairavi Enterprise, Hosur (Tamil Nadu). A fire-protection turnkey contractor: extinguishers (new and refilling), hydrant, sprinkler, fire alarm, PA and voice evacuation |
| Delivered by | Sirah Digital (https://sirahdigital.in/) |
| Kickoff meeting | 2026-11-20. Recording `kcs-edcx-tez (2026-11-20 16_44 GMT+5_30).mp4` (31 min, Tamil and English), transcribed using Sarvam AI speech-to-text |
| Live demo | https://lbe-fire-crm.vercel.app (demo logins below) |
| Source | https://github.com/riyazlive04/lingam_bhairavi_crm (every push to `main` deploys to Vercel automatically) |
| Status | v1.0 working demo with every requested feature. We are waiting on some client inputs (see [§8](#8-open-items-and-next-steps)). |

---

## 1. What the client asked for (kickoff meeting, 2026-11-20)
Full notes: [docs/meetings/2026-11-20-kickoff-meeting.md](docs/meetings/2026-11-20-kickoff-meeting.md) · Full transcript: [docs/meeting-transcript.md](docs/meeting-transcript.md) · Requirements: [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)

| # | Pain point or requirement (client's words, paraphrased) | Where we solved it |
|---|---|---|
| 1 | "Keep a standard BOQ per system. Select hydrant and size, and the standard bill of quantities appears. Zero qty must not appear, and nothing should be skipped." | **BOQ Templates → Quotations** (`/boq-templates`, `/quotations/new`) |
| 2 | "Take the latest price automatically. We check every price with suppliers by hand for each quote, so quotes get delayed." | **Purchase Invoices** update the **Item & Price Master**, so the latest buying rate is picked up automatically |
| 3 | "Price history: this month, last month, 2024, 2025, 2026, taken from supplier invoices. We buy from 3 or 4 suppliers." | `/items/[id]`: purchase history, year-wise min/avg/max, a chart and a vendor comparison |
| 4 | "After giving the quotation, a proper follow-up tracker: to whom, converted or not." | **Follow-ups** (`/follow-ups`), the quotation status pipeline and conversion stats |
| 5 | "A customer PO has 10 lines. 9 are delivered and 1 is forgotten under pressure from other orders. It must pop up when we open the system. Mark in-transit, and get scheduled reminders." | **Orders & Delivery** line-level tracking, the **login pop-up** and the **Pending Delivery agent** |
| 6 | "Purchase invoices must be recorded and link automatically with the item master and vendor master." | Posting a purchase invoice updates price history, vendor items, stock and the project cost centre |
| 7 | "Vendor master: supplier, items, category, rates." | **Vendors** (`/vendors/[id]` shows items supplied, rates and how competitive each vendor is) |
| 8 | "Sales price history kept separate from purchase (there is a 40 to 50% difference)." | Item page: a separate sales section (last quoted or sold price per customer, and margin) |
| 9 | "Refilling every 1 or 3 years. Remind us 10 days before expiry, internally only. No customer notification." | **Refill Tracker** (`/refills`) and the **Refill Due agent** |
| 10 | "Project cost centre: petrol, lodging and material all add to the project costing sheet. Split a trip across 2 sites. How much was given, spent and still standing." | **Projects & Costing** and **Expenses** (split allocation and approvals) |
| 11 | "Vendor outstanding and customer outstanding. Send an email automatically when the outstanding date comes (Office 365)." | **Billing & Outstanding**, ledger statements and the **Receivables (dunning) agent** |
| 12 | Future: distributorship stock. "100 panels: who asked, and the allocations." | **Stock** with reservations and allocations (ready now) |
| 13 | "The last CRM failed because staff didn't enter data." | **Data Hygiene agent**, the login digest, the audit log and only a few required fields |
| 14 | "Budget-friendly." | Vercel and Neon free tiers, and **zero AI credits** (the agents are rule-based) |

## 2. What we built
A responsive web app that works on desktop and phone, with role-based access for Owner/Admin, Sales, Purchase, Accounts, Site Engineer and Store.

| Module | Route | Highlights |
|---|---|---|
| Dashboard | `/` | KPIs for each role: pipeline, conversion, pending PO lines, receivables and payables, refills due, project margins, hours saved |
| Automation agents | `/agents`, `/alerts` | 11 rule-based agents. Enable or disable them, set thresholds, run now, see history and hours saved. An alert inbox with snooze and done |
| Quotations | `/quotations` | Start from a BOQ template or blank. Only lines with a quantity are saved. Rates = latest cost × markup, with a margin guard. Revise or duplicate. **Excel export in the client's SUPPLY/ERECTION format**, print/PDF and email |
| Follow-ups | `/follow-ups` | Overdue, today, upcoming and unscheduled. Call and WhatsApp links. Log the outcome and next date |
| BOQ Templates | `/boq-templates` | 7 templates (4 taken word for word from the client's sample quotation) |
| Orders & Delivery | `/orders` | Customer POs with status per line (ordered, in transit, partial, delivered), challans and a pending-lines board |
| Billing | `/billing` | Tax invoices (CGST/SGST or IGST), payments in and out, ageing, ledger statements and Excel exports |
| Email outbox | `/emails` | Every automatic or manual email. Sent through Office 365 SMTP once configured (only logged in demo mode) |
| Purchase invoices | `/purchases` | Draft → Post. Warnings on price jumps of 5% or more. Payments and project tagging |
| Item & Price Master | `/items` | 503 items from the client's price list, with a size × price matrix like their Excel. History and export |
| Vendors / Customers | `/vendors`, `/customers` | Masters with outstanding, history, items supplied and assets |
| Stock | `/stock` | On hand, reserved and available. Issue to project, returns, adjustments and allocations |
| Projects & Costing | `/projects` | Contract vs budget vs actual. Materials, purchases and expenses. Billed and received. Excel costing sheet |
| Expenses | `/expenses` | Voucher entry from the phone, split across projects, approve or reject |
| Refill Tracker | `/refills` | Due buckets. Record a refill and the next due date is set for you. **One-click refill quotation** and WhatsApp reminder text |
| Meeting Notes | `/meeting-notes` | Versioned notes with revision history, and open action items carried forward. Markdown export |
| Settings | `/settings` | Company profile, pricing defaults, users and roles, system status and the audit log |

## 3. Rule-based automation agents (no AI credits)
Details, rules, thresholds and assumptions are in [docs/AUTOMATION_AGENTS.md](docs/AUTOMATION_AGENTS.md). The agents run every day at 08:00 IST (Vercel Cron), and also at login if the last run is more than 6 hours old. Running them twice does no harm: there are no duplicate alerts or emails, and an alert closes itself once the work is done.

| Agent | What it does |
|---|---|
| Pending Delivery | Lists every undelivered customer-PO line, overdue first (the client's biggest pain point) |
| Follow-up | Quotes whose follow-up date has passed, and sent quotes that were never followed up |
| Quote Expiry | Warns before a quote's validity ends, and expires lapsed quotes automatically |
| Refill Due | Extinguishers due within 10 days or overdue, grouped by customer. Also HPT due |
| Receivables (dunning) | One combined reminder email per customer for overdue invoices (repeats every 7 days, with a cap) |
| Payables | Vendor bills falling due within the lead window |
| Stale Price | Pipe and cable prices older than 7 days, and other prices older than 90 days, for items in use |
| Margin Guard | Quotes below the minimum margin, or lines priced below cost |
| Low Stock | Available stock below the reorder level |
| Project Budget | Spend at 80% (warning) or 100% (critical) of budget |
| Data Hygiene | Won quotes without an order, delivered but not invoiced, pending expense approvals, draft bills not posted, customers without email, idle projects |

We estimate a saving of about **46 hours a month** (the assumptions are in the agents document). The bigger win is the losses it prevents: forgotten follow-ups, missed deliveries, quotes priced on old pipe rates and missed refill revenue.

## 4. Demo
- URL: https://lbe-fire-crm.vercel.app
- Password for all demo users: `Demo@123`

| Email | Role |
|---|---|
| `admin@lbe.demo` | Owner / Admin |
| `sales@lbe.demo` | Sales |
| `purchase@lbe.demo` | Purchase |
| `accounts@lbe.demo` | Accounts |
| `engineer@lbe.demo` | Site Engineer |
| `store@lbe.demo` | Store |

Demo data: 503 items (the client's price list plus demo prices), 7 BOQ templates, 12 customers, 10 vendors, 40 purchase invoices over 30 months (for price history), 18 quotations, 6 customer POs (some lines overdue), 10 sales invoices (some overdue), 5 projects, 25 expense vouchers and 60 extinguishers. We planted it so every agent has something to show.

> **Note: 462 of the 503 list prices are demo assumptions.** The client's price list has prices for only a few rows, and each assumed item says so in its description. Replace them with real prices (or simply post real purchase invoices) before go-live.

**A 10-minute demo script:** log in as admin → read the pop-up (pending deliveries, refills, receivables) → open `/quotations/new` with the Hydrant & Sprinkler New Installation (Sample 1) template, enter a few quantities and see latest-cost pricing and margins → save → Excel export → Mark Won, and an order is created → `/orders` pending lines → `/purchases/new`, post an invoice at a higher pipe rate → `/items` shows the new latest price → `/projects/[id]` costing sheet → `/refills`, select due units → Create refill quotation → `/agents` Run all → `/alerts`.

## 5. Architecture (summary)
Full document: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · Code conventions: [app/CONVENTIONS.md](app/CONVENTIONS.md)

- **Next.js 15** (App Router, Server Components, Server Actions) · TypeScript · Tailwind v4
- **Postgres on Neon** (Vercel Marketplace) through **Drizzle ORM**, with embedded **PGlite** for the local and offline demo. Migrations are embedded and applied automatically, and the first boot seeds the database.
- Auth: bcrypt and an httpOnly JWT cookie. Role checks run in middleware, on every page and in every action, and the session is checked against the database on each request
- Email: outbox table → Office 365 SMTP · Excel: exceljs · Cron: Vercel Cron (Mumbai region `bom1`)
- Rule engine: `app/src/lib/agents/` (plain, predictable SQL and TypeScript)

## 6. Quality and security
- **Tests:** 132 automated tests pass (59 unit, 7 integration on a seeded database, 66 HTTP end-to-end). A crawler visits about 540 pages across all 6 roles with 0 errors and 0 broken or forbidden links. See [docs/TEST_REPORT.md](docs/TEST_REPORT.md).
- **Security review:** no High findings, and all 6 Medium findings are fixed (session revalidation, login open-redirect, preview secret, CSP and framing, store-role order rights, database error leakage). See [docs/SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md).

## 7. Guides
**For our team (how to build, run and extend):** [Manager](docs/guides/manager.md) · [Business Consultant](docs/guides/business-consultant.md) · [Architect](docs/guides/architect.md) · [UI/UX Designer](docs/guides/ui-ux-designer.md) · [Frontend](docs/guides/frontend-developer.md) · [Backend](docs/guides/backend-developer.md) · [Full-stack](docs/guides/fullstack-developer.md) · [Tester](docs/guides/tester.md) · [Security](docs/guides/security-engineer.md) · [DevOps](docs/guides/devops.md)

**For the client's staff (daily use):** [Owner/Admin](docs/user-guides/owner-admin.md) · [Sales](docs/user-guides/sales.md) · [Purchase](docs/user-guides/purchase.md) · [Accounts](docs/user-guides/accounts.md) · [Site Engineer](docs/user-guides/site-engineer.md) · [Store](docs/user-guides/store.md)

**Developer quick start**
```bash
cd app
npm install                 # .npmrc sets legacy-peer-deps
npm run dev                 # http://localhost:3000, embedded PGlite at ./.data, auto-seeded
npm test                    # unit + integration (E2E: set E2E_BASE_URL)
npm run build
node scripts/smoke-crawl.mjs http://localhost:3000 300   # crawl every page as every role
```
To change the schema: edit `app/src/db/schema.ts`, run `npx drizzle-kit generate`, then `node scripts/embed-migrations.mjs`, then commit. To deploy, push to `main`.

## 8. Open items and next steps
**Waiting on the client** (see the action items in the meeting notes):
1. 4 sample BOQs or quotations exactly as sent to customers, plus the billing (invoice) format
2. Website details and the **Office 365 sender mailbox** (SMTP credentials), so emails move from "logged" to "sent"
3. Real prices for the price list (or opening purchase invoices), and confirmation of: the price unit for pipes (per metre or per 6 m length), the default markup (we assumed 40%) and minimum margin (15%), the basis for erection rates, GST/IGST cases and refill intervals for each type
4. Confirmation with Jagan sir, and the list of staff and their roles
5. 19 open questions, listed in §7 of the meeting notes

**Before go-live** (from the security review checklist):
- Remove `SHOW_DEMO_LOGINS` in Vercel, reset or delete the demo users and create real users
- Clear the demo transactions and keep the masters (see the [DevOps guide](docs/guides/devops.md))
- Set the `SMTP_*` variables, enable Neon point-in-time restore, and turn on Vercel 2FA and deployment protection
- **Rotate the Sarvam API key** (it was shared in chat). It is kept only in the git-ignored `.env.local` at the project root and is never deployed.
- **The GitHub repository is public.** It holds the meeting transcript and the client's business details. Make it private unless that is intended.

**Proposed v1.1 backlog:** owner approval for below-margin quotes (S-16), consultant BOQ Excel import, Tally export, WhatsApp Business API reminders, bill photo upload for expenses, server-side PDF, credit notes and payment reversal, back-order allocations.

## 9. How to update after the next meeting
1. Put the new recording in the project root, then run:
   `python -I scripts/transcribe_meeting.py "<recording>.mp4" "<topic>"`
   This uses Sarvam AI (`SARVAM_API_KEY` in the root `.env.local`) and `ffmpeg`. It creates `docs/meetings/<date>-<topic>-transcript.md` and a notes outline with **open action items carried forward**.
2. Fill in the notes. Add or change requirements in [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) (keep the REQ IDs and record each change in its change log).
3. If you like, paste the notes into the CRM under **Meeting Notes → New** (every edit is saved as a version with a change summary).
4. Update §1, §8 and the revision table below.

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-11-21 | Kickoff transcribed. Requirements, architecture and guides written. v1.0 built, tested, security-reviewed and deployed |

---

Prepared by Sirah Digital · https://sirahdigital.in/
