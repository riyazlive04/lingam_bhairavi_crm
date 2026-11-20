# Automation Agents: Catalogue

The CRM includes eleven **rule-based automation agents**. Each one is a small, predictable program. It reads the CRM database, applies fixed rules with adjustable thresholds, and creates **alerts** (in the app and on the dashboard). Some agents also send **emails**. Together they take over the "remembering and chasing" that the team does today from memory, WhatsApp and Excel.

They respond to the pain points raised in the kickoff meeting ([notes](meetings/2026-11-20-kickoff-meeting.md)): no follow-up tracker (PP-4), forgotten undelivered lines (PP-3), refill due dates (PP-7), daily changes in pipe prices (PP-6), chasing outstanding payments (PP-9) and, most important of all, staff not entering data (PP-10).

## 1. How the agents run

| Aspect | Design |
|---|---|
| Schedule | One **Vercel Cron** job calls the agents endpoint **every day at 08:00 IST** (02:30 UTC), before office hours. The endpoint is protected by `CRON_SECRET`. |
| Manual run | Admin → *Automation Agents* → **Run now** (one agent or all). Handy after a lot of data entry, or during a demo. |
| Safe to repeat | Running again on the same day does not duplicate alerts. Each alert has a key (agent + record + rule), and an open alert with the same key is updated rather than created again. |
| Alert lifecycle | `Open` → `Acknowledged` → `Resolved`. An agent closes an alert by itself once the condition behind it is gone (for example, the line has been delivered). |
| Output | An in-app alert (bell and dashboard panel, filtered by role), an optional internal email digest, and **customer emails from the Receivables Dunning Agent only**. |
| Configuration | Admin → *Settings → Agents*: enable or disable, thresholds and recipients. The defaults are listed below. |
| Log | Each run records its start and end time, records scanned, alerts created and resolved, emails sent and any errors. |

## 2. Why no AI credits are needed

Every decision these agents make is a **comparison of dates, quantities or amounts that are already in the database**. For example: is the next follow-up date before today? Is the delivered qty less than the ordered qty? Is spend above 80 % of budget? Rules like these are:

- **Free to run.** Plain SQL and TypeScript on the existing server, with no per-call API charges. This suits the client's request for a budget-friendly system (11-20 [27:55 to 28:20]).
- **Predictable and easy to explain.** Every alert states the exact rule and numbers, so staff trust it and act on it.
- **Testable.** Each rule has fixed test cases (see [guides/tester.md](guides/tester.md)).
- **Private.** No customer, price or margin data leaves the system for a third-party AI provider.

AI could be added later for jobs that rules can't do (reading a consultant's BOQ PDF, for instance), but none of the current requirements need it.

## 3. Agent catalogue

All thresholds are **defaults** and can be changed. The live values and their exact names are shown, and can be edited by the admin, on the **Automation Agents** screen; where a name below differs from that screen, the screen is correct. "Owner role" is the role that receives the alert and must act on it. Admin always sees everything.

### 3.1 Follow-up Agent
| | |
|---|---|
| Purpose | Make sure no quotation is forgotten after it is sent (REQ-012, PP-4) |
| Trigger | Daily cron, or Run now |
| Rule logic | For each quotation with status `Sent` or `Follow-up`: (a) `next_follow_up_date` ≤ today → alert "Follow-up due"; (b) no follow-up logged for **7** days → alert "No follow-up for 7 days"; (c) no next follow-up date set → alert "Set next follow-up" |
| Thresholds | `followup.silent_days = 7` |
| Output | In-app alert to the quotation owner, and a daily internal digest email listing today's follow-ups |
| Owner role | sales |
| Example | `LBE/Q/2026-27/0012`, Hydrant & Sprinkler, ₹18,40,000, sent 02-12-2026, last follow-up 05-12-2026 → alert on 12-12-2026 |

### 3.2 Pending Delivery Agent
| | |
|---|---|
| Purpose | Make sure every customer PO line gets delivered (REQ-014 to REQ-016, PP-3) |
| Trigger | Daily cron, or Run now. The **login pop-up** reads the same open alerts |
| Rule logic | For each sales-order line where delivered qty < ordered qty: (a) expected date < today → "Overdue delivery" (critical if more than **7** days); (b) status `In transit` and expected date is today or tomorrow → "Arriving: confirm delivery"; (c) order is at least 90 % delivered but not 100 % for **3** days → "Last items pending" (the classic case of 9 out of 10 lines) |
| Thresholds | `delivery.overdue_critical_days = 7`, `delivery.tail_pending_days = 3` |
| Output | In-app alert and login pop-up for store, sales and admin |
| Owner role | store (dispatch), sales (talking to the customer) |

