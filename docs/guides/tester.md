# Tester Guide: Test Strategy and UAT Checklist

## 1. Strategy

| Level | What | Who | When |
|---|---|---|---|
| Unit | Business rules: price resolution, markup, GST split, FY numbering, line status, and each agent with a fixed "today" | Developers | Every PR |
| Integration | Server actions with the database (PGlite in CI): saving a purchase invoice, BOQ → quote, SO → delivery → invoice | Developers / tester | Every PR |
| System / E2E | Cross-module flows on the Vercel preview, for all six roles | Tester | Each milestone |
| Non-functional | Mobile (360 px Android Chrome), performance (exporting a 150-line quote), security checks (RBAC, auth) | Tester + Security | M4 to M5 |
| UAT | Client staff on real data, using the checklist below | Client + Business Consultant + tester | M5 |

**Automated suites today:** 197 unit and integration tests (`npm test`) and 66 HTTP end-to-end checks (`E2E_BASE_URL=... npx vitest run`), plus the role crawler `node scripts/smoke-crawl.mjs <url> 300`. Results are in [TEST_REPORT.md](../TEST_REPORT.md). The rows below marked Version 2 and UI rebuild still need a person at a browser.

**Test data.** Seed it from the client's files: Pipe GI 200 NB ₹3,750 … 25 NB ₹1,900; Pipe MS 200 NB ₹2,600 … 25 NB ₹1,300; Single Hydrant Valve ₹7,500; 2-way FBI valve ₹12,500; Pressure gauge ₹2,250; Pressure switch ₹3,500; Hose reel drum ₹7,500; Hose box double door ₹5,100; RRL Hose with SS ₹6,500; Foot valve ₹18,500; Branch pipe ₹2,750; Pendant sprinkler ₹550; Electrical panel ₹29,000; Jockey pump ₹1,20,000; Diesel engine ₹5,00,000; fire-alarm items by make (Ravel, Edwards, Honeywell…) without price; extinguishers ABC 6 kg and CO2 4.5 kg by Chakraa and Safex. Use 3 vendors, 4 customers (one outside Tamil Nadu, for IGST) and 2 projects.

**Defect severity.** Sev-1: wrong money, tax or price, data loss, or a security hole. Sev-2: a feature is blocked with no workaround. Sev-3: a workaround exists. Sev-4: cosmetic. Go-live needs zero open Sev-1 and Sev-2 defects.

Default assumptions behind the expected results: markup 40 %, minimum margin 15 %, GST 18 %, validity 30 days, approval mode "below minimum margin", stale after 90 days (7 for volatile items such as pipes and cable, as built). If the client changes these (Q-03, Q-05), update the expected values.

## 2. UAT checklist for each module

Mark each test Pass, Fail or Blocked, with the tester's initials and the date.

### 2.1 Login & roles
| # | Test | Expected |
|---|---|---|
| L-1 | Log in as each of admin, sales, purchase, accounts, engineer, store | Each sees only their own menus (see the RBAC matrix in [security-engineer.md](security-engineer.md)) |
| L-2 | As sales, open a purchase-invoice URL directly | Access denied on the server, not just a hidden menu |
| L-3 | Wrong password 5 times | Login throttled, with a generic error message |
| L-4 | Log out, then press the browser's Back button | No data shown; redirected to login |

### 2.2 Item Master & Price Master
| # | Test | Expected |
|---|---|---|
| IM-1 | Import the master price list | Pipe GI 200 NB = ₹3,750 dated 12-10-2026; items without prices listed as "No price" |
| IM-2 | Create a duplicate "Pipe GI / 50 NB / same make" | Rejected with a message |
| IM-3 | Search "pipe ms 80" | Finds Pipe MS 80 NB |
| PM-1 | Enter a purchase invoice for Pipe MS 80 NB at ₹1,650 (Vendor B, today) | Item shows latest purchase rate ₹1,650, Vendor B, today. History keeps ₹1,600 (price list) |
| PM-2 | Enter an older invoice (dated last month) at ₹1,500 | Latest rate stays ₹1,650 (latest by invoice date) |
| PM-3 | Sales history | Shows last quoted and sold rates separately from purchase history |
| PM-4 | Pipe rate dated 8 days ago | Amber "stale" badge (the pipe threshold is 7 days; other items 90 days) |

