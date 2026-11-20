# Business Requirements Document (BRD)
## CRM for Linga Bhairavi Enterprise, Hosur

| Field | Value |
|---|---|
| Client | Linga Bhairavi Enterprise, Hosur, Tamil Nadu — fire-protection turnkey contractor |
| Prepared by | Sirah Digital — Business Consultant |
| Version | 1.0 (draft for client review) |
| Date | 2026-11-21 |
| Sources | [Kickoff meeting 2026-11-20](meetings/2026-11-20-kickoff-meeting.md) (transcript: [meeting-transcript.md](meeting-transcript.md)); `Price list for Hydrandt and Fire alarm.xlsx`; `Hydrant,Sprinkler & Fas,PA-Quotation Sampel- Karthick_3122.xlsx` |
| Sign-off | Pending — client (Karthick) and Jagan sir |

Source column notation: `11-20 [mm:ss]` = kickoff meeting 2026-11-20 at that transcript timestamp. `Sirah` = proposed by Sirah Digital to make the stated needs work (not said by the client) — these are **assumptions until the client confirms**.

---

## 1. Purpose and scope

Replace manual, Excel/WhatsApp-driven quoting and tracking with a single web CRM that:

- builds quotations from standard BOQ templates priced from the **latest purchase rate**,
- tracks quotation follow-up and conversion,
- tracks customer PO lines until **every line is delivered**,
- records purchase invoices (price history, vendor rates), project costs and expenses,
- tracks receivables/payables and sends outstanding reminders,
- reminds the team of extinguisher refills due,
- runs **rule-based automation agents** daily (no AI usage cost),

while staying **budget-friendly** and making data entry so easy and visible that it actually gets done (the previous quotation CRM failed for lack of data entry, 11-20 [26:15–27:05]).

Tally/Vyapar remain the statutory accounts system (see Out of scope and Q-11).

---

## 2. Personas and roles

| Role (system) | Persona at Linga Bhairavi | Main goals | Key screens |
|---|---|---|---|
| `admin` (Owner) | Proprietor/partners (Karthick, partner; Jagan sir — role to confirm) | See pipeline, margins, collections, pending deliveries; approve; control prices and markups | Dashboard, Agents, all modules, Settings, Users |
| `sales` | Sales / estimation staff who prepare BOQs and quotations | Quote fast with correct prices; follow up; convert | Customers, BOQ Templates, Quotations, Follow-ups, Sales Orders |
| `purchase` | Purchase staff buying from 3–4 suppliers per item | Record supplier invoices, keep vendor rates current, get material to sites | Vendors, Purchase Invoices, Item & Price Master |
| `accounts` | Accounts staff (also maintains Tally/Vyapar) | Raise invoices, record payments, chase outstanding, approve expenses | Sales Invoices, Payments, Outstanding, Expenses |
| `engineer` | Site engineers on installation/commissioning (often travelling) | Log site expenses (petrol, lodging), confirm deliveries at site, record refill service | Mobile: Expenses, Deliveries, Projects, Refill Tracker |
| `store` | Store/dispatch staff | Dispatch PO lines without missing any; record deliveries; maintain stock (future) | Deliveries, Pending lines, Stock |

---

## 3. Requirements table

Priority: **M**ust / **S**hould / **C**ould / **W**on't (this phase). Status: `Proposed` (not yet confirmed by client) · `Confirmed` · `In build` · `Done` · `Deferred` · `Dropped`.

