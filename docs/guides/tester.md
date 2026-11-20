# Tester Guide: Test Strategy and UAT Checklist

## 1. Strategy

| Level | What | Who | When |
|---|---|---|---|
| Unit | Business rules: price resolution, markup, GST split, FY numbering, line status, and each agent with a fixed "today" | Developers | Every PR |
| Integration | Server actions with the database (PGlite in CI): saving a purchase invoice, BOQ → quote, SO → delivery → invoice | Developers / tester | Every PR |
| System / E2E | Cross-module flows on the Vercel preview, for all six roles | Tester | Each milestone |
| Non-functional | Mobile (360 px Android Chrome), performance (exporting a 150-line quote), security checks (RBAC, auth) | Tester + Security | M4 to M5 |
| UAT | Client staff on real data, using the checklist below | Client + Business Consultant + tester | M5 |

**Test data.** Seed it from the client's files: Pipe GI 200 NB ₹3,750 … 25 NB ₹1,900; Pipe MS 200 NB ₹2,600 … 25 NB ₹1,300; Single Hydrant Valve ₹7,500; 2-way FBI valve ₹12,500; Pressure gauge ₹2,250; Pressure switch ₹3,500; Hose reel drum ₹7,500; Hose box double door ₹5,100; RRL Hose with SS ₹6,500; Foot valve ₹18,500; Branch pipe ₹2,750; Pendant sprinkler ₹550; Electrical panel ₹29,000; Jockey pump ₹1,20,000; Diesel engine ₹5,00,000; fire-alarm items by make (Ravel, Edwards, Honeywell…) without price; extinguishers ABC 6 kg and CO2 4.5 kg by Chakraa and Safex. Use 3 vendors, 4 customers (one outside Tamil Nadu, for IGST) and 2 projects.

**Defect severity.** Sev-1: wrong money, tax or price, data loss, or a security hole. Sev-2: a feature is blocked with no workaround. Sev-3: a workaround exists. Sev-4: cosmetic. Go-live needs zero open Sev-1 and Sev-2 defects.

Default assumptions behind the expected results: markup 40 %, minimum margin 15 %, GST 18 %, validity 30 days, stale after 30 days (7 for pipes). If the client changes these (Q-03, Q-05), update the expected values.

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
| PM-4 | Pipe rate dated 8 days ago | Amber "stale" badge (the pipe threshold is 7 days) |

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

### 2.13 Dashboard, Meeting Notes, Mobile
| # | Test | Expected |
|---|---|---|
| DB-1 | Each tile's count matches its filtered list | Equal |
| DB-2 | Amounts | ₹1,23,456.00 format |
| MN-1 | Create a meeting note with an action item linked to a customer | Visible on the customer page; the team can edit it |
| MB-1 | Engineer flows on 360 px Android Chrome | No horizontal page scroll; camera upload works; buttons at least 44 px |
| PF-1 | Excel export of a 150-line quotation | Under 5 s |

## 3. UAT sign-off

| Module | Client tester | Result | Date | Signature |
|---|---|---|---|---|
| (one row for each section above) | | | | |

Sign-off by Karthick and Jagan sir (D-09).