### 2.3 Vendors
| # | Test | Expected |
|---|---|---|
| VN-1 | After PM-1, open Vendor B | Lists Pipe MS 80 NB with last rate ₹1,650 automatically |
| VN-2 | Same item bought from Vendors A, B and C | Item page lists all three with their last rates, cheapest highlighted |

### 2.4 Customers
| # | Test | Expected |
|---|---|---|
| CU-1 | GSTIN with 14 characters | Validation error |
| CU-2 | Customer page | Shows quotes, orders, invoices, outstanding and refill records |

### 2.5 BOQ Templates → Quotation
| # | Test | Expected |
|---|---|---|
| BQ-1 | Hydrant template, enter qty on 18 lines and zero elsewhere, then Create quotation | Quotation has exactly 18 lines in template order; message "42 lines excluded" (if the template has 60) |
| BQ-2 | BOQ Ref "1.2" and "A.11.3" | Stored and exported exactly, as text, not "1.2000000000000002" |
| BQ-3 | All quantities zero | Quotation not created; the message asks for at least one quantity |

### 2.6 Quotations & follow-up
| # | Test | Expected |
|---|---|---|
| QT-1 | Add Pipe MS 80 NB (latest ₹1,650), qty 120 m | Supply rate ₹2,310 (1,650 × 1.40); amount ₹2,77,200.00 |
| QT-2 | Erection rate from the item master (for example ₹250/m set in the master) | Erection amount 120 × 250 = ₹30,000.00 |
| QT-3 | GST 18 % for a Tamil Nadu customer on taxable ₹3,07,200 | CGST ₹27,648.00 + SGST ₹27,648.00; total ₹3,62,496.00 |
| QT-4 | The same for a Karnataka customer | IGST ₹55,296.00 |
| QT-5 | Override the supply rate to ₹1,800 (margin 8.3 %) | Red margin warning; cannot mark Sent without admin approval |
| QT-6 | First quote on or after 01-04-2027 | Number LBE/Q/2027-28/0001 |
| QT-7 | Excel export | Columns BOQ Ref, Description, Quantity, UOM, SUPPLY Rate/Amount, ERECTION Rate/Amount, Remarks; totals correct; opens in Excel without repair |
| QT-8 | Print / PDF | A4, company header, quote no., validity, ₹ in Indian format |
| QT-9 | Mark Sent without a next follow-up date | Blocked with a message |
| QT-10 | Mark Won | Asks for PO no. and date; sales order created with the same lines |
| QT-11 | Mark Lost | Asks for a reason |
| QT-12 | Revise a quote | New number with suffix -R1; the original is kept read-only |

### 2.7 Sales Orders & Deliveries
| # | Test | Expected |
|---|---|---|
| SO-1 | SO with 10 lines; deliver 9 in full | SO status Partial; line 10 Pending |
| SO-2 | Log in as store the next day | Pop-up lists line 10 with customer, PO no., pending qty and expected date |
| SO-3 | Mark line 10 In transit, expected tomorrow | Status In transit; agent alert "Arriving" on the next run |
| SO-4 | Deliver more than the pending qty | Rejected |
| SO-5 | Deliver line 10 | SO Delivered; appears in "Ready to invoice"; no longer in the pop-up |

### 2.8 Purchase Invoices
| # | Test | Expected |
|---|---|---|
| PI-1 | Same vendor and invoice no. twice | The second is rejected |
| PI-2 | Invoice with a new item created inline | Item exists in the master with size, make and UOM |
| PI-3 | Invoice tagged to Project X | Project X spend rises by the taxable value (confirm whether GST is included; our assumption is that it is excluded) |
| PI-4 | Vendor terms 30 days | Payable due = invoice date + 30 |

### 2.9 Projects & Expenses
| # | Test | Expected |
|---|---|---|
| PR-1 | Contract ₹10,00,000, budget ₹7,00,000; tagged purchases ₹4,00,000 | Spend ₹4,00,000; margin ₹6,00,000 |
| EX-1 | Engineer on a phone logs petrol ₹2,000 with a photo, split 50/50 between Projects X and Y | Two shares of ₹1,000; status Submitted; not yet in project cost |
| EX-2 | Accounts approves | Each project's spend goes up by ₹1,000 |
| EX-3 | Split 60 % + 30 % | Rejected (must total 100 %) |
| PR-2 | Push spend to ₹5,60,000 (80 % of budget) | Project Budget Agent warning |

