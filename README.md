# Linga Bhairavi Enterprise: Fire Safety CRM

This is the master project record, so start here. It sums up everything we have decided and built so far, and links to the detailed documents. Please update it after every client meeting (see [§9](#9-how-to-update-after-the-next-meeting)).

| | |
|---|---|
| Client | Linga Bhairavi Enterprise, Hosur (Tamil Nadu). A fire-protection turnkey contractor: extinguishers (new and refilling), hydrant, sprinkler, fire alarm, PA and voice evacuation |
| Delivered by | Sirah Digital (https://sirahdigital.in/) |
| Kickoff meeting | 2026-11-20. Recording `kcs-edcx-tez (2026-11-20 16_44 GMT+5_30).mp4` (31 min, Tamil and English), transcribed using Sarvam AI speech-to-text |
| Client follow-up | 2026-11-26. New asks: returns, AMC, advances, owner approval, BOQ import, P&L and project history (all built in version 2). Clarification meeting requested by the owner's spouse for **Friday 2026-11-28** |
| Live demo | https://lbe-fire-crm.vercel.app (demo logins below) |
| Source | https://github.com/riyazlive04/lingam_bhairavi_crm (every push to `main` deploys to Vercel automatically) |
| Status | **Version 2.1**: version 2 features plus the full UI rebuild, tested and security-reviewed. We are waiting on some client inputs (see [§8](#8-open-items-and-next-steps)). |

---

## 1. What the client asked for
Kickoff notes: [docs/meetings/2026-11-20-kickoff-meeting.md](docs/meetings/2026-11-20-kickoff-meeting.md) · Full transcript: [docs/meeting-transcript.md](docs/meeting-transcript.md) · Requirements: [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)

### 1.1 Kickoff meeting, 2026-11-20

| # | Pain point or requirement (client's words, paraphrased) | Where we solved it |
|---|---|---|
| 1 | "Keep a standard BOQ per system. Select hydrant and size, and the standard bill of quantities appears. Zero qty must not appear, and nothing should be skipped." | **Sell → BOQ templates → Quotations** (`/boq-templates`, `/quotations/new`) |
| 2 | "Take the latest price automatically. We check every price with suppliers by hand for each quote, so quotes get delayed." | **Purchase invoices** update the **Item & price master**, so the latest buying rate is picked up automatically. Each quote line now also shows the price date and supplier, with a stale mark |
| 3 | "Price history: this month, last month, 2024, 2025, 2026, taken from supplier invoices. We buy from 3 or 4 suppliers." | `/items/[id]`: purchase history, year-wise min/avg/max, a chart and a vendor comparison |
| 4 | "After giving the quotation, a proper follow-up tracker: to whom, converted or not." | **Follow-ups** (`/follow-ups`), the quotation status pipeline and conversion stats |
| 5 | "A customer PO has 10 lines. 9 are delivered and 1 is forgotten under pressure from other orders. It must pop up when we open the system. Mark in-transit, and get scheduled reminders." | **Orders & delivery** line-level tracking, the **login pop-up** and the **Pending Delivery agent** |
| 6 | "Purchase invoices must be recorded and link automatically with the item master and vendor master." | Posting a purchase invoice updates price history, vendor items, stock, the project cost centre and (v2) the vendor PO it was raised from |
| 7 | "Vendor master: supplier, items, category, rates." | **Vendors** (`/vendors/[id]` shows items supplied, rates and how competitive each vendor is) |
| 8 | "Sales price history kept separate from purchase (there is a 40 to 50% difference)." | Item page: a separate sales section (last quoted or sold price per customer, and margin) |
| 9 | "Refilling every 1 or 3 years. Remind us 10 days before expiry, internally only. No customer notification." | **Service → Refills** (`/refills`) and the **Refill & HPT agent** |
| 10 | "Project cost centre: petrol, lodging and material all add to the project costing sheet. Split a trip across 2 sites. How much was given, spent and still standing." | **Projects** and **Expenses** (split allocation and approvals), now with project history and buy vs sell |
| 11 | "Vendor outstanding and customer outstanding. Send an email automatically when the outstanding date comes (Office 365)." | **Billing & outstanding**, ledger statements and the **Receivables (dunning) agent** |
| 12 | Future: distributorship stock. "100 panels: who asked, and the allocations." | **Stock** with reservations and allocations (ready now) |
| 13 | "The last CRM failed because staff didn't enter data." | **Data Hygiene agent**, the login digest, the audit log and only a few required fields |
| 14 | "Budget-friendly." | Vercel and Neon, and **zero AI credits** (the agents are rule-based). For commercial use the hosting needs Vercel Pro or a small VPS (see §8) |

### 1.2 Client follow-up, 2026-11-26 (version 2)

| # | New ask | Where we solved it | REQ |
|---|---|---|---|
| 15 | The owner wants to approve quotations before they go out | **Approval before sending** setting (Off / Only below minimum margin / All quotations), Request approval, Approve or Reject with a note | REQ-045 |
| 16 | Show how old each price is and who supplied it | Price date, supplier and a **stale** mark on every quote line | REQ-046 |
| 17 | Consultants send their own BOQ in Excel | **Sell → Import BOQ** (`/boq-import`) with automatic item matching. On the client's sample: **95 of 150 lines matched automatically, 55 to check, 0 unmatched** | REQ-047 |
| 18 | Order material from vendors against a customer PO | **Buy → Purchase orders** (`/purchase-orders`), raised from pending order lines and received through purchase invoices | REQ-048 |
| 19 | Customers return goods, and we return goods to vendors | **Deliver → Returns** (`/returns`): GST **credit notes** and vendor **debit notes**, adjustable against invoices and bills | REQ-049 |
| 20 | AMC contracts and breakdown calls | **Service → AMC** (`/amc`) with scheduled visits, per-system checklists and renewals; **Service → Service calls** (`/service-calls`) with response deadlines | REQ-050, REQ-051 |
| 21 | Customers pay advances | **Money → Advances** (`/billing/advances`), applied to invoices, with receipts. Outstanding is now **net**: invoices − credit notes − advances | REQ-052, REQ-053 |
| 22 | Are we making money, month by month and job by job? | **Money → Reports & profit** (`/reports`): monthly P&L, and order, project, customer and item profitability (buy vs sell) | REQ-054, REQ-055 |
| 23 | See everything that happened on a project in one place | **Project history** timeline (`/projects/[id]/history`) | REQ-056 |

## 2. What we built
A responsive web app that works on desktop and phone, with role-based access for Owner/Admin, Sales, Purchase, Accounts, Site Engineer and Store. Since the UI rebuild (v2.1), the menu is grouped by task: **Home, Sell, Deliver, Buy, Money, Projects & site, Service, Automation and Admin**. A **New** menu in the top bar gives quick access to New quotation, Import BOQ, Record payment, Record advance, New expense and New service call. On phones, a **bottom tab bar** shows the four screens each role uses most, plus More.

| Group | Module | Route | Highlights |
|---|---|---|---|
| Home | Home | `/` | KPIs for each role: pipeline, conversion, pending PO lines, receivables and payables, refills and AMC due, project margins, hours saved |
| Sell | Quotations | `/quotations` | Start from a BOQ template, an imported BOQ or blank. Only lines with a quantity are saved. Rates = latest cost × markup, with price date, supplier and stale mark per line. **Owner approval** when the setting requires it. Revise or duplicate. **Excel export in the client's SUPPLY/ERECTION format**, A4 print and email |
| Sell | Import BOQ (v2) | `/boq-import` | Upload a consultant's BOQ Excel file; lines are matched to the item master automatically, then reviewed and turned into a quotation |
| Sell | Follow-ups | `/follow-ups` | Overdue, today, upcoming and unscheduled. Call and WhatsApp links. Log the outcome and next date |
| Sell | Customers, BOQ templates | `/customers`, `/boq-templates` | Customer master with net outstanding, history and assets. 7 templates (4 taken word for word from the client's sample quotation) |
| Deliver | Orders & delivery | `/orders` | Customer POs with status per line (ordered, in transit, partial, delivered), challans, a pending-lines board, linked vendor POs and order P&L |
| Deliver | Returns (v2) | `/returns` | Customer returns with GST credit notes (optionally back into stock), returns to vendor with debit notes, adjustment against open invoices and bills |
| Buy | Purchase orders (v2) | `/purchase-orders` | Vendor POs raised from customer PO lines or by hand, A4 print, received by creating a purchase invoice from the PO |
| Buy | Purchase invoices | `/purchases` | Draft → Post. Warnings on price jumps of 5% or more. Payments and project tagging |
| Buy | Vendors, Item & price master, Stock | `/vendors`, `/items`, `/stock` | 503 items from the client's price list, with a size × price matrix like their Excel. On hand, reserved and available stock; issues, returns, adjustments and allocations |
| Money | Billing & outstanding | `/billing` | Tax invoices (CGST/SGST or IGST), payments in and out, receipts, net ageing, ledger statements and Excel exports |
| Money | Advances (v2) | `/billing/advances` | Record advances against an order, a project or on account, and apply them to invoices later |
| Money | Reports & profit (v2) | `/reports` | Monthly P&L and profitability by order, project, customer and item, with Excel export (admin and accounts only) |
| Money | Email outbox | `/emails` | Every automatic or manual email. Sent through Office 365 SMTP once configured (only logged in demo mode) |
| Projects & site | Projects, Expenses | `/projects`, `/expenses` | Contract vs budget vs actual, materials, purchases and expenses, billed and received (including advances), buy vs sell, **project history** and an Excel costing sheet. Expense vouchers from the phone, split across projects, approve or reject |
| Service | AMC (v2) | `/amc` | Contracts with systems covered, period, value, visits per year scheduled automatically, per-system visit checklists, contract and visit report prints, invoicing and renewal |
| Service | Service calls (v2) | `/service-calls` | Breakdown calls with priority, engineer and a response deadline; chargeable calls can be invoiced |
| Service | Refills | `/refills` | Due buckets. Record a refill and the next due date is set for you. **One-click refill quotation** and WhatsApp reminder text |
| Automation | Alerts, Automation agents | `/alerts`, `/agents` | 12 rule-based agents. Enable or disable them, set thresholds, run now, see history and hours saved. An alert inbox with snooze and done |
| Admin | Meeting notes, Settings & users, Help | `/meeting-notes`, `/settings`, `/help` | Versioned meeting notes with open action items carried forward. Company profile, pricing defaults and the approval setting, users and roles, system status and the audit log. In-app help with a guide for each role |

Every print (quotation, invoice, receipt, PO, credit and debit note, AMC contract, visit report, project history) uses the same **A4 document layout**. Deletes and other risky actions ask for confirmation on the page instead of a browser pop-up, and tables have a compact density option.

## 3. Rule-based automation agents (no AI credits)
Details, rules, thresholds and assumptions are in [docs/AUTOMATION_AGENTS.md](docs/AUTOMATION_AGENTS.md). The agents run every day at 08:00 IST (Vercel Cron), and also at login if the last run is more than 6 hours old. Running them twice does no harm: there are no duplicate alerts or emails, and an alert closes itself once the work is done.

| Agent | What it does |
|---|---|
| Quote Validity | Warns 3 days before a quote's validity ends, and expires lapsed quotes automatically |
| Pending Delivery | Lists every undelivered customer-PO line, overdue first (the client's biggest pain point) |
| Follow-up | Quotes whose follow-up date has passed, and sent quotes with no follow-up after 3 days |
| Refill & HPT | Extinguishers due for refill or pressure test within 10 days or overdue, grouped by customer |
| AMC & Service (v2) | AMC visits due within 7 days or missed, renewals from 30 days before the end date, and service calls past their response deadline |
| Receivables (dunning) | One combined reminder email per customer for overdue invoices (every 7 days, up to 3), then an alert to call |
| Payables | Vendor bills falling due within 7 days, or overdue |
| Stale Price | Pipe and cable prices older than 7 days, and other prices older than 90 days, for items in use |
| Margin Guard | Quotes below the 15% minimum margin, or lines priced below cost |
| Low Stock | Available stock at or below the re-order level |
| Project Budget | Spend at 80% (warning) or 100% (critical) of budget |
| Data Hygiene | Won quotes without an order, **quotes waiting for the owner's approval (v2)**, delivered but not invoiced, pending expense approvals, draft bills not posted, idle projects, quiet quotes, customers without email |

We estimate a saving of about **50 hours a month** (the assumptions are in the agents document). The bigger win is the losses it prevents: forgotten follow-ups, missed deliveries, quotes priced on old pipe rates, missed refill and AMC renewal revenue and late breakdown calls.

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

Demo data: 503 items (the client's price list plus demo prices), 7 BOQ templates, 12 customers, 10 vendors, 40 purchase invoices over 30 months (for price history), 18 quotations, 6 customer POs (some lines overdue), 10 sales invoices (some overdue), 5 projects, 25 expense vouchers and 60 extinguishers.

**Version 2 demo data:** 4 vendor POs (one part-received against a customer PO, one fully received, one draft, one cancelled), 2 customer credit notes, 1 vendor debit note, 2 customer advances (one partly applied), 5 AMC contracts (one ending in 20 days, one lapsed, with a missed visit, a visit due in 5 days and completed visits with checklists) and 6 service calls (one past its response deadline). Quote lines also show their price dates. We planted it so every agent has something to show.

How the version 2 demo data gets in: a new, empty database gets it with the normal first-boot seed. A database created before version 2 (such as the live demo) gets it **once** when `SEED_V2_DEMO=1` is set in Vercel; without the flag it only receives the safe data backfill.

> **Note: 462 of the 503 list prices are demo assumptions.** The client's price list has prices for only a few rows, and each assumed item says so in its description. Replace them with real prices (or simply post real purchase invoices) before go-live.

**A 15-minute demo script:** log in as admin → read the pop-up (pending deliveries, refills, receivables) → **New → Import BOQ** with a consultant's Excel file and see the matched, to-check and unmatched lines → or open `/quotations/new` with the Hydrant & Sprinkler New Installation (Sample 1) template, enter a few quantities and see latest-cost pricing, price dates and margins → save → log in as sales and **Request approval**, then approve as admin → Excel export and A4 print → Mark Won, and an order is created → raise a **vendor PO** from the pending lines → `/purchases/new` from the PO, post it at a higher pipe rate → `/items` shows the new latest price → record a delivery, then a customer **return** with its credit note → **Money → Advances**, apply an advance to an invoice → `/projects/[id]` costing sheet and **History** → `/amc` contract with its visits and checklist → **Money → Reports & profit** → `/agents` Run all agents now → `/alerts`.

## 5. Architecture (summary)
Full document: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · Code conventions and business rules 1 to 20: [app/CONVENTIONS.md](app/CONVENTIONS.md) · Design system: [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)

- **Next.js 15** (App Router, Server Components, Server Actions) · TypeScript · Tailwind v4
- **Postgres on Neon** (Vercel Marketplace) through **Drizzle ORM**, with embedded **PGlite** for the local and offline demo. Migrations are embedded and applied automatically, and the first boot seeds the database.
- **Version 2 upgrade path:** migration `0001` is additive only (new tables and columns with defaults). On a database that already has data, a one-time upgrade fills the new fields, guarded by the settings keys `migrations.v2_backfill_done` and `migrations.v2_demo_seeded`; if it fails, it is logged and the app still starts (ADR-007).
- Auth: bcrypt and an httpOnly JWT cookie. Role checks run in middleware, on every page and in every action, and the session is checked against the database on each request
- Email: outbox table → Office 365 SMTP · Excel: exceljs · Cron: Vercel Cron (Mumbai region `bom1`, `app/vercel.json`)
- Rule engine: `app/src/lib/agents/` (12 agents, plain and predictable SQL and TypeScript)
- UI: one design system with shared page patterns (list, detail, form, board, report, A4 document) and a single navigation model in `app/src/components/nav.ts` (ADR-009)

## 6. Quality and security
- **Tests:** **197 unit and integration tests** (175 unit, 22 integration on a seeded database) and **66 of 66 HTTP end-to-end checks** pass against a live build. A crawler visits **about 990 pages across all 6 roles with 0 problems**. The upgrade path was tested on a copy of the version 1 database. A visual review of every screen in a browser is still pending. See [docs/TEST_REPORT.md](docs/TEST_REPORT.md).
- **Security review:** version 1 had no High findings, and all 6 Medium findings are fixed. The version 2 review (V2-01 to V2-17) found 3 Medium issues (credit note value from the form, BOQ upload zip bombs, vendor PO totals shown to engineers), all fixed, plus 2 Low issues fixed and the rest accepted or confirmed OK. The owner approval gate closes the earlier finding S-16. See [docs/SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md).

## 7. Guides
**Project documents:** [Requirements](docs/REQUIREMENTS.md) · [Architecture](docs/ARCHITECTURE.md) · [Automation agents](docs/AUTOMATION_AGENTS.md) · [Design system](docs/DESIGN_SYSTEM.md) · [UX audit](docs/UX_AUDIT.md) · [Test report](docs/TEST_REPORT.md) · [Security review](docs/SECURITY_REVIEW.md) · [Meeting notes](docs/meetings/README.md)

**For our team (how to build, run and extend):** [Manager](docs/guides/manager.md) · [Business Consultant](docs/guides/business-consultant.md) · [Architect](docs/guides/architect.md) · [UI/UX Designer](docs/guides/ui-ux-designer.md) · [Frontend](docs/guides/frontend-developer.md) · [Backend](docs/guides/backend-developer.md) · [Full-stack](docs/guides/fullstack-developer.md) · [Tester](docs/guides/tester.md) · [Security](docs/guides/security-engineer.md) · [DevOps](docs/guides/devops.md)

**For the client's staff (daily use, also in the app under Admin → Help):** [Owner/Admin](docs/user-guides/owner-admin.md) · [Sales](docs/user-guides/sales.md) · [Purchase](docs/user-guides/purchase.md) · [Accounts](docs/user-guides/accounts.md) · [Site Engineer](docs/user-guides/site-engineer.md) · [Store](docs/user-guides/store.md)

**Developer quick start**
```bash
cd app
npm install                 # .npmrc sets legacy-peer-deps
npm run dev                 # http://localhost:3000, embedded PGlite at ./.data, auto-seeded
npm test                    # unit + integration (E2E: set E2E_BASE_URL)
npm run build
npm run guides              # copy docs/user-guides into the in-app Help after editing them
node scripts/smoke-crawl.mjs http://localhost:3000 300   # crawl every page as every role
```
To change the schema: edit `app/src/db/schema.ts`, run `npx drizzle-kit generate`, then `node scripts/embed-migrations.mjs`, then commit. Keep migrations additive, and put any data fix for existing databases behind its own guard key (see ADR-007). To deploy, push to `main`.

## 8. Open items and next steps
**Next meeting:** clarification meeting on **Friday 2026-11-28**, requested by the owner's spouse (kickoff action item A-14). Walk through version 2 and collect decisions on the points below.

**Waiting on the client** (see the action items in the meeting notes):
1. 4 sample BOQs or quotations exactly as sent to customers, plus the billing (invoice) format
2. Website details and the **Office 365 sender mailbox** (SMTP credentials), so emails move from "logged" to "sent"
3. Real prices for the price list (or opening purchase invoices), and confirmation of: the price unit for pipes (per metre or per 6 m length), the default markup (we assumed 40%) and minimum margin (15%), the approval mode (we set "only below minimum margin"), the basis for erection rates, GST/IGST cases and refill intervals for each type
4. Version 2 decisions: who may post credit notes (V2-09), whether Store may see buying rates on vendor POs and debit notes (V2-07), the AMC checklist for each system and the default response hours for service calls
5. Confirmation with Jagan sir, and the list of staff and their roles
6. 19 open questions, listed in §7 of the kickoff notes

**Before go-live** (from the security review checklist):
- Remove `SHOW_DEMO_LOGINS` **and** `SEED_V2_DEMO` in Vercel, reset or delete the demo users and create real users
- Clear the demo transactions, including the version 2 tables (POs, returns, advances, AMC, service calls), and keep the masters (see the [DevOps guide](docs/guides/devops.md))
- **Hosting plan:** Vercel Hobby is for non-commercial use only. Move to **Vercel Pro** for commercial use, or to a small VPS
- Set the `SMTP_*` variables for the **Office 365** mailbox, enable Neon point-in-time restore, and turn on Vercel 2FA and deployment protection
- **Rotate the Sarvam API key** (it was shared in chat). It is kept only in the git-ignored `.env.local` at the project root and is never deployed.
- **The GitHub repository is public.** It holds the meeting transcript and the client's business details. Make it private unless that is intended.
- A visual review of every screen in a browser (desktop and phone), then client UAT

**Commercial note:** the client chose the **Complete** package at **INR 90,000 + GST** (negotiated). The 50% advance was received on **25 Nov 2026**. **Owner approval and the consultant BOQ import are included at no extra cost.** **Returns, AMC, advances, vendor POs, P&L reports and project history** were added beyond the agreed scope as goodwill. Any future changes will be taken up by **written change request**, with scope and cost agreed before work starts.

**Possible next items (by change request):** Tally export, WhatsApp Business API reminders, bill photo upload for expenses, server-side PDF, payment reversal, back-order allocations, a customer portal for refill and AMC certificates.

## 9. How to update after the next meeting
1. Put the new recording in the project root, then run:
   `python -I scripts/transcribe_meeting.py "<recording>.mp4" "<topic>"`
   This uses Sarvam AI (`SARVAM_API_KEY` in the root `.env.local`) and `ffmpeg`. It creates `docs/meetings/<date>-<topic>-transcript.md` and a notes outline with **open action items carried forward**.
2. Fill in the notes. Add or change requirements in [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) (keep the REQ IDs, carry on from REQ-058 and record each change in its change log).
3. If you like, paste the notes into the CRM under **Admin → Meeting notes → New** (every edit is saved as a version with a change summary).
4. If a user guide changes, run `npm run guides` in `app/` so the in-app Help matches.
5. Update §1, §8 and the revision table below.

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-11-21 | Kickoff transcribed. Requirements, architecture and guides written. v1.0 built, tested, security-reviewed and deployed |
| 2.0 | 2026-11-26 | Client follow-up recorded. Version 2 built: owner approval of quotations, price date and stale mark on quote lines, consultant BOQ import, vendor POs, customer returns and vendor returns with credit and debit notes, advances and receipts, net outstanding, AMC contracts and service calls, monthly P&L and profitability, project history, the AMC & Service agent and the approvals check. Additive migration 0001 with a one-time upgrade on boot and the `SEED_V2_DEMO` flag. Security review of the new code; 197 automated tests |
| 2.1 | 2026-11-26 | UI rebuild: task-based navigation groups, New quick create menu, phone bottom tab bar per role, shared page patterns, A4 layout for every print, inline confirms and a density option. Design system and UX audit documented. All documents brought up to date for version 2 |

---

Prepared by Sirah Digital · https://sirahdigital.in/