| ID | Requirement | Source | Priority | Module | Status |
|---|---|---|---|---|---|
| REQ-001 | Standard BOQ template per system (Hydrant, Sprinkler, Fire Alarm (FAS), PA / Voice Evacuation, Extinguishers); selecting a system and size range lists its standard lines | 11-20 [03:45–04:10], [05:25] | M | BOQ Templates | Proposed |
| REQ-002 | Quantity entered per line; zero-qty lines excluded from the quotation; no line silently skipped | 11-20 [05:25–05:50] | M | BOQ Templates / Quotations | Proposed |
| REQ-003 | Item master with size variants (NB 300…25, ½"/¾"/1", M8/M10/M12, channel sizes, kg) and make/brand, UOM, category, system | 11-20 [08:45–09:10], [10:25–10:50]; price list | M | Item Master | Proposed |
| REQ-004 | Purchase price history per item (and vendor) over months/years | 11-20 [06:15], [17:55] | M | Price Master | Proposed |
| REQ-005 | Latest procured rate auto-picked when an item is added to a quotation | 11-20 [04:10–04:35], [12:55], [17:05–17:30] | M | Price Master / Quotations | Proposed |
| REQ-006 | Purchase invoice entry links to item and vendor masters automatically and updates price history | 11-20 [16:40], [20:50] | M | Purchase Invoices | Proposed |
| REQ-007 | Vendor master: supplier, category, items supplied, last rates | 11-20 [20:25–20:50] | M | Vendors | Proposed |
| REQ-008 | Multiple suppliers per item; record which supplier supplied at what rate | 11-20 [19:10] | M | Vendors / Price Master | Proposed |
| REQ-009 | Sales price history: last quoted and last sold rate per item (overall and per customer) shown while quoting | 11-20 [21:40–22:55] | M | Price Master / Quotations | Proposed |
| REQ-010 | Buying and selling prices kept separate; default markup ≈ 40–50 % | 11-20 [22:30–22:55] | M | Price Master | Proposed |
| REQ-011 | Quotation with Supply rate/amount and Erection rate/amount per line, in client's format (BOQ Ref, Description, Qty, UOM, Supply Rate, Amount, Erection Rate, Amount, Remarks); Excel export; print/PDF | 11-20 [11:15], [12:05], [13:20]; quotation sample | M | Quotations | Proposed |
| REQ-012 | Follow-up tracker: each quotation has follow-up date, contact, notes, next follow-up | 11-20 [15:25] | M | Quotations | Proposed |
| REQ-013 | Conversion status: Draft / Sent / Follow-up / Won / Lost / Expired with lost reason | 11-20 [15:25] | M | Quotations | Proposed |
| REQ-014 | Sales order (customer PO) with line-level delivery status: pending / in-transit / partial / delivered, expected date | 11-20 [15:50–16:40], [19:35] | M | Sales Orders | Proposed |
| REQ-015 | Pop-up on login listing undelivered PO lines (for sales, store, admin) | 11-20 [16:15] | M | Sales Orders / Dashboard | Proposed |
| REQ-016 | Scheduled reminder for lines marked in-transit / deliver-later | 11-20 [16:15–16:40] | M | Deliveries / Agents | Proposed |
| REQ-017 | Extinguisher refill tracker (1-yr / 3-yr interval); internal reminder from 10 days before due; no customer notification | 11-20 [06:40], [20:00] | M | Refill Tracker | Proposed |
| REQ-018 | Project cost centre collecting material from stock, purchases and expense vouchers (petrol, lodging) | 11-20 [23:20–24:10] | M | Projects / Expenses | Proposed |
| REQ-019 | Project position: contract value vs spend = margin, "how much is standing" | 11-20 [24:35] | M | Projects | Proposed |
| REQ-020 | Manual split of a shared expense across projects (e.g. 50/50) | 11-20 [24:35–25:00] | S | Expenses | Proposed |
| REQ-021 | Customer outstanding and vendor outstanding with ageing | 11-20 [25:25] | M | Outstanding | Proposed |
| REQ-022 | Automatic reminder e-mail to customers for outstanding on due dates (pending amount / ledger), sent from Office 365 | 11-20 [25:25–25:50], [29:35] | S | Outstanding / Agents | Proposed |
| REQ-023 | Stock with allocations per order (distributorship) | 11-20 [21:15] | C | Stock | Deferred (Phase 2) |
| REQ-024 | Distributor sales to dealers/sellers | 11-20 [00:50] | W | — | Deferred |
| REQ-025 | Data-entry accountability: each required entry has an owner role; missing entries visible on dashboard | 11-20 [26:40–27:30] | M | Dashboard / Agents | Proposed |
| REQ-026 | Owner dashboard (pipeline, pending deliveries, receivables, payables, refills due, project margins) | 11-20 [27:30] | M | Dashboard | Proposed |
| REQ-027 | Budget-friendly build and running cost | 11-20 [27:55–28:20] | M | NFR | Proposed |
| REQ-028 | Make/brand-specific prices (Honeywell/Morley/System Sensor, Ravel, Glyptic, Edwards, ASES + UL; Polycab, LAP, Ambika, Orbit; Exide, Amaron; Chakraa, Safex) | 11-20 [18:45]; price list | M | Item / Price Master | Proposed |
| REQ-029 | Sales invoice to customer in client's billing format; record payments | 11-20 [11:15], [30:00] | M | Sales Invoices | Proposed (format pending A-02) |
| REQ-030 | Spare parts and refill spares (nozzle, handle, washer, body belt, tube, horn, valve) quotable/sellable | 11-20 [00:25]; price list | S | Item Master / Quotations | Proposed |
| REQ-031 | Role-based access: admin, sales, purchase, accounts, engineer, store | Sirah | M | Auth / Settings | Proposed |
| REQ-032 | Rule-based automation agents run daily (cron) and on demand ("Run now"); no AI/LLM cost — see [AUTOMATION_AGENTS.md](AUTOMATION_AGENTS.md) | Sirah (supports REQ-012/015/017/022/025) | M | Agents | Proposed |
| REQ-033 | Stale price flag: items whose latest purchase rate is older than N days (pipes change daily) | Sirah (from 11-20 [18:20]) | S | Agents | Proposed |
| REQ-034 | Margin guard: warn when a quote line is below minimum margin or selling below cost | Sirah (from 11-20 [22:30]) | S | Quotations / Agents | Proposed |
| REQ-035 | Quotation validity date and expiry alert; revisions (R1, R2) keep history | Sirah | S | Quotations | Proposed |
| REQ-036 | Delivery entries (delivery challan) against sales order lines, partial quantities allowed | Sirah (from REQ-014) | M | Deliveries | Proposed |
| REQ-037 | Expense vouchers with approval (submitted → approved/rejected) and receipt photo | Sirah (from 11-20 [24:10]) | S | Expenses | Proposed |
| REQ-038 | Project budget alert when spend exceeds X % of budget/contract value | Sirah (from REQ-019) | S | Projects / Agents | Proposed |
| REQ-039 | Low stock alert against reorder level | Sirah (Phase 2 with REQ-023) | C | Stock / Agents | Deferred |
| REQ-040 | One-time import of master price list Excel into Item & Price Master | Sirah (from D-01) | M | Item Master | Proposed |
| REQ-041 | Audit trail: created by / updated by / timestamps on all records; who entered what | Sirah (from REQ-025) | M | All | Proposed |
| REQ-042 | Meeting Notes module (record meetings, action items, link to customer/project) | Sirah | C | Meeting Notes | Proposed |
| REQ-043 | Customer master: company, GSTIN, billing/site addresses, contacts, credit days, e-mail for reminders | Sirah | M | Customers | Proposed |
| REQ-044 | E-mail settings using Office 365 SMTP (smtp.office365.com:587) with a mailbox provided by the client | Sirah (from 11-20 [29:35]) | S | Settings | Proposed (A-04) |

---

## 4. User stories and acceptance criteria

### 4.1 Item Master and Price Master
**US-IM-1** As *purchase*, I want every item stored once per size and make, so that quotations and invoices refer to the same item.
- AC1: An item has code, name, system (Hydrant / Sprinkler / FAS / PA / Extinguisher / General), category, size (e.g. `200 NB`), make (e.g. `Ravel UL`), UOM, HSN (optional), GST %, erection rate, active flag.
- AC2: "Pipe GI 200 NB" and "Pipe GI 150 NB" are separate items; duplicate name + size + make is rejected.
- AC3: Search by typing "pipe gi 50" finds `Pipe GI 50 NB`.

**US-IM-2** As *admin*, I want the client's master price list imported, so that we start with real prices.
- AC1: Import of `Price list for Hydrandt and Fire alarm.xlsx` creates e.g. Pipe GI 200 NB @ ₹3,750, Pipe MS 25 NB @ ₹1,300, Single Hydrant Valve @ ₹7,500, Pendant Sprinkler @ ₹550, Diesel Engine @ ₹5,00,000 with price date 12-10-2026 and source "Master price list".
- AC2: Items with blank prices are created with no price and appear in the Stale Price / Data Hygiene list as "no price".

**US-PM-1** As *sales*, I want the latest purchase rate shown with its date and vendor, so I don't have to call suppliers.
- AC1: Item page shows purchase history (date, vendor, invoice no., rate) newest first, and a sales history (date, customer, quote/invoice no., rate) — separately.
- AC2: "Latest purchase rate" = rate on the most recent purchase invoice line by invoice date (ties: latest entered).
- AC3: If the latest rate is older than the stale threshold (default 30 days; 7 days for pipes), it is shown with an amber "stale" badge.

### 4.2 Vendors
**US-VN-1** As *purchase*, I want a vendor record with the items they supply and their latest rates.
- AC1: Vendor has name, GSTIN, contact, phone, e-mail, address, payment terms (days), categories.
- AC2: Vendor page lists every item bought from them with last rate and date, generated automatically from purchase invoices.
- AC3: Item page lists all vendors who supplied it (e.g. 3–4 vendors for MS pipe) with each vendor's last rate, cheapest highlighted.

### 4.3 Customers
**US-CU-1** As *sales*, I want customer records with contacts and credit terms.
- AC1: Fields per REQ-043; GSTIN format validated (15 characters).
- AC2: Customer page shows quotations, orders, invoices, outstanding, refill assets.

### 4.4 BOQ Templates
**US-BQ-1** As *sales*, I want to pick "Hydrant" and get the standard line list so that nothing is missed.
- AC1: Templates exist per system; each line has BOQ Ref (text, e.g. `A.11.3`, `1.2`), description, item link, UOM, default sequence.
- AC2: I enter quantities; on "Create quotation" only lines with qty > 0 are copied, in template order, with BOQ Refs preserved.
- AC3: Before creating, the screen shows a count "18 lines with quantity, 42 zero lines excluded" so the user consciously confirms.
- AC4: BOQ Ref is stored as text (the sample file shows Excel turning `1.2` into `1.2000000000000002`; this must not happen).

### 4.5 Quotations
**US-QT-1** As *sales*, I want supply rates filled automatically.
- AC1: Supply rate default = latest purchase rate × (1 + markup %) rounded to the nearest rupee (see BR-1).
- AC2: Erection rate default = item master erection rate.
- AC3: Last quoted/sold rate to this customer and overall are visible beside each line.
- AC4: Sales may override a rate; overrides below minimum margin show a red warning and require admin approval before status "Sent" (BR-4).

**US-QT-2** As *sales*, I want to export the quotation in our customer format.
- AC1: Excel export has columns BOQ Ref | Description | Quantity | UOM | SUPPLY Rate | Amount | ERECTION Rate | Amount | Remarks, with section headers per system, section totals, GST and grand total.
- AC2: Print/PDF shows company header, quote no. `LBE/Q/2026-27/0001`, date, validity, customer, terms.

**US-QT-3** As *sales*, I want to log follow-ups.
- AC1: Follow-up entry: date, mode (call/visit/e-mail/WhatsApp), contact person, notes, next follow-up date.
- AC2: A quotation in status Sent must always have a next follow-up date; otherwise it appears in Data Hygiene.
- AC3: Status Won requires customer PO number/date and creates (or links) a Sales Order; Lost requires a reason (price / competitor / project dropped / other).

### 4.6 Sales Orders and Deliveries
**US-SO-1** As *sales*, I want to record the customer PO with all its lines.
- AC1: SO can be created from a Won quotation (lines copied) or manually; PO number, PO date, expected delivery date per line.
- AC2: Each line has ordered qty, delivered qty, status: Pending / In transit / Partial / Delivered (derived from deliveries, In transit set manually with expected date).

**US-SO-2** As *store* or *sales*, I want a pop-up at login listing undelivered lines.
- AC1: On login, if any SO line is not Delivered, a pop-up lists customer, PO no., item, pending qty, expected date, days overdue — sorted by overdue first.
- AC2: User can dismiss for the session; it reappears next login while lines remain pending.

**US-DL-1** As *store*, I want to record a delivery against SO lines.
- AC1: Delivery has date, vehicle/transport, DC no.; for each line the qty delivered (≤ pending).
- AC2: When all lines are delivered, the SO becomes Delivered and appears in "Ready to invoice".

### 4.7 Purchase Invoices
**US-PI-1** As *purchase*, I want to enter a supplier invoice once and have everything update.
- AC1: Fields: vendor, invoice no., date, project (optional cost centre), lines (item, qty, rate, GST %).
- AC2: On save: price history row per line; vendor-item rate updated; vendor payable created with due date = invoice date + vendor terms; stock increased if "to store" (Phase 2); project cost increased if a project is selected.
- AC3: Duplicate vendor + invoice no. is rejected.
- AC4: If an item doesn't exist, user can create it inline (name, size, make, UOM) without leaving the invoice.

### 4.8 Projects and Expenses
**US-PR-1** As *admin*, I want each project's contract value vs spend.
- AC1: Project has customer, linked SO/quotation, contract value, budget (default = contract value × (1 − target margin)), start/end, site engineer.
- AC2: Spend = purchase invoice lines tagged to project + stock issues + approved expenses (including split shares).
- AC3: Margin = contract value − spend; % shown; red when spend > budget threshold (BR-9).

**US-EX-1** As *engineer*, I want to log petrol/lodging from my phone.
- AC1: Expense: date, category (Petrol, Lodging, Food, Travel, Local purchase, Other), amount, project, note, receipt photo.
- AC2: "Split" lets me divide one amount across 2+ projects by amount or %; shares must total 100 %.
- AC3: Status Submitted → Approved/Rejected by accounts/admin; only Approved counts in project cost.

### 4.9 Sales Invoices, Payments and Outstanding
**US-SI-1** As *accounts*, I want to invoice delivered orders.
- AC1: Invoice from SO (delivered qty) or manual; number `LBE/INV/2026-27/0001`; GST split CGST+SGST (Tamil Nadu customer) or IGST (other state).
- AC2: Payment entry (date, mode, reference, amount) against one or more invoices; outstanding = invoice total − payments.

**US-OS-1** As *accounts*, I want customer and vendor outstanding with ageing (0–30, 31–60, 61–90, 90+ days) and automatic customer reminders (BR-11).

### 4.10 Refill Tracker
**US-RF-1** As *sales*, I want to know which customers' extinguishers are due for refill.
- AC1: Record per customer site: extinguisher type/capacity (e.g. ABC 6 kg, CO2 4.5 kg), make (Chakraa/Safex), qty, last service date, interval (1 yr / 3 yr), next due date (auto).
- AC2: From 10 days before the due date the record appears on the dashboard "Refills due" list; nothing is sent to the customer.
- AC3: Marking "Refilled on <date>" rolls the next due date forward by the interval.

### 4.11 Dashboard, Agents, Meeting Notes
**US-DB-1** As *admin*, I see: open quotations value, follow-ups due today, win rate (month), undelivered lines, ready-to-invoice, receivables & payables (overdue), refills due, project margins, latest agent alerts, data-hygiene count per user.
**US-AG-1** As *admin*, I can see each agent's last run, alerts created, and press "Run now".
**US-MN-1** As any team user, I can create/edit meeting notes with action items and link them to a customer or project.

---

## 5. Business rules

| ID | Rule |
|---|---|
| BR-1 | **Supply rate** = latest purchase rate of the item × (1 + markup %). Markup default **40 %** (configurable globally, per category, overridable per line). Source of latest purchase rate: most recent purchase invoice line (by invoice date); if none, the imported master price list rate. *Assumption — Q-02/Q-03.* |
| BR-2 | **Erection rate** comes from the item master (per UOM). *Method to be confirmed — Q-04.* |
| BR-3 | Only lines with **quantity > 0** go into the quotation; zero lines are excluded and counted in a confirmation message. Template order and BOQ Refs are preserved. |
| BR-4 | **Minimum margin** default **15 %** over latest purchase rate; any line below it, or below cost, is flagged and needs admin approval. *Assumption.* |
| BR-5 | **GST 18 %** default on supply and erection; per-item GST % overrides. Intra-state (TN) = CGST 9 % + SGST 9 %; inter-state = IGST 18 %. *Assumption — Q-05.* |
| BR-6 | **Document numbering** by Indian financial year (1 April – 31 March), restarting at 0001 each year: Quotation `LBE/Q/2026-27/0001`, revision `LBE/Q/2026-27/0001-R1`; Sales order `LBE/SO/2026-27/0001`; Invoice `LBE/INV/2026-27/0001`; Delivery `LBE/DC/2026-27/0001`. *Assumption — Q-06.* |
| BR-7 | Quotation **validity** default 30 days; status becomes Expired after validity if not Won/Lost. |
| BR-8 | **Refill** next due = last service date + interval (12 or 36 months); reminder window opens **10 days** before; internal only. |
| BR-9 | **Project budget alert** at 80 % of budget spent (warning) and 100 % (critical). |
| BR-10 | Purchase price history and sales price history are **never mixed**; selling price never overwrites buying price. |
| BR-11 | **Customer reminder e-mails**: on due date, then every 7 days while overdue, maximum 4 reminders per invoice, only if the customer has an e-mail and reminders are enabled for that customer. Sent from the client's Office 365 mailbox. *Assumption — Q-10.* |
| BR-12 | **Stale price** threshold: 30 days default; 7 days for category "Pipe" (pipes change daily, 11-20 [18:20]). |
| BR-13 | A Won quotation must have a sales order within 3 days; a fully delivered order must have an invoice within 3 days; otherwise Data Hygiene alerts. |
| BR-14 | SO line status: Delivered when delivered qty = ordered qty; Partial when 0 < delivered < ordered; In transit when set manually with expected date; else Pending. |
| BR-15 | Money is shown in Indian format **₹1,23,456.00**; dates DD-MM-YYYY; time zone IST. |
| BR-16 | Records are never hard-deleted once referenced (quotes, invoices, payments); they are cancelled with reason. |

---

## 6. Non-functional requirements

| ID | Area | Requirement |
|---|---|---|
| NFR-1 | Cost | Runs on free/low-cost tiers: Vercel (Hobby/Pro as needed), Neon Postgres free tier, Office 365 mailbox already owned; **no paid AI APIs** at runtime. Target running cost: under ₹2,000/month at go-live (*estimate*). |
| NFR-2 | Hosting | Vercel; daily cron for agents; embedded PGlite only for demo/offline evaluation. |
| NFR-3 | Mobile | Site-engineer screens (expenses, deliveries, refill updates) usable on a 360 px wide Android phone; large tap targets; camera upload for receipts. |
| NFR-4 | Performance | Main lists load in < 2 s on 4G for up to 10,000 records; quotation of 150 lines exports to Excel in < 5 s. |
| NFR-5 | Data-entry accountability | Every required entry has an owner role; Data Hygiene shows per-user pending entries; dashboard counts are visible to admin. Entry forms need ≤ 6 mandatory fields. |
| NFR-6 | Usability | English UI with Indian terminology (BOQ, NB, PO, DC, GSTIN); INR formatting; keyboard-friendly quotation grid for office users. |
| NFR-7 | Security | Login with hashed passwords, JWT httpOnly cookie, role-based access, HTTPS only; secrets in Vercel env vars; see [guides/security-engineer.md](guides/security-engineer.md). |
| NFR-8 | Privacy | Personal data limited to business contacts; handled per India's DPDP Act 2023 (purpose limitation, deletion on request where no legal retention need). |
| NFR-9 | Backup | Daily automatic database backup (Neon point-in-time restore) + monthly export kept by the client. |
| NFR-10 | Auditability | created_by/updated_by/timestamps on all business records (REQ-041). |
| NFR-11 | Availability | Business hours availability; no SLA beyond hosting provider. |

---

## 7. Out of scope (this phase)

- Statutory accounting, GST returns, TDS, payroll — remain in **Tally/Vyapar**.
- Distributor/dealer sales and multi-warehouse stock (REQ-023/024, Phase 2).
- Customer-facing portal or customer notifications for refills (D-04).
- WhatsApp/SMS messaging, Tamil UI, native mobile apps (possible later, Q-18).
- AI/LLM features at runtime (deliberately excluded for cost).
- Automatic supplier price fetching from websites (not possible — suppliers disclose only on enquiry, 11-20 [18:45–19:10]).
- Engineering design / hydraulic calculation of systems.

---

## 8. Open items affecting requirements

See [meeting notes §7](meetings/2026-11-20-kickoff-meeting.md#7-open-questions--clarifications) — Q-01 (UOM of pipe prices), Q-02/Q-03 (purchase vs selling list, markup), Q-04 (erection rate), Q-05 (GST), Q-06 (numbering), Q-07 (refill intervals), Q-10 (reminder cadence), Q-11 (Tally relationship), Q-13 (approvals) must be closed before UAT.

---

## 9. Requirements change log

| Date | Version | Meeting / source | REQ IDs | Change | By |
|---|---|---|---|---|---|
| 2026-11-21 | 1.0 | Kickoff 2026-11-20 + Excel files | REQ-001 – REQ-044 | Initial baseline (REQ-031+ are Sirah proposals pending confirmation) | Sirah — BC |
| | | | | *Add one row per change after each meeting* | |