### 2.10 Sales Invoices, Payments, Outstanding
| # | Test | Expected |
|---|---|---|
| SI-1 | Invoice a delivered SO | Number LBE/INV/2026-27/xxxx; amounts based on delivered qty |
| SI-2 | Part payment of ₹1,00,000 against ₹3,62,496 | Outstanding ₹2,62,496.00 |
| OS-1 | Ageing | A 45-day-old invoice sits in the 31 to 60 bucket |
| OS-2 | Vendor outstanding | Shows unpaid purchase invoices with due dates |

### 2.11 Refill Tracker
| # | Test | Expected |
|---|---|---|
| RF-1 | 12 × ABC 6 kg Safex, last refill 01-12-2025, 1 yr | Next due 01-12-2026; appears in Refills due from 21-11-2026, not on 20-11-2026 |
| RF-2 | Record with a 3-year interval | Next due = last + 36 months |
| RF-3 | Mark refilled on 03-12-2026 | Next due 03-12-2027; removed from the due list |
| RF-4 | Check the e-mail log | No customer e-mail sent for refills |

### 2.12 Automation Agents (run with fixed dates using "Run now")
| # | Agent | Test | Expected |
|---|---|---|---|
| AG-1 | Follow-up | Quote Sent, next follow-up was yesterday | Alert to the quote owner |
| AG-2 | Follow-up | Run twice on the same day | One alert, not two |
| AG-3 | Pending Delivery | Line expected 8 days ago | Critical overdue alert |
| AG-4 | Refill Due | RF-1 data on 21-11-2026 | Alert created |
| AG-5 | Receivables Dunning | Invoice due today, customer has an e-mail | One e-mail sent and logged; none if reminders are disabled or there is no e-mail |
| AG-6 | Receivables Dunning | 5th week overdue | No 5th e-mail; accounts is alerted to call |
| AG-7 | Payables Due | Vendor invoice due in 4 days | Alert |
| AG-8 | Stale Price | Pipe rate 8 days old; valve rate 20 days old | Pipe flagged; valve not flagged |
| AG-9 | Margin Guard | Line selling below cost | Alert to admin |
| AG-10 | Data Hygiene | Won quote with no SO after 3 days; delivered SO not invoiced after 3 days | Both listed under the responsible user |
| AG-11 | Quote Expiry | Validity ends in 4 days | "Expiring" alert; after validity, status becomes Expired |
| AG-12 | Project Budget | Spend at 100 % of budget | Critical alert |
| AG-13 | Auto-resolve | Fix the condition (deliver the line) and run again | Alert resolved |
| AG-14 | Cron security | Call the agents endpoint without CRON_SECRET | 401, and nothing runs |
| AG-15 | AMC & Service | Active AMC with a visit scheduled in 5 days | Visit reminder to the visit's engineer (or sales if none is assigned) |
| AG-16 | AMC & Service | AMC ending in 20 days, no renewal yet | Renewal alert to sales; it clears when the contract is renewed |
| AG-17 | AMC & Service | Service call past its response deadline, not resolved | Critical "SLA breached" alert; it clears when the call is resolved |
| AG-18 | AMC & Service | AMC whose end date has passed | Contract status set to Expired on the next run; a second run changes nothing |
| AG-19 | Data Hygiene (approvals check) | Quote waiting for approval for more than 1 day | "Awaiting your approval" alert to admin (critical after 3 days); clears once approved or rejected |

### 2.13 Dashboard, Meeting Notes, Mobile
| # | Test | Expected |
|---|---|---|
| DB-1 | Each tile's count matches its filtered list | Equal |
| DB-2 | Amounts | ₹1,23,456.00 format |
| MN-1 | Create a meeting note with an action item linked to a customer | Visible on the customer page; the team can edit it |
| MB-1 | Engineer flows on 360 px Android Chrome | No horizontal page scroll; camera upload works; buttons at least 44 px |
| PF-1 | Excel export of a 150-line quotation | Under 5 s |

