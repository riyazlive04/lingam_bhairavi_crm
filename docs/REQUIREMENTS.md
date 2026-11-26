# Business Requirements Document (BRD)
## CRM for Linga Bhairavi Enterprise, Hosur

| Field | Value |
|---|---|
| Client | Linga Bhairavi Enterprise, Hosur, Tamil Nadu (fire-protection turnkey contractor) |
| Prepared by | Sirah Digital, Business Consultant (https://sirahdigital.in/) |
| Version | 2.0 (version 2 built, for client review) |
| Date | 2026-11-26 (first version 2026-11-21) |
| Sources | [Kickoff meeting 2026-11-20](meetings/2026-11-20-kickoff-meeting.md) (transcript: [meeting-transcript.md](meeting-transcript.md)); `Price list for Hydrandt and Fire alarm.xlsx`; `Hydrant,Sprinkler & Fas,PA-Quotation Sampel- Karthick_3122.xlsx`; client follow-up of 2026-11-26 (new asks for version 2) |
| Sign-off | Pending from the client (Karthick) and Jagan sir |

How to read the Source column: `11-20 [mm:ss]` means the kickoff meeting on 2026-11-20 at that transcript timestamp. `Sirah` means Sirah Digital proposed it to make the stated needs work; the client did not say it. Treat these as **assumptions until the client confirms**. `Client follow-up 2026-11-26` means the client asked for it in the follow-up after the first demo; those requirements start at REQ-045.

---

## 1. Purpose and scope

The goal is to replace manual quoting and tracking in Excel and WhatsApp with a single web CRM that:

- builds quotations from standard BOQ templates, priced from the **latest purchase rate**,
- tracks quotation follow-up and conversion,
- tracks customer PO lines until **every line is delivered**,
- records purchase invoices (price history, vendor rates), project costs and expenses,
- tracks receivables and payables and sends outstanding reminders,
- reminds the team when extinguisher refills are due,
- runs **rule-based automation agents** every day (no AI usage cost).

Version 2 (client follow-up, 2026-11-26) extends this to the full order-to-cash and after-sales cycle:

- owner approval of quotations, and the price date and supplier on every quote line,
- importing a consultant's BOQ Excel file with automatic item matching,
- vendor purchase orders linked to customer POs,
- customer returns (credit notes) and returns to vendors (debit notes),
- advance payments applied to invoices,
- AMC contracts with scheduled visits, and service calls with response deadlines,
- monthly P&L and profitability by order, project, customer and item, plus a project history timeline.

It must stay **budget-friendly**, and data entry must be so easy and visible that people actually do it. The previous quotation CRM failed because nobody entered data (11-20 [26:15 to 27:05]).

Tally/Vyapar stay as the statutory accounts system (see Out of scope and Q-11).

---

## 2. Personas and roles

| Role (system) | Persona at Linga Bhairavi | Main goals | Key screens |
|---|---|---|---|
| `admin` (Owner) | Proprietor and partners (Karthick, partner; Jagan sir, role to confirm) | See pipeline, margins, collections and pending deliveries; approve; control prices and markups | Home, quotation approvals, Reports & profit, Automation agents, all modules, Settings & users |
| `sales` | Sales and estimation staff who prepare BOQs and quotations | Quote fast with correct prices; follow up; convert | Customers, BOQ templates, Quotations, Import BOQ, Follow-ups, Orders & delivery, Returns, AMC, Service calls, Refills |
| `purchase` | Purchase staff buying each item from 3 or 4 suppliers | Record supplier invoices, keep vendor rates current, get material to sites | Purchase orders, Purchase invoices, Vendors, Item & price master, Returns (debit notes) |
| `accounts` | Accounts staff (who also maintain Tally/Vyapar) | Raise invoices, record payments, chase outstanding, approve expenses | Billing & outstanding, Advances, Returns (credit notes), Reports & profit, Expenses |
| `engineer` | Site engineers on installation and commissioning (often travelling) | Log site expenses (petrol, lodging), confirm deliveries at site, record refill service | On mobile: Projects, Expenses, Service calls, AMC visits, Refills |
| `store` | Store and dispatch staff | Dispatch PO lines without missing any; record deliveries; maintain stock (future) | Orders & delivery, Returns, Stock |

---

## 3. Requirements table

Priority: **M**ust, **S**hould, **C**ould, **W**on't (this phase). Status: `Proposed` (not yet confirmed by the client), `Confirmed`, `In build`, `Built` (built, tested and on the demo, waiting for client UAT and sign-off), `Done` (accepted by the client), `Deferred` or `Dropped`. The version in brackets is the release that delivered it.

| ID | Requirement | Source | Priority | Module | Status |
|---|---|---|---|---|---|
| REQ-001 | Standard BOQ template per system (Hydrant, Sprinkler, Fire Alarm (FAS), PA / Voice Evacuation, Extinguishers). Selecting a system and size range lists its standard lines | 11-20 [03:45 to 04:10], [05:25] | M | BOQ Templates | Built (v1.0) |
| REQ-002 | Quantity entered per line. Zero-qty lines are left out of the quotation, and no line is silently skipped | 11-20 [05:25 to 05:50] | M | BOQ Templates / Quotations | Built (v1.0) |
| REQ-003 | Item master with size variants (NB 300…25, ½"/¾"/1", M8/M10/M12, channel sizes, kg), make/brand, UOM, category and system | 11-20 [08:45 to 09:10], [10:25 to 10:50]; price list | M | Item Master | Built (v1.0) |
| REQ-004 | Purchase price history per item (and per vendor) over months and years | 11-20 [06:15], [17:55] | M | Price Master | Built (v1.0) |
| REQ-005 | The latest procured rate is picked automatically when an item is added to a quotation | 11-20 [04:10 to 04:35], [12:55], [17:05 to 17:30] | M | Price Master / Quotations | Built (v1.0) |
| REQ-006 | Purchase invoice entry links to the item and vendor masters automatically and updates price history | 11-20 [16:40], [20:50] | M | Purchase Invoices | Built (v1.0) |
| REQ-007 | Vendor master: supplier, category, items supplied, last rates | 11-20 [20:25 to 20:50] | M | Vendors | Built (v1.0) |
| REQ-008 | Several suppliers per item; record which supplier supplied at what rate | 11-20 [19:10] | M | Vendors / Price Master | Built (v1.0) |
| REQ-009 | Sales price history: last quoted and last sold rate per item (overall and per customer), shown while quoting | 11-20 [21:40 to 22:55] | M | Price Master / Quotations | Built (v1.0) |
| REQ-010 | Buying and selling prices kept separate; default markup about 40 to 50 % | 11-20 [22:30 to 22:55] | M | Price Master | Built (v1.0) |
| REQ-011 | Quotation with Supply rate/amount and Erection rate/amount per line, in the client's format (BOQ Ref, Description, Qty, UOM, Supply Rate, Amount, Erection Rate, Amount, Remarks); Excel export; print/PDF | 11-20 [11:15], [12:05], [13:20]; quotation sample | M | Quotations | Built (v1.0) |
| REQ-012 | Follow-up tracker: each quotation has a follow-up date, contact, notes and next follow-up | 11-20 [15:25] | M | Quotations | Built (v1.0) |
| REQ-013 | Conversion status: Draft / Sent / Follow-up / Won / Lost / Expired, with a lost reason | 11-20 [15:25] | M | Quotations | Built (v1.0) |
| REQ-014 | Sales order (customer PO) with delivery status per line (pending, in-transit, partial, delivered) and expected date | 11-20 [15:50 to 16:40], [19:35] | M | Sales Orders | Built (v1.0) |
| REQ-015 | Pop-up at login listing undelivered PO lines (for sales, store and admin) | 11-20 [16:15] | M | Sales Orders / Dashboard | Built (v1.0) |
| REQ-016 | Scheduled reminder for lines marked in-transit or deliver-later | 11-20 [16:15 to 16:40] | M | Deliveries / Agents | Built (v1.0) |
| REQ-017 | Extinguisher refill tracker (1-year or 3-year interval). Internal reminder from 10 days before due; no customer notification | 11-20 [06:40], [20:00] | M | Refill Tracker | Built (v1.0) |
| REQ-018 | Project cost centre collecting material from stock, purchases and expense vouchers (petrol, lodging) | 11-20 [23:20 to 24:10] | M | Projects / Expenses | Built (v1.0) |
| REQ-019 | Project position: contract value vs spend = margin, and "how much is standing" | 11-20 [24:35] | M | Projects | Built (v1.0) |
| REQ-020 | Manual split of a shared expense across projects (for example 50/50) | 11-20 [24:35 to 25:00] | S | Expenses | Built (v1.0) |
| REQ-021 | Customer outstanding and vendor outstanding, with ageing | 11-20 [25:25] | M | Outstanding | Built (v1.0) |
| REQ-022 | Automatic reminder e-mail to customers about outstanding on due dates (pending amount or ledger), sent from Office 365 | 11-20 [25:25 to 25:50], [29:35] | S | Outstanding / Agents | Built (v1.0) |
| REQ-023 | Stock with allocations per order (distributorship) | 11-20 [21:15] | C | Stock | Built (v1.0, ready for Phase 2) |
| REQ-024 | Distributor sales to dealers and sellers | 11-20 [00:50] | W | - | Deferred |
| REQ-025 | Data-entry accountability: each required entry has an owner role, and missing entries are visible on the dashboard | 11-20 [26:40 to 27:30] | M | Dashboard / Agents | Built (v1.0) |
| REQ-026 | Owner dashboard (pipeline, pending deliveries, receivables, payables, refills due, project margins) | 11-20 [27:30] | M | Dashboard | Built (v1.0) |
| REQ-027 | Budget-friendly build and running cost | 11-20 [27:55 to 28:20] | M | NFR | Built (v1.0) |
| REQ-028 | Prices specific to make/brand (Honeywell/Morley/System Sensor, Ravel, Glyptic, Edwards, ASES + UL; Polycab, LAP, Ambika, Orbit; Exide, Amaron; Chakraa, Safex) | 11-20 [18:45]; price list | M | Item / Price Master | Built (v1.0) |
| REQ-029 | Sales invoice to the customer in the client's billing format; record payments | 11-20 [11:15], [30:00] | M | Sales Invoices | Built (v1.0; client billing format pending A-02) |
| REQ-030 | Spare parts and refill spares (nozzle, handle, washer, body belt, tube, horn, valve) can be quoted and sold | 11-20 [00:25]; price list | S | Item Master / Quotations | Built (v1.0) |
| REQ-031 | Role-based access: admin, sales, purchase, accounts, engineer, store | Sirah | M | Auth / Settings | Built (v1.0) |
| REQ-032 | Rule-based automation agents run daily (cron) and on demand ("Run now"), with no AI cost. See [AUTOMATION_AGENTS.md](AUTOMATION_AGENTS.md) | Sirah (supports REQ-012/015/017/022/025) | M | Agents | Built (v1.0) |
| REQ-033 | Stale price flag: items whose latest purchase rate is older than N days (pipe prices change daily) | Sirah (from 11-20 [18:20]) | S | Agents | Built (v1.0) |
| REQ-034 | Margin guard: warn when a quote line is below the minimum margin or sells below cost | Sirah (from 11-20 [22:30]) | S | Quotations / Agents | Built (v1.0; owner approval added in v2.0, see REQ-045) |
| REQ-035 | Quotation validity date and expiry alert; revisions (R1, R2) keep history | Sirah | S | Quotations | Built (v1.0) |
| REQ-036 | Delivery entries (delivery challan) against sales order lines, with partial quantities allowed | Sirah (from REQ-014) | M | Deliveries | Built (v1.0) |
| REQ-037 | Expense vouchers with approval (submitted → approved/rejected) and a receipt photo | Sirah (from 11-20 [24:10]) | S | Expenses | Built (v1.0; bill reference only, receipt photo upload not built yet) |
| REQ-038 | Project budget alert when spend goes above X % of budget or contract value | Sirah (from REQ-019) | S | Projects / Agents | Built (v1.0) |
| REQ-039 | Low stock alert against reorder level | Sirah (Phase 2 with REQ-023) | C | Stock / Agents | Built (v1.0, used once stock is held) |
| REQ-040 | One-time import of the master price list Excel into the Item & Price Master | Sirah (from D-01) | M | Item Master | Built (v1.0; loaded at first start, 462 demo prices to replace) |
| REQ-041 | Audit trail: created by, updated by and timestamps on all records, so we know who entered what | Sirah (from REQ-025) | M | All | Built (v1.0) |
| REQ-042 | Meeting Notes module (record meetings and action items, link to a customer or project) | Sirah | C | Meeting Notes | Built (v1.0) |
| REQ-043 | Customer master: company, GSTIN, billing and site addresses, contacts, credit days, e-mail for reminders | Sirah | M | Customers | Built (v1.0) |
| REQ-044 | E-mail settings using Office 365 SMTP (smtp.office365.com:587) with a mailbox provided by the client | Sirah (from 11-20 [29:35]) | S | Settings | Built (v1.0; mailbox pending A-04) |
| REQ-045 | Owner approval of quotations before they are sent. Setting "Approval before sending": Off, Only below minimum margin (default) or All quotations. Sales requests approval; the owner approves or rejects with a note; "Mark sent" and "Email" stay blocked until approved; a price change after approval sends the quote back for approval | Client follow-up 2026-11-26 (was Sirah proposal S-16, from REQ-034) | M | Quotations / Settings | Built (v2.0) |
| REQ-046 | Every quotation line shows its cost price with the price date and supplier (or "list" / "manual"), and an amber **stale** mark when the price is older than the stale window (7 days for pipes and cable, 90 days for other items) | Client follow-up 2026-11-26 (extends REQ-005, REQ-033) | M | Quotations | Built (v2.0) |
| REQ-047 | Import a consultant's BOQ Excel file and match each line to the item master automatically, with a review screen for lines to check and a picker for unmatched lines, then create the quotation. On the client's sample BOQ: 95 of 150 lines matched automatically, 55 to check, 0 unmatched | Client follow-up 2026-11-26 (was a Sirah backlog proposal) | M | Quotations (Import BOQ) | Built (v2.0) |
| REQ-048 | Vendor purchase orders, raised from a customer PO's pending lines or by hand, printed in A4, and received by creating a purchase invoice from the PO (received qty and PO status update when the bill is posted) | Client follow-up 2026-11-26 | S | Purchase orders | Built (v2.0) |
| REQ-049 | Customer returns with a GST credit note (optionally back into stock), adjustable against the customer's open invoices; returns to vendor with a debit note, adjustable against open vendor bills | Client follow-up 2026-11-26 | M | Returns | Built (v2.0) |
| REQ-050 | AMC contracts: customer, site, systems covered, period, value, billing frequency, visits per year (scheduled evenly), coverage, response time and engineer. Visit reports with a per-system checklist, printable contract and visit report, invoicing and renewal into a new contract | Client follow-up 2026-11-26 | M | AMC | Built (v2.0) |
| REQ-051 | Service (breakdown) calls with priority, engineer and a response deadline (contract response hours, or 48 hours without a contract); alert when the deadline is missed; chargeable calls can be invoiced | Client follow-up 2026-11-26 | M | Service calls | Built (v2.0) |
| REQ-052 | Advance payments from customers (against an order or project, or on account), with a receipt, applied later to one or more invoices | Client follow-up 2026-11-26 | M | Billing (Advances) | Built (v2.0) |
| REQ-053 | Net customer outstanding = unpaid invoices - unadjusted credit notes - unapplied advances; vendor outstanding also subtracts unadjusted debit notes. Shown on receivables, ledgers and exports | Client follow-up 2026-11-26 (follows REQ-049, REQ-052) | M | Billing | Built (v2.0) |
| REQ-054 | Monthly business P&L: sales less credit notes, cost of goods delivered or issued, approved expenses, gross and net profit. Excel export | Client follow-up 2026-11-26 | M | Reports & profit | Built (v2.0) |
| REQ-055 | Profitability by order, project, customer and item, comparing buying cost with selling price (buy vs sell), visible only to roles allowed to see cost | Client follow-up 2026-11-26 | M | Reports / Orders / Projects | Built (v2.0) |
| REQ-056 | Project history: one timeline of everything that happened on a project (quotation, orders, deliveries, purchases, material issues, expenses, invoices, payments, returns, AMC), printable | Client follow-up 2026-11-26 | S | Projects | Built (v2.0) |
| REQ-057 | Upgrade without data loss: version 2 adds tables and columns only (migration 0001), and a one-time, guarded upgrade step fills in the new fields for existing records when the app starts | Sirah (needed to deliver the 2026-11-26 asks on the live demo) | M | Platform | Built (v2.0) |
| REQ-058 | One consistent design across every screen: navigation grouped by task (Sell, Deliver, Buy, Money, Projects & site, Service, Automation, Admin), a "New" quick create menu, a bottom tab bar on phones per role, shared page layouts, A4 layout for every print, on-page confirmations and a compact table option | Sirah (from NFR-3, NFR-6 and the 2026-11-26 review) | S | All | Built (v2.1) |

---

## 4. User stories and acceptance criteria

### 4.1 Item Master and Price Master
**US-IM-1** As *purchase*, I want every item stored once per size and make, so that quotations and invoices refer to the same item.
- AC1: An item has a code, name, system (Hydrant / Sprinkler / FAS / PA / Extinguisher / General), category, size (e.g. `200 NB`), make (e.g. `Ravel UL`), UOM, HSN (optional), GST %, erection rate and an active flag.
- AC2: "Pipe GI 200 NB" and "Pipe GI 150 NB" are separate items. A duplicate name + size + make is rejected.
- AC3: Typing "pipe gi 50" in search finds `Pipe GI 50 NB`.

**US-IM-2** As *admin*, I want the client's master price list imported, so that we start with real prices.
- AC1: Importing `Price list for Hydrandt and Fire alarm.xlsx` creates, for example, Pipe GI 200 NB @ ₹3,750, Pipe MS 25 NB @ ₹1,300, Single Hydrant Valve @ ₹7,500, Pendant Sprinkler @ ₹550 and Diesel Engine @ ₹5,00,000, with price date 12-10-2026 and source "Master price list".
- AC2: Items with blank prices are created without a price and show up in the Stale Price / Data Hygiene list as "no price".

**US-PM-1** As *sales*, I want the latest purchase rate shown with its date and vendor, so I don't have to call suppliers.
- AC1: The item page shows purchase history (date, vendor, invoice no., rate), newest first, and a separate sales history (date, customer, quote or invoice no., rate).
- AC2: "Latest purchase rate" is the rate on the most recent purchase invoice line by invoice date (on a tie, the one entered last).
- AC3: If the latest rate is older than the stale threshold (90 days by default, 7 days for pipes and other volatile items, as built), it carries an amber "stale" badge. The same badge, with the price date and supplier, is shown on every quotation line (REQ-046).

### 4.2 Vendors
**US-VN-1** As *purchase*, I want a vendor record with the items they supply and their latest rates.
- AC1: A vendor has a name, GSTIN, contact, phone, e-mail, address, payment terms (days) and categories.
- AC2: The vendor page lists every item bought from them, with last rate and date, built automatically from purchase invoices.
- AC3: The item page lists every vendor who supplied it (e.g. 3 or 4 vendors for MS pipe) with each vendor's last rate, and highlights the cheapest.

### 4.3 Customers
**US-CU-1** As *sales*, I want customer records with contacts and credit terms.
- AC1: Fields as per REQ-043. The GSTIN format is validated (15 characters).
- AC2: The customer page shows quotations, orders, invoices, outstanding and refill assets.

### 4.4 BOQ Templates
**US-BQ-1** As *sales*, I want to pick "Hydrant" and get the standard line list, so that nothing is missed.
- AC1: Templates exist per system. Each line has a BOQ Ref (text, e.g. `A.11.3`, `1.2`), description, item link, UOM and default sequence.
- AC2: I enter quantities. On "Create quotation", only lines with qty > 0 are copied, in template order, with their BOQ Refs kept.
- AC3: Before creating, the screen shows a count such as "18 lines with quantity, 42 zero lines excluded", so the user confirms knowingly.
- AC4: BOQ Ref is stored as text. (The sample file shows Excel turning `1.2` into `1.2000000000000002`, and this must not happen.)

### 4.5 Quotations
**US-QT-1** As *sales*, I want supply rates filled in automatically.
- AC1: The default supply rate = latest purchase rate × (1 + markup %), rounded to the nearest rupee (see BR-1).
- AC2: The default erection rate = the item master erection rate.
- AC3: The last quoted and sold rates, to this customer and overall, are visible beside each line.
- AC4: Sales may override a rate. An override below the minimum margin shows a red warning and needs admin approval before the status can be "Sent" (BR-4, REQ-045).

**US-QT-2** As *sales*, I want to export the quotation in our customer format.
- AC1: The Excel export has the columns BOQ Ref | Description | Quantity | UOM | SUPPLY Rate | Amount | ERECTION Rate | Amount | Remarks, with section headers per system, section totals, GST and grand total.
- AC2: Print/PDF shows the company header, quote no. `LBE/Q/2026-27/0001`, date, validity, customer and terms.

**US-QT-3** As *sales*, I want to log follow-ups.
- AC1: A follow-up entry has a date, mode (call, visit, e-mail, WhatsApp), contact person, notes and next follow-up date.
- AC2: A quotation in status Sent must always have a next follow-up date. If not, it appears in Data Hygiene.
- AC3: Status Won needs the customer PO number and date, and creates (or links) a Sales Order. Lost needs a reason (price, competitor, project dropped, other).

### 4.6 Sales Orders and Deliveries
**US-SO-1** As *sales*, I want to record the customer PO with all its lines.
- AC1: An SO can be created from a Won quotation (lines copied) or by hand, with PO number, PO date and an expected delivery date per line.
- AC2: Each line has ordered qty, delivered qty and a status: Pending, In transit, Partial or Delivered. Status comes from the deliveries, except In transit, which is set by hand with an expected date.

**US-SO-2** As *store* or *sales*, I want a pop-up at login listing undelivered lines.
- AC1: At login, if any SO line is not Delivered, a pop-up lists customer, PO no., item, pending qty, expected date and days overdue, with the most overdue first.
- AC2: The user can dismiss it for the session. It comes back at the next login while lines are still pending.

**US-DL-1** As *store*, I want to record a delivery against SO lines.
- AC1: A delivery has a date, vehicle or transport and DC no., and for each line the qty delivered (≤ pending).
- AC2: Once all lines are delivered, the SO becomes Delivered and appears under "Ready to invoice".

### 4.7 Purchase Invoices
**US-PI-1** As *purchase*, I want to enter a supplier invoice once and have everything else update.
- AC1: Fields: vendor, invoice no., date, project (optional cost centre) and lines (item, qty, rate, GST %).
- AC2: On save: a price history row per line; the vendor-item rate is updated; a vendor payable is created with due date = invoice date + vendor terms; stock goes up if the goods go "to store" (Phase 2); project cost goes up if a project is selected.
- AC3: A duplicate vendor + invoice no. is rejected.
- AC4: If an item doesn't exist, the user can create it on the spot (name, size, make, UOM) without leaving the invoice.

### 4.8 Projects and Expenses
**US-PR-1** As *admin*, I want each project's contract value against its spend.
- AC1: A project has a customer, a linked SO or quotation, contract value, budget (default = contract value × (1 − target margin)), start and end dates, and a site engineer.
- AC2: Spend = purchase invoice lines tagged to the project + stock issues + approved expenses (including split shares).
- AC3: Margin = contract value − spend, with the % shown. It turns red when spend crosses the budget threshold (BR-9).

**US-EX-1** As *engineer*, I want to log petrol and lodging from my phone.
- AC1: An expense has a date, category (Petrol, Lodging, Food, Travel, Local purchase, Other), amount, project, note and receipt photo.
- AC2: "Split" lets me divide one amount across 2 or more projects by amount or %. The shares must add up to 100 %.
- AC3: Status goes Submitted → Approved or Rejected, by accounts or admin. Only Approved expenses count in project cost.

### 4.9 Sales Invoices, Payments and Outstanding
**US-SI-1** As *accounts*, I want to invoice delivered orders.
- AC1: An invoice comes from an SO (delivered qty) or is made by hand. Number `LBE/INV/2026-27/0001`. GST is split as CGST+SGST (Tamil Nadu customer) or IGST (other state).
- AC2: A payment entry (date, mode, reference, amount) can cover one or more invoices. Outstanding = invoice total − payments.

**US-OS-1** As *accounts*, I want customer and vendor outstanding with ageing (0 to 30, 31 to 60, 61 to 90 and 90+ days) and automatic customer reminders (BR-11).

### 4.10 Refill Tracker
**US-RF-1** As *sales*, I want to know which customers' extinguishers are due for refill.
- AC1: A record per customer site: extinguisher type and capacity (e.g. ABC 6 kg, CO2 4.5 kg), make (Chakraa/Safex), qty, last service date, interval (1 yr or 3 yr) and next due date (calculated).
- AC2: From 10 days before the due date, the record appears in the dashboard's "Refills due" list. Nothing is sent to the customer.
- AC3: Marking "Refilled on <date>" moves the next due date forward by the interval.

### 4.11 Dashboard, Agents, Meeting Notes
**US-DB-1** As *admin*, I see: open quotations value, follow-ups due today, win rate (month), undelivered lines, ready-to-invoice, receivables and payables (overdue), refills due, project margins, latest agent alerts and the data-hygiene count per user.
**US-AG-1** As *admin*, I can see each agent's last run and the alerts it created, and press "Run now".
**US-MN-1** As any team user, I can create and edit meeting notes with action items, and link them to a customer or project.

---

## 5. Business rules

| ID | Rule |
|---|---|
| BR-1 | **Supply rate** = latest purchase rate of the item × (1 + markup %). The default markup is **40 %** (set globally or per category, and can be overridden per line). The latest purchase rate comes from the most recent purchase invoice line (by invoice date). If there is none, the imported master price list rate is used. *Assumption: Q-02/Q-03.* |
| BR-2 | **Erection rate** comes from the item master (per UOM). *Method to be confirmed: Q-04.* |
| BR-3 | Only lines with **quantity > 0** go into the quotation. Zero lines are left out and counted in a confirmation message. Template order and BOQ Refs are kept. |
| BR-4 | **Minimum margin** is **15 %** by default over the latest purchase rate. Any line below it, or below cost, is flagged. Whether a quote needs the owner's approval before sending is the setting "Approval before sending": Off, Only below minimum margin (default) or All quotations (REQ-045, CONVENTIONS rule 11). *Assumption: default to be confirmed.* |
| BR-5 | **GST 18 %** by default on supply and erection, and a per-item GST % overrides it. Within the state (TN) = CGST 9 % + SGST 9 %; inter-state = IGST 18 %. *Assumption: Q-05.* |
| BR-6 | **Document numbering** follows the Indian financial year (1 April to 31 March) and restarts at 0001 each year: Quotation `LBE/Q/2026-27/0001`, revision `LBE/Q/2026-27/0001-R1`; Sales order `LBE/SO/2026-27/0001`; Invoice `LBE/INV/2026-27/0001`; Delivery `LBE/DC/2026-27/0001`. *Assumption: Q-06.* |
| BR-7 | Quotation **validity** is 30 days by default. The status becomes Expired after validity if the quote is not Won or Lost. |
| BR-8 | **Refill** next due = last service date + interval (12 or 36 months). The reminder window opens **10 days** before, and it is internal only. |
| BR-9 | **Project budget alert** at 80 % of budget spent (warning) and at 100 % (critical). |
| BR-10 | Purchase price history and sales price history are **never mixed**. A selling price never overwrites a buying price. |
| BR-11 | **Customer reminder e-mails**: on the due date, then every 7 days while overdue, up to 4 reminders per invoice. *As built:* the first statement goes 1 day after the due date, then every 7 days, up to 3 reminders, then accounts is alerted to call; all three numbers are adjustable on the agents screen. They go only if the customer has an e-mail and reminders are switched on for that customer, and they are sent from the client's Office 365 mailbox. *Assumption: Q-10.* |
| BR-12 | **Stale price** threshold: 7 days for pipes, cable and other volatile items (pipe prices change daily, 11-20 [18:20]). *As built:* 90 days for all other items (the first draft said 30); both are adjustable. |
| BR-13 | A Won quotation must have a sales order within 3 days, and a fully delivered order must have an invoice within 2 days (as built; the first draft said 3). A quote waiting for approval for more than 1 day is also flagged. Otherwise Data Hygiene raises an alert. |
| BR-14 | SO line status: Delivered when delivered qty = ordered qty; Partial when 0 < delivered < ordered; In transit when set by hand with an expected date; otherwise Pending. |
| BR-15 | Money is shown in the Indian format **₹1,23,456.00**, dates as DD-MM-YYYY, and the time zone is IST. |
| BR-16 | Once a record is referenced (quotes, invoices, payments), it is never hard-deleted. It is cancelled with a reason instead. |
| BR-17 | **Credit and debit notes** carry GST like the original document. A credit note cannot return more than was delivered, and its rate cannot be higher than the original invoice or order rate (a lower rate, down to zero for a free replacement, is allowed). Numbers: `LBE/CN/2026-27/0001` and `LBE/DN/2026-27/0001`. |
| BR-18 | **Advances** are applied to invoices of the same customer only, never above the invoice outstanding or the unapplied advance. Receipts are numbered `LBE/RCPT/2026-27/0001`. |
| BR-19 | **AMC** visits are spread evenly between the start and end dates. A service call's response deadline = raised time + the contract's response hours (default 24), or 48 hours without a contract. Renewal creates a new contract and marks the old one renewed. Numbers: `LBE/AMC/2026-27/0001` and `LBE/SC/2026-27/0001`. |
| BR-20 | **Profit** counts purchases as cost only when goods are delivered to a customer or issued to a project. Order cost uses the cost price saved at the time of delivery. The full formulas are CONVENTIONS rules 12, 17 and 18 ([app/CONVENTIONS.md](../app/CONVENTIONS.md)). |

---

## 6. Non-functional requirements

| ID | Area | Requirement |
|---|---|---|
| NFR-1 | Cost | Runs on free or low-cost tiers: Vercel (Hobby or Pro as needed), the Neon Postgres free tier and the Office 365 mailbox the client already owns. **No paid AI APIs** at runtime. Target running cost: under ₹2,000/month at go-live (*estimate*). |
| NFR-2 | Hosting | Vercel, with a daily cron for the agents. Embedded PGlite is only for the demo and offline evaluation. |
| NFR-3 | Mobile | Site-engineer screens (expenses, deliveries, refill updates) work on a 360 px wide Android phone, with large tap targets and camera upload for receipts. |
| NFR-4 | Performance | Main lists load in under 2 s on 4G for up to 10,000 records. A 150-line quotation exports to Excel in under 5 s. |
| NFR-5 | Data-entry accountability | Every required entry has an owner role. Data Hygiene shows pending entries per user, and the dashboard counts are visible to admin. Entry forms have no more than 6 mandatory fields. |
| NFR-6 | Usability | English UI with Indian terms (BOQ, NB, PO, DC, GSTIN), INR formatting and a keyboard-friendly quotation grid for office users. |
| NFR-7 | Security | Login with hashed passwords, a JWT httpOnly cookie, role-based access and HTTPS only. Secrets live in Vercel env vars. See [guides/security-engineer.md](guides/security-engineer.md). |
| NFR-8 | Privacy | Personal data is limited to business contacts and handled as India's DPDP Act 2023 requires (purpose limitation, and deletion on request where there is no legal need to keep it). |
| NFR-9 | Backup | Daily automatic database backup (Neon point-in-time restore), plus a monthly export kept by the client. |
| NFR-10 | Auditability | created_by, updated_by and timestamps on all business records (REQ-041). |
| NFR-11 | Availability | Available in business hours. No SLA beyond what the hosting provider gives. |

---

## 7. Out of scope (this phase)

- Statutory accounting, GST returns, TDS and payroll. These stay in **Tally/Vyapar**.
- Distributor and dealer sales, and multi-warehouse stock (REQ-023/024, Phase 2).
- A customer-facing portal, or customer notifications for refills (D-04).
- WhatsApp or SMS messaging, a Tamil UI and native mobile apps (possible later, Q-18).
- AI features at runtime (left out on purpose, to keep costs down).
- Fetching supplier prices automatically from websites. This is not possible, because suppliers share prices only on enquiry (11-20 [18:45 to 19:10]).
- Engineering design or hydraulic calculation of systems.

---

## 8. Open items affecting requirements

See §7 (open questions) of the [kickoff meeting notes](meetings/2026-11-20-kickoff-meeting.md). These must be closed before UAT: Q-01 (UOM of pipe prices), Q-02/Q-03 (purchase vs selling list, markup), Q-04 (erection rate), Q-05 (GST), Q-06 (numbering), Q-07 (refill intervals), Q-10 (reminder cadence), Q-11 (Tally relationship) and Q-13 (approvals). Q-13 is now a setting (REQ-045): the client only needs to choose the mode. For version 2, also confirm at the clarification meeting on Friday 2026-11-28: who may post credit notes (V2-09 in the security review), whether Store may see buying rates on vendor POs and debit notes (V2-07), the AMC checklist per system, and the default response hours for service calls.

---

## 9. Requirements change log

| Date | Version | Meeting / source | REQ IDs | Change | By |
|---|---|---|---|---|---|
| 2026-11-21 | 1.0 | Kickoff 2026-11-20 + Excel files | REQ-001 to REQ-044 | First baseline (REQ-031 onwards are Sirah Digital proposals awaiting confirmation) | Sirah Digital (Business Consultant) |
| 2026-11-26 | 2.0 | Client follow-up 2026-11-26 | REQ-045 to REQ-057; REQ-001 to REQ-044 | Added the version 2 requirements (owner approval, price date and stale mark, consultant BOQ import, vendor POs, returns with credit and debit notes, AMC, service calls, advances, net outstanding, P&L, profitability, project history, upgrade path), all Built. Statuses of REQ-001 to REQ-044 moved to Built (v1.0), with notes where something is still pending. BR-4, BR-11, BR-12 and BR-13 updated to the values as built; BR-17 to BR-20 added. Owner approval (S-16) and BOQ import, earlier Sirah proposals, are now client requirements | Sirah Digital (Business Consultant) |
| 2026-11-26 | 2.1 | UI rebuild | REQ-058 | Added the design system requirement (task-based navigation, New menu, phone tab bar, A4 prints), Built | Sirah Digital (Business Consultant) |
| | | | | *Add one row per change after each meeting* | |
