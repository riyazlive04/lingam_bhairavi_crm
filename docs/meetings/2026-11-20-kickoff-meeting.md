# Kickoff Meeting — Linga Bhairavi Enterprise CRM

> **Living document.** This file is the record of the 2026-11-20 meeting. Later meetings get their own file (see [README](README.md)); when a later meeting changes something recorded here (an action item closes, a decision is reversed, a question is answered), update the relevant row here **and** add a line to the [Change log](#11-change-log--revision-history).

| Field | Value |
|---|---|
| **Meeting** | Requirements kickoff — CRM for fire-protection contracting business |
| **Date / time** | 2026-11-20, 16:44 IST (from recording timestamp) |
| **Duration** | approx. 31 minutes (transcript runs 00:00 – 30:25+) |
| **Mode** | Online video call (screen share of client's Excel files; documents also shared on WhatsApp) |
| **Client** | Linga Bhairavi Enterprise, Hosur, Tamil Nadu |
| **Client attendees** | Karthi / Karthick (client side, shared price list & quotation sample); client partner (name not captured in the recording) |
| **Client stakeholder (not confirmed present)** | Jagan sir — the client will confirm requirements with him before sign-off [28:20–28:45] |
| **Sirah Digital attendees** | Sirah Digital lead (interviewer); Mr. Riyas (partner) [08:20] |
| **Source recording** | `kcs-edcx-tez (2026-11-20 16_44 GMT+5_30).mp4` (project root; not committed to git) |
| **Transcription method** | Sarvam AI speech-to-text, mixed Tamil/English (ta-IN / en-IN) audio, machine translated to English. Original-language text is kept beneath each English line. Timestamps are 25-second chunk starts. |
| **Full transcript** | [../meeting-transcript.md](../meeting-transcript.md) |
| **Notes prepared by** | Sirah Digital — Business Consultant |
| **Status** | v1.0 — draft, awaiting client confirmation (incl. Jagan sir) |

**How to read timestamps:** `[mm:ss]` points to the transcript chunk in which the point was made. Because the translation is machine-generated, the wording in quotes is paraphrased; treat the *meaning* as authoritative only once the client confirms it.

---

## 1. Executive summary

Linga Bhairavi Enterprise is a Hosur-based fire-protection turnkey contractor (extinguishers, hydrant, sprinkler, fire alarm, PA/voice evacuation, spare parts) that is planning to become a distributor of fire-alarm products. Its quotation process is slow because staff **manually re-check the latest supplier price for every quotation**, there is **no follow-up or conversion tracking**, **undelivered lines on customer POs are forgotten**, and **project spend vs contract value is not visible**. Accounts run on Tally/Vyapar; an earlier in-house quotation CRM failed because **staff did not enter data**.

The client wants a **budget-friendly** CRM that:

1. Generates quotations from **standard BOQ templates per system**, where only lines with a quantity appear and nothing is skipped.
2. Pulls the **latest procured (purchase) price** automatically from supplier invoices, keeps **price history**, and keeps **buying and selling prices separate** (typically 40–50 % apart).
3. Tracks **quotation follow-ups and conversion**, **customer-PO line delivery** (with a pop-up for pending items), **extinguisher refill due dates** (internal reminder 10 days before), **project cost centres**, and **customer/vendor outstanding** with automatic reminder e-mails (Office 365).

Sirah Digital will draft the requirements, categorise which data each person must enter, and propose a solution. The client will send 4 sample BOQs/quotations with their billing format, the website, Office 365 e-mail details, and will confirm with Jagan sir.

---

## 2. Business context

| Topic | What we heard | Ref |
|---|---|---|
| Business | Complete fire-protection systems — fire extinguishers, fire hydrant, fire alarm system, sprinklers "and a little more" — as turnkey projects | [00:00–00:25] |
| Compliance driver | New factories/companies must meet the fire requirements of the building code / fire authority ("NPC" in transcript — most likely **NBC, National Building Code of India**; *to confirm*) | [00:25] |
| Spare parts | Also sells spare parts occasionally | [00:25] |
| Future plan | Take a **distributorship** for a fire-alarm brand and sell to other sellers (smoke detectors, sprinklers, etc.) instead of buying from someone else | [00:50] |
| Where BOQs come from | Either from the customer/consultant or prepared by Linga Bhairavi; there is no single standard BOQ | [03:45] |
| Products | Standard items, bought and resold/installed — **not manufactured** | [07:30–07:55] |
| Variation | Limited: approx. 10 pipe variations; for hydrant around 3; generally 5–6 variations per item | [10:25–10:50] |
| Suppliers | Buys the same item from **3–4 suppliers**; prices are only disclosed on enquiry; brand-specific pricing matters | [18:45–19:10] |
| Price volatility | **Pipe prices change daily** | [18:20] |
| Margin | Selling price is typically **40–50 % different** from buying price | [22:30] |
| Current software | **Tally** (accounts) and **Vyapar**; a previous custom quotation CRM existed but was not maintained by staff | [25:50–26:40] |
| E-mail | Uses **Office 365** | [29:35] |
| Budget | Growing company; asked for a budget-friendly solution, will upgrade later | [27:55–28:20] |

**Reference files shared by the client (in project root):**

- `Price list for Hydrandt and Fire alarm.xlsx` — master price list dated 12.10.2026 (Fire Alarm sheet also dated 08.09.2026):
  - *Hydrant and Sprinkler* — 62 items with NB-size columns 300 / 250 / 200 / 150 / 100 / 80 / 65 / 50 / 40 / 32 / 25, e.g. Pipe GI (₹3,750 at 200 NB … ₹1,900 at 25 NB), Pipe MS (₹2,600 … ₹1,300), Single Hydrant Valve ₹7,500, 2-way FBI valve ₹12,500, Pressure gauge ₹2,250, Pressure switch ₹3,500, Hose reel drum ₹7,500, Hose box double door ₹5,100, RRL Hose with SS ₹6,500, Foot valve ₹18,500, Branch pipe (nozzle) ₹2,750, Pendant sprinkler ₹550, Electrical panel ₹29,000, Electrical motor / Electrical pump / Jockey pump ₹1,20,000 each, Diesel engine ₹5,00,000, C Channel ₹1,200–2,700 by size, Painting charges ₹200. Many items have no price yet.
  - *Fire Alarm* — 20 items (conventional & addressable panels, heat/smoke/multi/beam/gas detectors, base, hooter, MCP, isolator & control modules, FRLS cable, back box, battery) with make columns Honeywell/Morley/System Sensor, Ravel, Glyptic, Edwards, ASES (each with a UL variant); cables Polycab, LAP, Ambika, Orbit (+UL); batteries Exide, Amaron. **No prices filled yet.**
  - *New Fire Extinguishers* — New, Refilling and Refill spare-parts lists by make Chakraa / Safex: ABC 2/4/6/9/25/50 kg, CO2 2/4.5/9/25/50 kg, Clean Agent, Foam, Zebra boards, Stand; spares Nozzle, Handle, Washer, Body belt, Tube, Horn, Valve. **No prices filled yet.**
- `Hydrant,Sprinkler & Fas,PA-Quotation Sampel- Karthick_3122.xlsx` — customer quotation format, columns **BOQ Ref | Description | Quantity | UOM | SUPPLY Rate | Amount | ERECTION Rate | Amount | Remarks**, sheets *Hydrant & Sprinkler-1* (sections A pumps/valves/panel/cabling, B hydrant, C sprinkler, D extinguishers), *Hydrant Sprinkler-2* (MS pipe 25–200 NB, sprinklers K115, rosette plates, removal/reuse works), *FAS & PA-1* (addressable FAS + 6-zone voice evacuation PA), *FAS-2* (8-loop panel, network module, repeater, cabling). The sample contains descriptions only — quantities and rates are blank.

---

## 3. Pain points

| # | Pain point | Impact | Ref |
|---|---|---|---|
| PP-1 | For **every quotation**, staff manually verify the latest price with suppliers / past supply records | Quotations are delayed | [04:35–05:00] |
| PP-2 | No standard BOQ; BOQ lines are assembled by hand, so items can be **skipped or missed** | Wrong/incomplete quotes | [03:45, 05:25] |
| PP-3 | When customer orders (POs) are received, the dispatch team **sometimes misses 2–3 line items** — e.g. 9 of 10 lines delivered, one out of stock or in transit — and it is **forgotten under pressure of other orders** | Customer dissatisfaction, delayed billing | [05:00, 15:50–16:15] |
| PP-4 | **No follow-up tracker** after a quotation is given (to whom, when) | Lost opportunities | [15:25] |
| PP-5 | **Quotation conversion** (won / not won) is not systemised | No visibility of pipeline | [15:25] |
| PP-6 | **Pipe prices change daily**; 3–4 suppliers per item; need to know which supplier supplied at what rate | Margin risk, price uncertainty | [18:20, 19:10] |
| PP-7 | Extinguisher **refill due dates** (1-year / 3-year) must be remembered manually to approach customers | Missed refill revenue | [06:40, 19:35–20:00] |
| PP-8 | **No project costing**: cannot see how much was given to the customer vs how much was spent (stock material, purchases, petrol, lodging) | Unknown project margin | [23:20–24:35] |
| PP-9 | **Customer and vendor outstanding** are not tracked in one place; reminders to customers are manual | Delayed collections | [25:25–25:50] |
| PP-10 | The previous in-house quotation CRM **failed because staff did not enter data** (invoices, POs) — "even super software is a waste" without data | Any new system can fail the same way | [26:15–27:05] |

---

## 4. Requirements captured

Priorities are a first proposal by Sirah Digital (MoSCoW); to be confirmed by the client. The authoritative, maintained list is in [../REQUIREMENTS.md](../REQUIREMENTS.md).

| ID | Requirement (as heard) | Ref | Proposed priority |
|---|---|---|---|
| REQ-001 | Standard BOQ templates per system (Hydrant, Sprinkler, FAS, PA, Extinguishers): select the system and size range and a standard bill of quantities appears | [03:45–04:10, 05:25] | Must |
| REQ-002 | Enter quantity per BOQ line; lines with zero quantity are excluded; nothing is skipped or missed | [05:25–05:50] | Must |
| REQ-003 | Item master with size variants (NB 300 → 25, ½"–1", M8–M12, channel sizes, kg/capacity) and makes | [08:45–09:10, 10:25–10:50] | Must |
| REQ-004 | Price master with purchase price history (this month, last month, past 1–3 years) | [06:15, 17:55] | Must |
| REQ-005 | Latest procured price is picked automatically when an item/size is selected in a quotation — no manual re-checking | [04:10–04:35, 12:55, 17:05–17:30] | Must |
| REQ-006 | All purchase (supplier) invoices are recorded; entering an invoice links automatically to item master and vendor master and updates the price | [16:40, 20:50] | Must |
| REQ-007 | Vendor master: supplier, items supplied, category, rate | [20:25–20:50] | Must |
| REQ-008 | Same item from multiple suppliers (3–4); record which supplier supplied at what rate | [19:10] | Must |
| REQ-009 | Sales price history: last quoted / sold price per item (and customer) shown when quoting | [21:40–22:55] | Must |
| REQ-010 | Buying and selling prices kept separate and must not clash (typical 40–50 % difference) | [22:30–22:55] | Must |
| REQ-011 | Quotation in the client's format with Supply and Erection rate/amount; Excel output | [11:15, 12:05, 13:20] | Must |
| REQ-012 | Quotation follow-up tracker: date given, to whom, next follow-up | [15:25] | Must |
| REQ-013 | Quotation conversion status (converted / not) | [15:25] | Must |
| REQ-014 | Customer PO (sales order) line-level delivery status for each project | [15:50–16:40, 19:35] | Must |
| REQ-015 | Pop-up on opening the system listing undelivered PO lines | [16:15] | Must |
| REQ-016 | Mark lines as in-transit / to be delivered later with a scheduled reminder | [16:15–16:40] | Must |
| REQ-017 | Extinguisher refill tracker (1-year / 3-year); reminder starts 10 days before expiry; internal only (dashboard), no customer notification | [06:40, 20:00] | Must |
| REQ-018 | Project cost centre: stock material, purchases and expenses (petrol, lodge stay vouchers by site engineers) add up to the project costing | [23:20–24:10] | Must |
| REQ-019 | Project position: contract value vs total spend ("how much is it standing") | [24:35] | Must |
| REQ-020 | Shared expenses (one trip for two projects) can be split manually across projects | [24:35–25:00] | Should |
| REQ-021 | Customer outstanding and vendor outstanding | [25:25] | Must |
| REQ-022 | Automatic e-mails to customers on outstanding due dates (ledger or pending amount), from Office 365 | [25:25–25:50, 29:35] | Should |
| REQ-023 | Stock with allocations (e.g. 100 fire-alarm panels — how many left, who asked for how many) | [21:15] | Could (future: distributorship) |
| REQ-024 | Distribution sales to other sellers | [00:50] | Won't (this phase) |
| REQ-025 | Data-entry accountability: categorise which entries each person must make, surface missing entries on a dashboard | [26:40–27:30] | Must |
| REQ-026 | Owner dashboard suited to the business | [27:30] | Must |
| REQ-027 | Budget-friendly build and running cost | [27:55–28:20] | Must |
| REQ-028 | Brand/make-specific pricing (e.g. Honeywell vs Ravel vs Edwards; Chakraa vs Safex) | [18:45] + price list | Must |
| REQ-029 | Billing (sales invoice) to the client in the client's existing format | [11:15, 30:00] | Must (format pending) |
| REQ-030 | Spare parts and refill spares can be quoted/sold | [00:25] + price list | Should |

---

## 5. Decisions

| ID | Decision | Ref |
|---|---|---|
| D-01 | There is no public supplier price list; the CRM will maintain its **own price master**, seeded from the client's master price list Excel and then updated from supplier invoices | [06:15, 08:45–09:10] |
| D-02 | The **latest procured rate** (from purchase invoice entry) is the default basis for quotation pricing; staff should not have to re-check | [05:50, 17:30] |
| D-03 | Buying price and selling price are stored and shown **separately** | [22:55] |
| D-04 | Refill reminders are **internal only**, shown on the dashboard, starting **10 days** before expiry; no customer notifications | [20:00] |
| D-05 | **Stock and allocations** are deferred to the distributorship phase (not current) | [21:15] |
| D-06 | Shared expenses are **split manually** by the user (e.g. half/half) — no automatic apportioning | [25:00] |
| D-07 | Sirah will **categorise each manual-entry point per person/role** and design the dashboard around it, to avoid the previous CRM failure | [27:05–27:30] |
| D-08 | Keep the solution **budget-friendly** now; enhancements later as the business grows | [28:20] |
| D-09 | Nothing will be finalised **without confirmation from Jagan sir** | [28:45] |
| D-10 | Day-to-day document exchange via **WhatsApp** (copy kept as record) | [02:05, 28:45] |

---

## 6. Action items

Status values: `Open` · `In progress` · `Done` · `Blocked` · `Dropped`.

| ID | Action | Owner | Due | Status | Ref / notes |
|---|---|---|---|---|---|
| A-01 | Send **4 sample BOQs / quotations** — as received from customers and as quoted/billed | Client (Karthick) | TBD | Open | [28:45, 30:00] |
| A-02 | Send the **billing (sales invoice) format** used for clients | Client (Karthick) | TBD | Open | [30:00] |
| A-03 | Share **company website** | Client | TBD | Open | [29:10–29:35] |
| A-04 | Share **Office 365 e-mail details** (sending mailbox/address; SMTP AUTH availability) | Client | TBD | Open | [29:35] |
| A-05 | **Confirm requirements with Jagan sir** and pass on any extra inputs | Client | Before sign-off | Open | [28:20–28:45] |
| A-06 | Complete blank prices in the master price list (fire alarm by make, extinguishers, many hydrant items) — *assumed need* | Client | Before UAT | Open | Price list file |
| A-07 | Provide company details for quotation/invoice header: GSTIN, address, bank details, logo, terms — *assumed need* | Client | Before UAT | Open | — |
| A-08 | File the client's WhatsApp pain-point list into project docs | Sirah (BC) | Next meeting | Open | Shared at [02:30]; text not in recording |
| A-09 | Draft requirements document | Sirah (BC) | 2026-11-21 | Done (v1.0) | [20:25] → [REQUIREMENTS.md](../REQUIREMENTS.md) |
| A-10 | Categorise manual-entry points per role ("what you must enter") | Sirah (BC) | 2026-11-21 | Done (draft) | [27:05] → [user guides](../user-guides/) |
| A-11 | Prepare a **budget-friendly proposal** (scope, phases, cost) | Sirah (Manager) | Next meeting | Open | [27:55] |
| A-12 | Build a clickable demo of the CRM for review | Sirah (Dev team) | Next meeting | In progress | — |
| A-13 | Prepare clarification questions (Section 7) for the next meeting | Sirah (BC) | Next meeting | Done | Section 7 |

---

## 7. Open questions / clarifications

| ID | Question | Why it matters | Ask |
|---|---|---|---|
| Q-01 | Pipe price unit: is ₹3,750 for GI 200 NB **per metre** or per **6 m length**? Same for other items (each / set / metre) | UOM drives quotation amounts | Karthick |
| Q-02 | Is the master price list a **purchase** (buying) list or a **selling** list? | Decides whether markup is applied on it | Karthick |
| Q-03 | Default **markup**: one figure (40 %? 50 %?) or per category / per customer? Minimum acceptable margin? | Supply rate calculation and Margin Guard | Karthick / Jagan sir |
| Q-04 | How is the **erection rate** decided — fixed per item & size, per metre, % of supply, or per project? | Erection column in quotation | Karthick |
| Q-05 | GST: confirm **18 %** for supply and erection; any items at other rates? Interstate (IGST) customers? | Tax totals on quotes/invoices | Accounts |
| Q-06 | Quotation number format — is **LBE/Q/2026-27/0001** acceptable? Revision suffix (R1, R2)? | Numbering | Karthick |
| Q-07 | Which extinguisher types/services follow a **1-year** vs **3-year** interval (refill vs hydro-test)? | Refill tracker rules | Karthick |
| Q-08 | Do customers send BOQs as Excel? Should we **import** a consultant BOQ Excel directly? | Effort saving vs cost | Karthick |
| Q-09 | Should the "last sold price" be shown **per customer**, overall, or both? | Sales price history | Karthick |
| Q-10 | Outstanding reminders: credit days per customer? Frequency (e.g. on due date, +7, +15)? Attach ledger PDF? Who is CC'd? | Dunning agent | Accounts |
| Q-11 | Tally/Vyapar: which remains the accounts master? Do we need export to Tally, or is the CRM invoice the master for outstanding? | Avoid double entry | Accounts / Jagan sir |
| Q-12 | Number of users per role (sales, purchase, accounts, site engineers, store) | Licensing-free, but sizing & training | Karthick |
| Q-13 | Who **approves** quotations below target margin and expense vouchers? | Approval workflow | Jagan sir |
| Q-14 | Distributorship: which brand, expected timeline? | Phase 2 planning (stock, dealer pricing) | Jagan sir |
| Q-15 | Meaning of row "900LPM / 1180 / 2250" under Electrical Panel in the price list (pump capacity variants?) | Item master structure | Karthick |
| Q-16 | Butterfly valve ₹1,250 is under the 25 NB column — is that the correct size? | Data seeding | Karthick |
| Q-17 | Data migration: existing customers, vendors, open quotations, open POs, outstanding balances — from where (Tally export, Excel)? | Go-live readiness | Accounts |
| Q-18 | Is a Tamil-language interface or WhatsApp notifications needed? (Out of current budget unless requested) | Scope | Karthick |
| Q-19 | Jagan sir's role (owner/partner/approver) and his availability for the next meeting | Sign-off | Karthick |

---

## 8. Assumptions (Sirah Digital, to be validated)

- AS-1: GST 18 % default on supply and erection (Q-05).
- AS-2: Indian financial year April–March for document numbering (Q-06).
- AS-3: Selling (supply) rate = latest purchase rate × (1 + markup %), markup default 40 % (Q-03).
- AS-4: Refill reminders shown to owner/admin and sales on the dashboard only (D-04).
- AS-5: Hosting on Vercel + managed Postgres free/low tiers to meet the budget constraint.
- AS-6: Users access via browser on PC and mobile; site engineers mostly on mobile.

---

## 9. Future scope (captured, not in current phase)

- Distributorship: stock in bulk (e.g. 100 fire-alarm panels), allocations to orders, dealer price lists, dealer sales [00:50, 21:15].
- Further customisation "once we grow" [28:20].
- Possible: BOQ Excel import, Tally export, WhatsApp reminders, Tamil UI (see Q-08, Q-11, Q-18).

---

## 10. Next meeting agenda (proposed)

1. Walk-through of the demo CRM (quotation from BOQ template → follow-up → sales order → delivery → invoice) — 20 min.
2. Review of the 4 sample BOQs and billing format received (A-01, A-02) — 10 min.
3. Clarifications Q-01 … Q-19 (priority: Q-01–Q-07, Q-10, Q-11, Q-13) — 20 min.
4. Confirm MoSCoW priorities in [REQUIREMENTS.md](../REQUIREMENTS.md) and the data-entry responsibilities per role — 10 min.
5. Budget-friendly proposal and phasing (A-11) — 10 min.
6. Jagan sir's inputs and sign-off path (A-05) — 5 min.
7. Agree go-live data: price list completion, customer/vendor masters, Office 365 mailbox (A-04, A-06, A-07).

Pre-reads to send: this document, REQUIREMENTS.md, demo link.

---

## 11. Change log / revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-11-21 | Sirah Digital — Business Consultant | First version from recording and Sarvam AI transcript; reference Excel files reviewed |
| | | | *Add a row whenever an action item, decision or question in this file changes after a later meeting* |

---

## 12. Full transcript

The full bilingual transcript (English translation + original Tamil/English) is kept unchanged at **[docs/meeting-transcript.md](../meeting-transcript.md)**.