### 2.14 Version 2: quotation approval and price freshness
| # | Test | Expected |
|---|---|---|
| AP-1 | Settings, Pricing defaults: approval mode **Off**; a quote with a line below minimum margin | Can be marked sent and emailed straight away |
| AP-2 | Approval mode **Only below minimum margin** (default); same quote | Mark sent, Email and Mark won are blocked; "Request approval" sets the quote to Pending |
| AP-3 | Approval mode **All quotations**; a quote with healthy margins | Still needs approval before it can be sent |
| AP-4 | As admin, approve with a note, then as sales send the quote | Sending works; the note and approver are shown on the quote |
| AP-5 | Edit a line price on an approved quote that still needs approval | The quote goes back to Pending |
| AP-6 | As admin, reject | Quote cannot be sent; sales sees the reason |
| AP-7 | Revise or copy an approved quote | The new quote does not inherit the approval |
| QP-1 | Add an item that has a posted purchase invoice | The line shows rate, price date and supplier (for example "₹1,650 · 12 Nov 2026 · Vendor B") |
| QP-2 | Line whose pipe price is 8 days old, and a valve price 100 days old | Both lines carry the stale flag |
| QP-3 | Line priced from the list price, or typed by hand | Shown as list or manual price, never flagged as stale |

### 2.15 Version 2: consultant BOQ import
| # | Test | Expected |
|---|---|---|
| BI-1 | Import BOQ (Sell group, or New, Import BOQ) with the client's sample consultant BOQ (150 lines) | 95 lines matched automatically, 55 to check, 0 unmatched |
| BI-2 | Review screen: correct a "to check" line by picking another item | The chosen item and its latest cost are used |
| BI-3 | Create the quotation | Lines keep their BOQ Refs and order; rates use latest cost × markup; the quote passes the same approval gate as any other quote |
| BI-4 | Upload a macro-enabled `.xlsm` file, an old `.xls` file, or a file over 8 MB | Refused with a clear message |
| BI-5 | Excel export of the imported quote | Opens in the client's SUPPLY / ERECTION format |

### 2.16 Version 2: vendor purchase orders
| # | Test | Expected |
|---|---|---|
| VP-1 | From a customer order with pending lines, create a vendor PO | PO lines link to the order lines; those lines move from Pending to Ordered |
| VP-2 | From the PO, create a purchase invoice for part of the qty and post it | PO lines show received qty; PO status Partial |
| VP-3 | Receive the rest and post | PO status Received; item latest price, vendor rates and stock updated as for any posted bill |
| VP-4 | As engineer, open the customer order | The linked vendor POs card does not show buying totals |
| VP-5 | Print the PO | A4 document layout with company header |

### 2.17 Version 2: returns, credit notes and debit notes
| # | Test | Expected |
|---|---|---|
| RT-1 | Customer return of 2 units from a delivered order, restock on, post | Credit note number LBE/CN/...; order line returned qty +2; stock +2 at the delivery cost |
| RT-2 | Try to return more than delivered minus already returned | Rejected |
| RT-3 | Enter a credit note rate above the original invoice rate | Rejected |
| RT-4 | Adjust the posted credit note against an open invoice of the same customer | Invoice outstanding and credit note balance both go down by the same amount |
| RT-5 | Return to vendor from a posted bill, post | Debit note LBE/DN/...; stock goes down; cannot take stock below zero |
| RT-6 | Adjust the debit note against an open bill of the same vendor | Vendor outstanding goes down |
| RT-7 | Return tagged to a project with restock | Project actual cost goes down by qty × cost rate |

### 2.18 Version 2: advances and net outstanding
| # | Test | Expected |
|---|---|---|
| AD-1 | Record an advance of ₹50,000 for a customer (Money, Advances, or New, Record advance) | Receipt can be printed; customer net outstanding goes down by ₹50,000 |
| AD-2 | Apply ₹30,000 of it to an invoice | Invoice paid amount up by ₹30,000; unallocated advance ₹20,000 |
| AD-3 | Try to apply more than the unallocated advance or the invoice outstanding | Rejected |
| AD-4 | Try to apply it to another customer's invoice | Rejected |
| NO-1 | Customer with ₹2,00,000 unpaid on invoices, a ₹20,000 credit note not yet adjusted and a ₹30,000 advance not yet applied | Net outstanding ₹1,50,000 |
| NO-2 | Advance tagged to a project | Project "received" includes the advance |