### 3.3 Refill Due Agent
| | |
|---|---|
| Purpose | Reach customers in good time for extinguisher refills (REQ-017, PP-7) |
| Rule logic | For each extinguisher record: `next_due = last_service_date + interval (12 or 36 months)`. If today ≥ next_due − **10** days → "Refill due on <date>". If today > next_due → "Refill overdue" |
| Thresholds | `refill.reminder_days_before = 10` (from the meeting, 11-20 [20:00]) |
| Output | A "Refills due" list on the dashboard and an in-app alert. **No customer notification** (decision D-04) |
| Owner role | sales |
| Example | A customer site with 12 × ABC 6 kg (Safex), last refilled 15-12-2025, interval 1 year → appears from 05-12-2026 |

### 3.4 Receivables Dunning Agent
| | |
|---|---|
| Purpose | Collect outstanding payments without chasing by hand (REQ-021/022, PP-9) |
| Rule logic | For each unpaid or part-paid sales invoice, the due date = invoice date + customer credit days. Send a reminder email on the due date, then every **7** days while it stays overdue, up to **4** reminders. Skip it if the customer has no email, reminders are turned off, or a payment was recorded in the last **3** days. Alert accounts when the reminder count reaches the maximum, because it now needs a phone call. |
| Thresholds | `dunning.interval_days = 7`, `dunning.max_reminders = 4`, `dunning.grace_after_payment_days = 3`, `dunning.default_credit_days = 30` |
| Output | **Email to the customer** from the client's Office 365 mailbox (SMTP `smtp.office365.com:587`), with accounts in CC. The email lists invoice no., date, amount, amount received, balance and total outstanding (a statement or ledger summary). Each email is logged in the app. |
| Owner role | accounts |

### 3.5 Payables Due Agent
| | |
|---|---|
| Purpose | Pay vendors on time and plan cash (REQ-021) |
| Rule logic | For each unpaid purchase invoice, the due date = invoice date + vendor payment terms. Alert when it falls due within **5** days, and again when it is overdue |
| Thresholds | `payables.days_before = 5` |
| Output | In-app alert, plus a weekly internal summary (on Monday) of payables due that week |
| Owner role | accounts (admin approves the payment) |

### 3.6 Stale Price Agent
| | |
|---|---|
| Purpose | Quote from current prices, and call suppliers only for the items that really need it (REQ-033, PP-1, PP-6) |
| Rule logic | For each active item used in a template or an open quotation: age = today − date of the latest purchase rate. Alert if the age is more than **7** days for the *Pipe* category (GI/MS pipes) or more than **90** days for other items. Alert "No price" if the item has no rate at all (many lines in the current fire-alarm and extinguisher price lists are blank) |
| Thresholds | `volatileDays = 7` (pipes and cables), `normalDays = 90` (all other items) |
| Output | An in-app list for purchase, and a badge on quotation lines that use a stale price |
| Owner role | purchase |

### 3.7 Margin Guard Agent
| | |
|---|---|
| Purpose | Protect the 40 to 50 % gap between buying and selling prices (REQ-010/034) |
| Rule logic | For each quotation in `Draft` or `Sent`: line margin = (supply rate − latest purchase rate) ÷ supply rate. Alert if any line is below **15 %** margin, if the supply rate is below the purchase rate (selling below cost), or if the overall quote margin is below **25 %**. It also checks sales invoices against the latest purchase rate. |
| Thresholds | `margin.min_line_pct = 15`, `margin.min_quote_pct = 25` |
| Output | In-app alert to admin, and the quotation shows "needs approval" |
| Owner role | admin (approves) and sales (fixes) |

### 3.8 Data Hygiene Agent (accountability)
| | |
|---|---|
| Purpose | Show each person their missing entries. Missing entries are why the previous CRM failed (REQ-025, PP-10) |
| Rule logic | Checks: (1) a quotation `Sent` with no follow-up logged within **3** days; (2) a quotation `Won` with no sales order after **3** days; (3) a sales order fully delivered but not invoiced after **3** days; (4) an expense `Submitted` but not approved after **5** days; (5) a project with no cost entries after **14** days active; (6) a customer without email or GSTIN on an invoice; (7) a purchase invoice without a project or store tag; (8) an item without a UOM or price |
| Thresholds | As listed, and all can be changed |
| Output | A "My pending entries" list for each user, and an admin dashboard tile "Pending entries by person" |
| Owner role | The user who created or owns the record, with a summary to admin |

