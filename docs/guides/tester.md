# Tester Guide — Test Strategy and UAT Checklist

## 1. Strategy

| Level | What | Who | When |
|---|---|---|---|
| Unit | Business rules: price resolution, markup, GST split, FY numbering, line status, each agent with fixed "today" | Developers | Every PR |
| Integration | Server actions with DB (PGlite in CI): purchase invoice save, BOQ → quote, SO → delivery → invoice | Developers / tester | Every PR |
| System / E2E | Cross-module flows on Vercel preview, all six roles | Tester | Per milestone |
| Non-functional | Mobile (360 px Android Chrome), performance (150-line quote export), security checks (RBAC, auth) | Tester + Security | M4–M5 |
| UAT | Client staff on real data with the checklist below | Client + BC + tester | M5 |

**Test data** — seed from the client's files: Pipe GI 200 NB ₹3,750 … 25 NB ₹1,900; Pipe MS 200 NB ₹2,600 … 25 NB ₹1,300; Single Hydrant Valve ₹7,500; 2-way FBI valve ₹12,500; Pressure gauge ₹2,250; Pressure switch ₹3,500; Hose reel drum ₹7,500; Hose box double door ₹5,100; RRL Hose with SS ₹6,500; Foot valve ₹18,500; Branch pipe ₹2,750; Pendant sprinkler ₹550; Electrical panel ₹29,000; Jockey pump ₹1,20,000; Diesel engine ₹5,00,000; fire-alarm items by make (Ravel, Edwards, Honeywell…) without price; extinguishers ABC 6 kg / CO2 4.5 kg by Chakraa / Safex. Use 3 vendors, 4 customers (one outside Tamil Nadu for IGST), 2 projects.

**Defect severity**: Sev-1 wrong money/tax/price or data loss or security hole; Sev-2 feature blocked, no workaround; Sev-3 workaround exists; Sev-4 cosmetic. Go-live requires zero open Sev-1/Sev-2.

Default assumptions used in expected results: markup 40 %, minimum margin 15 %, GST 18 %, validity 30 days, stale 30 days (pipes 7). If the client changes them (Q-03, Q-05), update expected values.

## 2. UAT checklist per module

Mark each: Pass / Fail / Blocked, with tester initials and date.

### 2.1 Login & roles
| # | Test | Expected |
|---|---|---|
| L-1 | Log in as each of admin, sales, purchase, accounts, engineer, store | Each sees only their menus (see RBAC matrix in [security-engineer.md](security-engineer.md)) |
| L-2 | As sales, open a purchase-invoice URL directly | Access denied (server-side), not just hidden menu |
| L-3 | Wrong password 5 times | Login throttled; generic error message |
| L-4 | Log out, press browser Back | No data shown; redirected to login |

### 2.2 Item Master & Price Master
| # | Test | Expected |
|---|---|---|
| IM-1 | Import master price list | Pipe GI 200 NB = ₹3,750 dated 12-10-2026; items without prices listed as "No price" |
| IM-2 | Create duplicate "Pipe GI / 50 NB / same make" | Rejected with message |
| IM-3 | Search "pipe ms 80" | Finds Pipe MS 80 NB |
| PM-1 | Enter purchase invoice Pipe MS 80 NB ₹1,650 (Vendor B, today) | Item shows latest purchase rate ₹1,650, Vendor B, today; history keeps ₹1,600 (price list) |
| PM-2 | Enter older-dated invoice (last month) at ₹1,500 | Latest rate stays ₹1,650 (latest by invoice date) |
| PM-3 | Sales history | Shows last quoted/sold rates separately from purchase history |
| PM-4 | Pipe rate dated 8 days ago | Amber "stale" badge (pipe threshold 7 days) |

### 2.3 Vendors
| # | Test | Expected |
|---|---|---|
| VN-1 | After PM-1, open Vendor B | Lists Pipe MS 80 NB with last rate ₹1,650 automatically |
| VN-2 | Same item bought from Vendors A, B, C | Item page lists all three with last rates; cheapest highlighted |

### 2.4 Customers
| # | Test | Expected |
|---|---|---|
| CU-1 | GSTIN with 14 characters | Validation error |
| CU-2 | Customer page | Shows quotes, orders, invoices, outstanding, refill records |

### 2.5 BOQ Templates → Quotation
| # | Test | Expected |
|---|---|---|
| BQ-1 | Hydrant template, enter qty on 18 lines, zero elsewhere, Create quotation | Quotation has exactly 18 lines in template order; message "42 lines excluded" (if template has 60) |
| BQ-2 | BOQ Ref "1.2" and "A.11.3" | Stored and exported exactly as text, not "1.2000000000000002" |
| BQ-3 | All quantities zero | Quotation not created; message asks for at least one quantity |

### 2.6 Quotations & follow-up
| # | Test | Expected |
|---|---|---|
| QT-1 | Add Pipe MS 80 NB (latest ₹1,650) qty 120 m | Supply rate ₹2,310 (1,650 × 1.40); amount ₹2,77,200.00 |
| QT-2 | Erection rate from item master (e.g. ₹250/m set in master) | Erection amount 120 × 250 = ₹30,000.00 |
| QT-3 | GST 18 % for Tamil Nadu customer on taxable ₹3,07,200 | CGST ₹27,648.00 + SGST ₹27,648.00; total ₹3,62,496.00 |
| QT-4 | Same for Karnataka customer | IGST ₹55,296.00 |
| QT-5 | Override supply rate to ₹1,800 (margin 8.3 %) | Red margin warning; cannot mark Sent without admin approval |
| QT-6 | First quote on/after 01-04-2027 | Number LBE/Q/2027-28/0001 |
| QT-7 | Excel export | Columns BOQ Ref, Description, Quantity, UOM, SUPPLY Rate/Amount, ERECTION Rate/Amount, Remarks; totals correct; opens in Excel without repair |
| QT-8 | Print / PDF | A4, company header, quote no., validity, ₹ Indian format |
| QT-9 | Mark Sent without next follow-up date | Blocked with message |
| QT-10 | Mark Won | Requires PO no./date; sales order created with same lines |
| QT-11 | Mark Lost | Requires reason |
| QT-12 | Revise quote | New number suffix -R1; original kept read-only |