### 2.19 Version 2: AMC and service calls
| # | Test | Expected |
|---|---|---|
| AM-1 | New AMC, 1 year, 4 visits per year | Number LBE/AMC/...; 4 visits scheduled evenly between start and end |
| AM-2 | Record a visit with the checklist for each system (hydrant, sprinkler, fire alarm and so on) | Visit done; checklist results and remarks saved; the visit report prints on A4 |
| AM-3 | As engineer, try to record a visit assigned to another engineer | Refused |
| AM-4 | Renew a contract | New contract linked to the old one; the old one is set to Renewed; the renewal alert clears |
| SC-1 | New service call (New, New service call) for an AMC customer with 24-hour response | Number LBE/SC/...; due by = raised time + 24 hours |
| SC-2 | Service call with no contract | Due by = raised time + 48 hours |
| SC-3 | Leave it unresolved past the deadline, then run the agents | Critical SLA alert (AG-17) |
| SC-4 | Resolve a chargeable call, then invoice it | The invoice is prefilled from the call, and the call cannot be invoiced twice |

### 2.20 Version 2: reports, profit and project history
| # | Test | Expected |
|---|---|---|
| RP-1 | Reports & profit, monthly P&L for a month with invoices, a credit note, deliveries and approved expenses | Sales = invoice subtotals − credit notes; cost of goods = delivery costs + project issues − restocked returns; net after expenses (CONVENTIONS rule 18) |
| RP-2 | Post a purchase bill in the month without delivering or issuing it | Monthly cost of goods does not change (purchases are not cost until delivered or issued) |
| RP-3 | Order P&L on a supply-only order | Revenue, cost and gross profit match CONVENTIONS rule 17 |
| RP-4 | Project, customer and item profitability (buy vs sell) | Figures agree with the project sheet and the item page |
| RP-5 | As engineer or store, open `/reports` | Access denied (reports need cost visibility) |
| RP-6 | Reports Excel export | Opens without repair; numbers match the screen |
| PH-1 | Project, History tab | A timeline of the project's documents and events (quotes, orders, deliveries, purchases, expenses, invoices, payments, returns) |

### 2.21 Version 2: upgrade path
| # | Test | Expected |
|---|---|---|
| UP-1 | Restore a copy of the version 1 database and boot version 2 against it | Boots; migration 0001 applied; no data lost; old quote lines show price dates where purchase history allows |
| UP-2 | Restart again | The backfill does not run a second time (settings key `migrations.v2_backfill_done`) |
| UP-3 | Same copy with `SEED_V2_DEMO=1` | Version 2 demo data added once (`migrations.v2_demo_seeded`); without the flag nothing is added |

### 2.22 UI rebuild (design system)
| # | Test | Expected |
|---|---|---|
| UI-1 | Sidebar for each role | Groups Home, Sell, Deliver, Buy, Money, Projects & site, Service, Automation, Admin; groups with nothing readable are hidden; collapsed groups are remembered |
| UI-2 | "New" quick create menu in the top bar | Shows only what the role can create (New quotation, Import BOQ, Record payment, Record advance, New expense, New service call) |
| UI-3 | Phone width (below 1024 px) for each role | Bottom tab bar with 4 destinations for the role plus More (for example engineer: Home, Projects, Expenses, Service calls) |
| UI-4 | Delete or cancel something | An inline confirm appears, with no browser pop-up |
| UI-5 | Density toggle on a list | The table switches between comfortable and compact, and the choice is remembered in this browser |
| UI-6 | Print a quotation, invoice, PO, credit note, AMC visit report and receipt | All use the same A4 document layout and print black on white |
| UI-7 | Every page at 375 px, in light and dark mode | No horizontal page scroll; status colours always come with text |

## 3. UAT sign-off

| Module | Client tester | Result | Date | Signature |
|---|---|---|---|---|
| (one row for each section above) | | | | |

Sign-off by Karthick and Jagan sir (D-09).