### 3.9 Low Stock Agent (Phase 2: distributorship)
| | |
|---|---|
| Purpose | Avoid running out once stock is held (REQ-039) |
| Rule logic | For each stocked item with a reorder level: available = on hand − allocated. Alert when available ≤ reorder level. Critical when available < allocated demand |
| Thresholds | `stock.reorder_level` per item (default 0, which means off) |
| Output | In-app alert |
| Owner role | store, purchase |

### 3.10 Quote Expiry Agent
| | |
|---|---|
| Purpose | Revalidate or revise quotes before they lapse (REQ-035) |
| Rule logic | Quotations in `Sent` or `Follow-up` whose validity date is within **5** days → "Expiring". Once past validity, the status is set to `Expired` and an alert is raised |
| Thresholds | `quote.default_validity_days = 30`, `quote.expiry_warning_days = 5` |
| Output | In-app alert |
| Owner role | sales |

### 3.11 Project Budget Agent
| | |
|---|---|
| Purpose | Spot cost overruns early (REQ-018/019/038, PP-8) |
| Rule logic | For each active project: spend % = spend ÷ budget. Warning at **80 %** or more, critical at **100 %** or more. It also alerts if the margin (contract value − spend) turns negative |
| Thresholds | `project.budget_warn_pct = 80`, `project.budget_critical_pct = 100` |
| Output | In-app alert, and the project tile on the dashboard turns amber or red |
| Owner role | admin and the assigned site engineer |

## 4. Estimated staff hours saved per month

**Assumptions** (Sirah Digital estimates, *not client data*, to be replaced with real volumes after go-live): 30 quotations a month with about 40 open at any time; 10 customer POs a month averaging 15 lines; 25 purchase invoices a month; 40 unpaid sales invoices at any time; 200 extinguisher refill records; 6 to 8 active projects; about 400 items in the master.

| Agent | Manual task it replaces | Calculation (assumption) | Hours / month |
|---|---|---|---|
| Follow-up | Going through quotes and notes to see who to call | 40 open quotes × 5 min review per week × 4 weeks ÷ 60 ≈ 13 h; the agent cuts this by about 75 % | **10** |
| Pending Delivery | Matching POs against dispatches | 10 POs × 15 lines × 2 checks × 1 min ÷ 60 ≈ 5 h, plus repeat delivery trips avoided | **5** |
| Refill Due | Checking refill registers | 200 records reviewed monthly × 0.5 min ÷ 60 ≈ 2 h | **2** |
| Receivables Dunning | Writing reminder emails and statements | 40 invoices × 2 reminders × 5 min ÷ 60 ≈ 7 h | **7** |
| Payables Due | Listing vendor dues | 25 invoices × 2 min ÷ 60 + weekly planning 30 min × 4 | **3** |
| Stale Price | Calling suppliers for every item on every quote (PP-1) | 30 quotes × 30 min price checking ≈ 15 h; the agent narrows calls to stale items, saving about 50 % | **7** |
| Margin Guard | The owner reviewing quote margins | 30 quotes × 6 min ÷ 60 | **3** |
| Data Hygiene | The owner chasing staff for missing entries | About 15 min a day × 22 days | **5** |
| Low Stock | Manual stock checks (Phase 2) | 2 h a month (only after distributorship starts) | **0 now / 2 later** |
| Quote Expiry | Tracking validity dates | 40 quotes × 1.5 min ÷ 60 | **1** |
| Project Budget | Preparing project cost sheets | 7 projects × 30 min | **3.5** |
| **Total** | | | **≈ 46 hours a month** (about 6 working days) |

The bigger benefit is not the hours but the **losses avoided**: forgotten follow-ups (lost orders), undelivered lines that hold up invoices and payments, quotes priced on old pipe rates and missed refill revenue. We have not put a number on these here.

## 5. Adding or changing an agent

1. Write the rule in this file (trigger, logic, thresholds, output and owner).
2. Add the REQ in [REQUIREMENTS.md](REQUIREMENTS.md), with a change-log row.
3. Build it as a pure function `(db, settings, today) → alerts[]`, so it can be unit-tested with fixed dates (see [guides/backend-developer.md](guides/backend-developer.md)).
4. Add test cases to [guides/tester.md](guides/tester.md).

---

Prepared by Sirah Digital · https://sirahdigital.in/