### 2.7 Sales Orders & Deliveries
| # | Test | Expected |
|---|---|---|
| SO-1 | SO with 10 lines; deliver 9 fully | SO status Partial; line 10 Pending |
| SO-2 | Log in as store next day | Pop-up lists line 10 with customer, PO no., pending qty, expected date |
| SO-3 | Mark line 10 In transit, expected tomorrow | Status In transit; agent alert "Arriving" the next run |
| SO-4 | Deliver more than pending qty | Rejected |
| SO-5 | Deliver line 10 | SO Delivered; appears in "Ready to invoice"; pop-up no longer shows it |

### 2.8 Purchase Invoices
| # | Test | Expected |
|---|---|---|
| PI-1 | Same vendor + invoice no. twice | Second rejected |
| PI-2 | Invoice with new item created inline | Item exists in master with size/make/UOM |
| PI-3 | Invoice tagged to Project X | Project X spend increases by taxable value (confirm whether GST included — assumption: excluded) |
| PI-4 | Vendor terms 30 days | Payable due = invoice date + 30 |

### 2.9 Projects & Expenses
| # | Test | Expected |
|---|---|---|
| PR-1 | Contract ₹10,00,000, budget ₹7,00,000; tagged purchases ₹4,00,000 | Spend ₹4,00,000; margin ₹6,00,000 |
| EX-1 | Engineer on phone logs petrol ₹2,000 with photo, split 50/50 Projects X & Y | Two shares of ₹1,000; status Submitted; not yet in project cost |
| EX-2 | Accounts approves | Each project spend +₹1,000 |
| EX-3 | Split 60 % + 30 % | Rejected (must total 100 %) |
| PR-2 | Push spend to ₹5,60,000 (80 % of budget) | Project Budget Agent warning |

### 2.10 Sales Invoices, Payments, Outstanding
| # | Test | Expected |
|---|---|---|
| SI-1 | Invoice delivered SO | Number LBE/INV/2026-27/xxxx; amounts from delivered qty |
| SI-2 | Part payment ₹1,00,000 against ₹3,62,496 | Outstanding ₹2,62,496.00 |
| OS-1 | Ageing | Invoice 45 days old in 31–60 bucket |
| OS-2 | Vendor outstanding | Shows unpaid purchase invoices with due dates |

### 2.11 Refill Tracker
| # | Test | Expected |
|---|---|---|
| RF-1 | 12 × ABC 6 kg Safex, last refill 01-12-2025, 1 yr | Next due 01-12-2026; appears in Refills due from 21-11-2026, not on 20-11-2026 |
| RF-2 | 3-year interval record | Next due = last + 36 months |
| RF-3 | Mark refilled 03-12-2026 | Next due 03-12-2027; removed from due list |
| RF-4 | Check e-mail log | No customer e-mail sent for refills |

### 2.12 Automation Agents (run with fixed dates via "Run now")
| # | Agent | Test | Expected |
|---|---|---|---|
| AG-1 | Follow-up | Quote Sent, next follow-up yesterday | Alert to quote owner |
| AG-2 | Follow-up | Run twice same day | One alert, not two |
| AG-3 | Pending Delivery | Line expected 8 days ago | Critical overdue alert |
| AG-4 | Refill Due | RF-1 data on 21-11-2026 | Alert created |
| AG-5 | Receivables Dunning | Invoice due today, customer has e-mail | One e-mail sent, logged; none if reminders disabled or no e-mail |
| AG-6 | Receivables Dunning | 5th week overdue | No 5th e-mail; accounts alerted to call |
| AG-7 | Payables Due | Vendor invoice due in 4 days | Alert |
| AG-8 | Stale Price | Pipe rate 8 days old; valve rate 20 days old | Pipe flagged; valve not flagged |
| AG-9 | Margin Guard | Line selling below cost | Alert to admin |
| AG-10 | Data Hygiene | Won quote, no SO after 3 days; delivered SO not invoiced after 3 days | Both listed under responsible user |
| AG-11 | Quote Expiry | Validity ends in 4 days | "Expiring" alert; after validity → status Expired |
| AG-12 | Project Budget | Spend 100 % of budget | Critical alert |
| AG-13 | Auto-resolve | Fix condition (deliver line), run again | Alert resolved |
| AG-14 | Cron security | Call agents endpoint without CRON_SECRET | 401, nothing runs |

### 2.13 Dashboard, Meeting Notes, Mobile
| # | Test | Expected |
|---|---|---|
| DB-1 | Each tile count matches its filtered list | Equal |
| DB-2 | Amounts | ₹1,23,456.00 format |
| MN-1 | Create meeting note with action item linked to a customer | Visible on customer page; editable by team |
| MB-1 | Engineer flows on 360 px Android Chrome | No horizontal page scroll; camera upload works; buttons ≥ 44 px |
| PF-1 | 150-line quotation Excel export | < 5 s |

## 3. UAT sign-off

| Module | Client tester | Result | Date | Signature |
|---|---|---|---|---|
| (one row per section above) | | | | |

Sign-off by Karthick and Jagan sir (D-09).
