# Kickoff Meeting: Linga Bhairavi Enterprise CRM

> **This is a living document.** It is the record of the 2026-11-20 meeting. Later meetings get their own file (see the [README](README.md)). When a later meeting changes something recorded here (an action item closes, a decision is reversed or a question is answered), update the row here **and** add a line to the [Change log](#11-change-log-revision-history).

| Field | Value |
|---|---|
| **Meeting** | Requirements kickoff: a CRM for a fire-protection contracting business |
| **Date / time** | 2026-11-20, 16:44 IST (from the recording timestamp) |
| **Duration** | About 31 minutes (the transcript runs from 00:00 to 30:25+) |
| **Mode** | Online video call, with the client's Excel files shown on screen share. Documents were also shared on WhatsApp |
| **Client** | Linga Bhairavi Enterprise, Hosur, Tamil Nadu |
| **Client attendees** | Karthi / Karthick (client side; shared the price list and quotation sample), and a client partner (name not captured in the recording) |
| **Client stakeholder (not confirmed present)** | Jagan sir. The client will confirm requirements with him before sign-off [28:20 to 28:45] |
| **Sirah Digital attendees** | Sirah Digital lead (interviewer) and Mr. Riyas (partner) [08:20] |
| **Source recording** | `kcs-edcx-tez (2026-11-20 16_44 GMT+5_30).mp4` (in the project root; not committed to git) |
| **Transcription method** | Sarvam AI speech-to-text on mixed Tamil/English (ta-IN / en-IN) audio, machine translated to English. The original-language text is kept beneath each English line. Timestamps mark the start of each 25-second chunk. |
| **Full transcript** | [../meeting-transcript.md](../meeting-transcript.md) |
| **Notes prepared by** | Sirah Digital (Business Consultant), https://sirahdigital.in/ |
| **Status** | v1.0 draft, awaiting client confirmation (including Jagan sir) |

**How to read timestamps:** `[mm:ss]` points to the transcript chunk where the point was made. The translation is done by machine, so the quoted wording is paraphrased. Treat the *meaning* as final only once the client confirms it.

---

## 1. Executive summary

Linga Bhairavi Enterprise is a fire-protection turnkey contractor based in Hosur (extinguishers, hydrant, sprinkler, fire alarm, PA/voice evacuation and spare parts). It plans to become a distributor of fire-alarm products. Its quotations are slow because staff **re-check the latest supplier price by hand for every quotation**. There is **no follow-up or conversion tracking**, **undelivered lines on customer POs get forgotten**, and **project spend against contract value is not visible**. Accounts run on Tally and Vyapar. An earlier in-house quotation CRM failed because **staff did not enter data**.

The client wants a **budget-friendly** CRM that:

1. Builds quotations from **standard BOQ templates for each system**, where only lines with a quantity appear and nothing is skipped.
2. Picks up the **latest procured (purchase) price** automatically from supplier invoices, keeps **price history**, and keeps **buying and selling prices separate** (usually 40 to 50 % apart).
3. Tracks **quotation follow-ups and conversion**, **delivery of each customer-PO line** (with a pop-up for pending items), **extinguisher refill due dates** (an internal reminder 10 days before), **project cost centres**, and **customer and vendor outstanding** with automatic reminder e-mails (Office 365).

Sirah Digital will draft the requirements, sort out which data each person must enter, and propose a solution. The client will send 4 sample BOQs/quotations with their billing format, the website and the Office 365 e-mail details, and will confirm everything with Jagan sir.

---

## 2. Business context

| Topic | What we heard | Ref |
|---|---|---|
| Business | Complete fire-protection systems as turnkey projects: fire extinguishers, fire hydrant, fire alarm system, sprinklers "and a little more" | [00:00 to 00:25] |
| Compliance driver | New factories and companies must meet the fire requirements of the building code or fire authority ("NPC" in the transcript, most likely **NBC, the National Building Code of India**; *to confirm*) | [00:25] |
| Spare parts | Also sells spare parts now and then | [00:25] |
| Future plan | Take a **distributorship** for a fire-alarm brand and sell to other sellers (smoke detectors, sprinklers and so on) instead of buying from someone else | [00:50] |
| Where BOQs come from | Either from the customer or consultant, or prepared by Linga Bhairavi. There is no single standard BOQ | [03:45] |
| Products | Standard items, bought and then resold or installed. **Not manufactured** | [07:30 to 07:55] |
| Variation | Limited: about 10 pipe variations, around 3 for hydrant, and generally 5 or 6 variations per item | [10:25 to 10:50] |
| Suppliers | Buys the same item from **3 or 4 suppliers**. Prices are given only on enquiry, and brand-specific pricing matters | [18:45 to 19:10] |
| Price volatility | **Pipe prices change daily** | [18:20] |
| Margin | The selling price is usually **40 to 50 % different** from the buying price | [22:30] |
| Current software | **Tally** (accounts) and **Vyapar**. A custom quotation CRM existed earlier, but staff did not keep it up | [25:50 to 26:40] |
| E-mail | Uses **Office 365** | [29:35] |
| Budget | A growing company. Asked for a budget-friendly solution and will upgrade later | [27:55 to 28:20] |

**Reference files shared by the client (in the project root):**

- `Price list for Hydrandt and Fire alarm.xlsx`: the master price list dated 12.10.2026 (the Fire Alarm sheet is also dated 08.09.2026).
  - *Hydrant and Sprinkler*: 62 items with NB-size columns 300 / 250 / 200 / 150 / 100 / 80 / 65 / 50 / 40 / 32 / 25. For example: Pipe GI (₹3,750 at 200 NB … ₹1,900 at 25 NB), Pipe MS (₹2,600 … ₹1,300), Single Hydrant Valve ₹7,500, 2-way FBI valve ₹12,500, Pressure gauge ₹2,250, Pressure switch ₹3,500, Hose reel drum ₹7,500, Hose box double door ₹5,100, RRL Hose with SS ₹6,500, Foot valve ₹18,500, Branch pipe (nozzle) ₹2,750, Pendant sprinkler ₹550, Electrical panel ₹29,000, Electrical motor / Electrical pump / Jockey pump ₹1,20,000 each, Diesel engine ₹5,00,000, C Channel ₹1,200 to ₹2,700 by size, Painting charges ₹200. Many items have no price yet.
  - *Fire Alarm*: 20 items (conventional and addressable panels, heat/smoke/multi/beam/gas detectors, base, hooter, MCP, isolator and control modules, FRLS cable, back box, battery) with make columns Honeywell/Morley/System Sensor, Ravel, Glyptic, Edwards, ASES (each with a UL variant). Cables: Polycab, LAP, Ambika, Orbit (+UL). Batteries: Exide, Amaron. **No prices filled in yet.**
  - *New Fire Extinguishers*: New, Refilling and Refill spare-parts lists by make, Chakraa / Safex. ABC 2/4/6/9/25/50 kg, CO2 2/4.5/9/25/50 kg, Clean Agent, Foam, Zebra boards, Stand. Spares: Nozzle, Handle, Washer, Body belt, Tube, Horn, Valve. **No prices filled in yet.**
- `Hydrant,Sprinkler & Fas,PA-Quotation Sampel- Karthick_3122.xlsx`: the customer quotation format, with columns **BOQ Ref | Description | Quantity | UOM | SUPPLY Rate | Amount | ERECTION Rate | Amount | Remarks**. Sheets: *Hydrant & Sprinkler-1* (sections A pumps/valves/panel/cabling, B hydrant, C sprinkler, D extinguishers), *Hydrant Sprinkler-2* (MS pipe 25 to 200 NB, sprinklers K115, rosette plates, removal and reuse works), *FAS & PA-1* (addressable FAS plus 6-zone voice evacuation PA), *FAS-2* (8-loop panel, network module, repeater, cabling). The sample has descriptions only. Quantities and rates are blank.

---

## 3. Pain points

| # | Pain point | Impact | Ref |
|---|---|---|---|
| PP-1 | For **every quotation**, staff check the latest price by hand with suppliers or past supply records | Quotations are delayed | [04:35 to 05:00] |
| PP-2 | There is no standard BOQ. BOQ lines are put together by hand, so items can be **skipped or missed** | Wrong or incomplete quotes | [03:45, 05:25] |
| PP-3 | When customer orders (POs) come in, the dispatch team **sometimes misses 2 or 3 line items**. For example, 9 of 10 lines are delivered and one is out of stock or in transit, and it is **forgotten under pressure from other orders** | Unhappy customers and delayed billing | [05:00, 15:50 to 16:15] |
| PP-4 | **No follow-up tracker** after a quotation is given (to whom, and when) | Lost opportunities | [15:25] |
| PP-5 | **Quotation conversion** (won or not won) is not tracked in any system | No view of the pipeline | [15:25] |
| PP-6 | **Pipe prices change daily**, there are 3 or 4 suppliers per item, and the team needs to know which supplier supplied at what rate | Margin risk and price uncertainty | [18:20, 19:10] |
| PP-7 | Extinguisher **refill due dates** (1-year or 3-year) have to be remembered by hand to approach customers | Missed refill revenue | [06:40, 19:35 to 20:00] |
| PP-8 | **No project costing**: the team cannot see what was quoted to the customer against what was spent (stock material, purchases, petrol, lodging) | Project margin is unknown | [23:20 to 24:35] |
| PP-9 | **Customer and vendor outstanding** are not tracked in one place, and customer reminders are sent by hand | Delayed collections | [25:25 to 25:50] |
| PP-10 | The earlier in-house quotation CRM **failed because staff did not enter data** (invoices, POs). Without data, "even super software is a waste" | Any new system can fail the same way | [26:15 to 27:05] |

---

## 4. Requirements captured

These priorities are Sirah Digital's first proposal (MoSCoW) and need the client's confirmation. The maintained master list is in [../REQUIREMENTS.md](../REQUIREMENTS.md).

| ID | Requirement (as heard) | Ref | Proposed priority |
|---|---|---|---|
| REQ-001 | Standard BOQ templates for each system (Hydrant, Sprinkler, FAS, PA, Extinguishers). Select the system and size range, and a standard bill of quantities appears | [03:45 to 04:10, 05:25] | Must |
| REQ-002 | Enter a quantity for each BOQ line. Lines with zero quantity are left out, and nothing is skipped or missed | [05:25 to 05:50] | Must |
| REQ-003 | Item master with size variants (NB 300 → 25, ½" to 1", M8 to M12, channel sizes, kg/capacity) and makes | [08:45 to 09:10, 10:25 to 10:50] | Must |
| REQ-004 | Price master with purchase price history (this month, last month, the past 1 to 3 years) | [06:15, 17:55] | Must |
| REQ-005 | The latest procured price is picked automatically when an item and size are selected in a quotation, with no checking by hand | [04:10 to 04:35, 12:55, 17:05 to 17:30] | Must |
| REQ-006 | Every purchase (supplier) invoice is recorded. Entering an invoice links it to the item master and vendor master and updates the price | [16:40, 20:50] | Must |
| REQ-007 | Vendor master: supplier, items supplied, category, rate | [20:25 to 20:50] | Must |
| REQ-008 | The same item from several suppliers (3 or 4). Record which supplier supplied at what rate | [19:10] | Must |
| REQ-009 | Sales price history: the last quoted or sold price per item (and customer) is shown while quoting | [21:40 to 22:55] | Must |
| REQ-010 | Buying and selling prices are kept separate and must not clash (usually a 40 to 50 % difference) | [22:30 to 22:55] | Must |
| REQ-011 | Quotation in the client's format with Supply and Erection rate and amount, and Excel output | [11:15, 12:05, 13:20] | Must |
| REQ-012 | Quotation follow-up tracker: date given, to whom, next follow-up | [15:25] | Must |
| REQ-013 | Quotation conversion status (converted or not) | [15:25] | Must |
| REQ-014 | Delivery status of each customer PO (sales order) line, for each project | [15:50 to 16:40, 19:35] | Must |
| REQ-015 | A pop-up listing undelivered PO lines when the system is opened | [16:15] | Must |
| REQ-016 | Mark lines as in transit or to be delivered later, with a scheduled reminder | [16:15 to 16:40] | Must |
| REQ-017 | Extinguisher refill tracker (1-year or 3-year). The reminder starts 10 days before expiry and is internal only (dashboard), with no customer notification | [06:40, 20:00] | Must |
| REQ-018 | Project cost centre: stock material, purchases and expenses (petrol and lodge stay vouchers from site engineers) add up to the project costing | [23:20 to 24:10] | Must |
| REQ-019 | Project position: contract value against total spend ("how much is it standing") | [24:35] | Must |
| REQ-020 | Shared expenses (one trip for two projects) can be split by hand across projects | [24:35 to 25:00] | Should |
| REQ-021 | Customer outstanding and vendor outstanding | [25:25] | Must |
| REQ-022 | Automatic e-mails to customers on outstanding due dates (ledger or pending amount), sent from Office 365 | [25:25 to 25:50, 29:35] | Should |
| REQ-023 | Stock with allocations (for example, 100 fire-alarm panels: how many are left, who asked for how many) | [21:15] | Could (future: distributorship) |
| REQ-024 | Distribution sales to other sellers | [00:50] | Won't (this phase) |
| REQ-025 | Data-entry accountability: decide which entries each person must make, and show missing entries on a dashboard | [26:40 to 27:30] | Must |
| REQ-026 | An owner dashboard that suits the business | [27:30] | Must |
| REQ-027 | Budget-friendly build and running cost | [27:55 to 28:20] | Must |
| REQ-028 | Brand- or make-specific pricing (for example Honeywell vs Ravel vs Edwards; Chakraa vs Safex) | [18:45] + price list | Must |
| REQ-029 | Billing (sales invoice) to the client in the client's existing format | [11:15, 30:00] | Must (format pending) |
| REQ-030 | Spare parts and refill spares can be quoted and sold | [00:25] + price list | Should |

---

## 5. Decisions

| ID | Decision | Ref |
|---|---|---|
| D-01 | There is no public supplier price list, so the CRM will keep its **own price master**. It starts from the client's master price list Excel and is then updated from supplier invoices | [06:15, 08:45 to 09:10] |
| D-02 | The **latest procured rate** (from purchase invoice entry) is the default basis for quotation pricing. Staff should not have to re-check | [05:50, 17:30] |
| D-03 | Buying price and selling price are stored and shown **separately** | [22:55] |
| D-04 | Refill reminders are **internal only**. They show on the dashboard from **10 days** before expiry, with no customer notifications | [20:00] |
| D-05 | **Stock and allocations** wait for the distributorship phase (not current) | [21:15] |
| D-06 | The user **splits shared expenses by hand** (for example half and half). There is no automatic apportioning | [25:00] |
| D-07 | Sirah Digital will **list each manual-entry point for each person or role** and design the dashboard around it, so the earlier CRM failure is not repeated | [27:05 to 27:30] |
| D-08 | Keep the solution **budget-friendly** for now, with enhancements later as the business grows | [28:20] |
| D-09 | Nothing will be finalised **without confirmation from Jagan sir** | [28:45] |
| D-10 | Day-to-day documents are exchanged on **WhatsApp** (a copy is kept as a record) | [02:05, 28:45] |

---

## 6. Action items

Status values: `Open` · `In progress` · `Done` · `Blocked` · `Dropped`.

| ID | Action | Owner | Due | Status | Ref / notes |
|---|---|---|---|---|---|
| A-01 | Send **4 sample BOQs or quotations**, both as received from customers and as quoted or billed | Client (Karthick) | TBD | Open | [28:45, 30:00] |
| A-02 | Send the **billing (sales invoice) format** used for clients | Client (Karthick) | TBD | Open | [30:00] |
| A-03 | Share the **company website** | Client | TBD | Open | [29:10 to 29:35] |
| A-04 | Share **Office 365 e-mail details** (sending mailbox and address; whether SMTP AUTH is available) | Client | TBD | Open | [29:35] |
| A-05 | **Confirm requirements with Jagan sir** and pass on any extra inputs | Client | Before sign-off | Open | [28:20 to 28:45] |
| A-06 | Fill in the blank prices in the master price list (fire alarm by make, extinguishers, many hydrant items). *Assumed need* | Client | Before UAT | Open | Price list file |
| A-07 | Provide company details for the quotation and invoice header: GSTIN, address, bank details, logo, terms. *Assumed need* | Client | Before UAT | Open | - |
| A-08 | File the client's WhatsApp pain-point list into the project docs | Sirah Digital (BC) | Next meeting | Open | Shared at [02:30]; text not in the recording |
| A-09 | Draft the requirements document | Sirah Digital (BC) | 2026-11-21 | Done (v1.0) | [20:25] → [REQUIREMENTS.md](../REQUIREMENTS.md) |
| A-10 | List the manual-entry points for each role ("what you must enter") | Sirah Digital (BC) | 2026-11-21 | Done (draft) | [27:05] → [user guides](../user-guides/) |
| A-11 | Prepare a **budget-friendly proposal** (scope, phases, cost) | Sirah Digital (Manager) | Next meeting | Open | [27:55] |
| A-12 | Build a clickable demo of the CRM for review | Sirah Digital (Dev team) | Next meeting | In progress | - |
| A-13 | Prepare clarification questions (Section 7) for the next meeting | Sirah Digital (BC) | Next meeting | Done | Section 7 |
| A-14 | Hold a **clarification meeting** requested by the owner's spouse after the 2026-11-26 follow-up: walk through version 2 (returns, AMC, advances, owner approval, BOQ import, P&L, project history) and answer her questions | Sirah Digital (Manager, BC) with the client | Friday 2026-11-28 | Open | Added 2026-11-26 (see change log 1.1) |

---

## 7. Open questions and clarifications

| ID | Question | Why it matters | Ask |
|---|---|---|---|
| Q-01 | Pipe price unit: is ₹3,750 for GI 200 NB **per metre** or per **6 m length**? The same goes for other items (each, set or metre) | The UOM drives quotation amounts | Karthick |
| Q-02 | Is the master price list a **purchase** (buying) list or a **selling** list? | Decides whether markup is applied on it | Karthick |
| Q-03 | Default **markup**: one figure (40 %? 50 %?), or by category or customer? What is the minimum acceptable margin? | Supply rate calculation and Margin Guard | Karthick / Jagan sir |
| Q-04 | How is the **erection rate** decided: fixed per item and size, per metre, a % of supply, or per project? | Erection column in the quotation | Karthick |
| Q-05 | GST: confirm **18 %** for supply and erection. Are any items at other rates? Any interstate (IGST) customers? | Tax totals on quotes and invoices | Accounts |
| Q-06 | Quotation number format: is **LBE/Q/2026-27/0001** acceptable? Revision suffix (R1, R2)? | Numbering | Karthick |
| Q-07 | Which extinguisher types or services follow a **1-year** interval, and which a **3-year** interval (refill vs hydro-test)? | Refill tracker rules | Karthick |
| Q-08 | Do customers send BOQs as Excel? Should we **import** a consultant's BOQ Excel directly? | Effort saved vs cost | Karthick |
| Q-09 | Should the "last sold price" be shown **per customer**, overall, or both? | Sales price history | Karthick |
| Q-10 | Outstanding reminders: credit days per customer? How often (for example on the due date, +7, +15)? Attach a ledger PDF? Who is CC'd? | Dunning agent | Accounts |
| Q-11 | Tally/Vyapar: which one stays the accounts master? Do we need an export to Tally, or is the CRM invoice the master for outstanding? | Avoid double entry | Accounts / Jagan sir |
| Q-12 | Number of users for each role (sales, purchase, accounts, site engineers, store) | No licence cost, but it affects sizing and training | Karthick |
| Q-13 | Who **approves** quotations below the target margin, and expense vouchers? | Approval workflow | Jagan sir |
| Q-14 | Distributorship: which brand, and what timeline? | Phase 2 planning (stock, dealer pricing) | Jagan sir |
| Q-15 | What does the row "900LPM / 1180 / 2250" under Electrical Panel in the price list mean (pump capacity variants?) | Item master structure | Karthick |
| Q-16 | The butterfly valve at ₹1,250 sits under the 25 NB column. Is that the correct size? | Data seeding | Karthick |
| Q-17 | Data migration: where will existing customers, vendors, open quotations, open POs and outstanding balances come from (Tally export, Excel)? | Go-live readiness | Accounts |
| Q-18 | Is a Tamil-language interface or WhatsApp notification needed? (Outside the current budget unless requested) | Scope | Karthick |
| Q-19 | Jagan sir's role (owner, partner or approver) and his availability for the next meeting | Sign-off | Karthick |

---

## 8. Assumptions (Sirah Digital, to be validated)

- AS-1: GST of 18 % by default on supply and erection (Q-05).
- AS-2: The Indian financial year (April to March) is used for document numbering (Q-06).
- AS-3: Selling (supply) rate = latest purchase rate × (1 + markup %), with a default markup of 40 % (Q-03).
- AS-4: Refill reminders are shown only to owner/admin and sales, on the dashboard (D-04).
- AS-5: Hosting on Vercel plus managed Postgres free or low tiers, to stay within budget.
- AS-6: Users work in a browser on PC and mobile. Site engineers mostly use mobile.

---

## 9. Future scope (captured, not in this phase)

- Distributorship: bulk stock (for example 100 fire-alarm panels), allocations to orders, dealer price lists and dealer sales [00:50, 21:15].
- More customisation "once we grow" [28:20].
- Possible extras: BOQ Excel import, Tally export, WhatsApp reminders, a Tamil UI (see Q-08, Q-11, Q-18).

---

## 10. Next meeting agenda (proposed)

1. Walk through the demo CRM (quotation from a BOQ template → follow-up → sales order → delivery → invoice). 20 min.
2. Review the 4 sample BOQs and the billing format received (A-01, A-02). 10 min.
3. Clarifications Q-01 … Q-19 (priority: Q-01 to Q-07, Q-10, Q-11, Q-13). 20 min.
4. Confirm the MoSCoW priorities in [REQUIREMENTS.md](../REQUIREMENTS.md) and each role's data-entry responsibilities. 10 min.
5. The budget-friendly proposal and phasing (A-11). 10 min.
6. Jagan sir's inputs and the sign-off path (A-05). 5 min.
7. Agree on go-live data: completing the price list, customer and vendor masters, and the Office 365 mailbox (A-04, A-06, A-07).

Pre-reads to send: this document, REQUIREMENTS.md and the demo link.

---

## 11. Change log (revision history)

| Version | Date | Author | Change |
|---|---|---|---|
| 1.0 | 2026-11-21 | Sirah Digital (Business Consultant) | First version, from the recording and the Sarvam AI transcript. Reference Excel files reviewed |
| 1.1 | 2026-11-26 | Sirah Digital (Business Consultant) | Client follow-up of 2026-11-26 recorded. New asks: customer returns, AMC, advances, owner approval of quotations, consultant BOQ import, P&L and project history. All are built in version 2 and logged as REQ-045 onward in [REQUIREMENTS.md](../REQUIREMENTS.md). The owner's spouse requested a clarification meeting on **Friday 2026-11-28**, added as action item A-14. The original meeting content above is unchanged |
| | | | *Add a row whenever an action item, decision or question in this file changes after a later meeting* |

---

## 12. Full transcript

The full bilingual transcript (English translation plus the original Tamil/English) is kept unchanged at **[docs/meeting-transcript.md](../meeting-transcript.md)**.
