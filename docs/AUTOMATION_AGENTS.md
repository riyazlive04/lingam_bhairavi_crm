# Automation Agents: Catalogue

**Prepared by:** Sirah Digital (https://sirahdigital.in/) · **Version:** 2.0 (2026-11-26) · **Code:** `app/src/lib/agents/` (registry in `registry.ts`)

The CRM includes twelve **rule-based automation agents**. Each one is a small, predictable program. It reads the CRM database, applies fixed rules with adjustable thresholds, and creates **alerts** (in the app, on the Home screen and in the login pop-up). One agent, Receivables, also sends **emails** to customers. Together they take over the "remembering and chasing" that the team does today from memory, WhatsApp and Excel.

They respond to the pain points raised in the kickoff meeting ([notes](meetings/2026-11-20-kickoff-meeting.md)): no follow-up tracker (PP-4), forgotten undelivered lines (PP-3), refill due dates (PP-7), daily changes in pipe prices (PP-6), chasing outstanding payments (PP-9) and, most important of all, staff not entering data (PP-10). Version 2 adds the **AMC & Service Agent** (preventive visits, renewals and service call deadlines) and an **approvals check** inside the Data Hygiene agent, so quotations waiting for the owner's approval are not forgotten.

## 1. How the agents run

| Aspect | Design |
|---|---|
| Schedule | One **Vercel Cron** job calls `/api/cron/agents` **every day at 08:00 IST** (02:30 UTC, `vercel.json`), before office hours. The endpoint is protected by `CRON_SECRET`. |
| At login | If the last run is more than **6 hours** old, all agents run again when someone signs in, so the login pop-up is fresh. |
| Manual run | Admin → *Automation → Automation agents* → **Run all agents now**, or **Run now** on one agent. Handy after a lot of data entry, or during a demo. |
| Order | Quote Validity runs first, so follow-up alerts for quotes that have just expired are cleared in the same run. Then Pending Delivery, Follow-up, Refill & HPT, AMC & Service, Receivables, Payables, Stale Price, Margin Guard, Low Stock, Project Budget and Data Hygiene. |
| Safe to repeat | Running again on the same day does not duplicate alerts or emails. Each alert has a key (agent + record + rule), and an open alert with the same key is updated rather than created again. |
| Alert lifecycle | `Open` → `Snoozed` or `Done`. An agent closes an alert by itself once the condition behind it is gone (for example, the line has been delivered or the quote has been approved). |
| Output | An in-app alert (bell, Home screen and *Automation → Alerts*, filtered by role) and **customer emails from the Receivables agent only**. |
| Configuration | Admin → *Automation agents*: enable or disable each agent and change its thresholds. The defaults are listed below. |
| Log | Each run records its start and end time, alerts created and resolved, emails queued, actions taken (for example quotes or contracts marked expired), errors and the estimated minutes saved. |

## 2. Why no AI credits are needed

Every decision these agents make is a **comparison of dates, quantities or amounts that are already in the database**. For example: is the next follow-up date before today? Is the delivered qty less than the ordered qty? Is spend above 80 % of budget? Rules like these are:

- **Free to run.** Plain SQL and TypeScript on the existing server, with no per-call API charges. This suits the client's request for a budget-friendly system (11-20 [27:55 to 28:20]).
- **Predictable and easy to explain.** Every alert states the exact rule and numbers, so staff trust it and act on it.
- **Testable.** Each rule has fixed test cases (see [guides/tester.md](guides/tester.md) and `app/tests/unit/agents-rules.test.ts`).
- **Private.** No customer, price or margin data leaves the system for a third-party provider.

Even the consultant BOQ import in version 2 matches items with fixed text rules (sizes, makes, keywords), not with a paid service.

## 3. Agent catalogue

All thresholds are **defaults** and can be changed. The live values are shown, and can be edited by the admin, on the **Automation agents** screen; the names in brackets are the parameter names in the code. "Owner role" is the role that receives the alert and must act on it. Admin always sees everything.

### 3.1 Follow-up Agent (`followup`)
| | |
|---|---|
| Purpose | Make sure no quotation is forgotten after it is sent (REQ-012, PP-4) |
| Rule logic | For each quotation that is `Sent` or `Negotiation`: (a) the next follow-up date has passed by the grace days → "Follow up <quote>" (critical once it is more than 7 days late); (b) the quote was sent but no follow-up has been logged after **3** days → "No follow-up on <quote>" (critical after 9 days) |
| Thresholds | Overdue by (`overdueDays`) = **0** days, so it alerts on the due date itself; no follow-up after (`noFollowUpDays`) = **3** days |
| Owner role | sales (the person who prepared the quote) |

### 3.2 Pending Delivery Agent (`pending_delivery`)
| | |
|---|---|
| Purpose | Make sure every customer PO line gets delivered (REQ-014 to REQ-016, PP-3) |
| Rule logic | One alert per undelivered sales-order line. Pending qty counts returns, so a line that comes back from a customer is pending again. (a) Expected date passed → overdue (critical once past the grace days); (b) no expected date and the order is more than 3 days old → warning "no delivery date"; (c) expected within the next **3** days → heads-up. Clears itself when the delivery is recorded |
| Thresholds | Grace (`graceDays`) = **0** days; upcoming window (`upcomingDays`) = **3** days |
| Output | In-app alert and the **login pop-up** |
| Owner role | store |

### 3.3 Refill & HPT Reminder Agent (`refill_due`)
| | |
|---|---|
| Purpose | Reach customers in good time for extinguisher refills and hydraulic pressure tests (REQ-017, PP-7) |
| Rule logic | For every active extinguisher, groups the units due for refill (or HPT) by customer and due date, so sales can call once. Alert from **10** days before the due date; warning within 3 days; critical once overdue |
| Thresholds | Lead (`leadDays`) = **10** days (from the meeting, 11-20 [20:00]) |
| Output | In-app alert only. **No customer notification** (decision D-04) |
| Owner role | sales |

### 3.4 AMC & Service Agent (`amc_service`), new in version 2
| | |
|---|---|
| Purpose | Keep annual maintenance contracts on schedule, renew them on time and answer breakdown calls within the promised time (REQ-050, REQ-051) |
| Rule logic | (a) **Visits:** each scheduled preventive visit on an active contract that is due within **7** days or overdue → reminder to the assigned engineer (or to sales if no engineer is set); warning from 1 day before, critical when more than 7 days late. Rescheduling raises a fresh reminder and clears the old one. (b) **Renewals:** an active or expired contract ending within **30** days, with no renewal yet → "send a renewal quotation"; warning in the last 7 days, critical once lapsed; it stops 90 days after the lapse. (c) **Service calls:** any call not resolved or closed after its response deadline (`dueBy`) → critical "SLA breached". (d) **Housekeeping:** active contracts past their end date are marked `expired` |
| Thresholds | Visits due within (`visitLeadDays`) = **7** days; renewal reminders start (`renewalLeadDays`) = **30** days before the end date. The response deadline itself comes from each contract (`responseHours`, default 24 h, or 48 h for a call without a contract) |
| Owner role | engineer (visits and assigned calls), sales (renewals, unassigned work) |

### 3.5 Receivables & Dunning Agent (`receivables`)
| | |
|---|---|
| Purpose | Collect outstanding payments without chasing by hand (REQ-021/022, PP-9) |
| Rule logic | Sends each customer **one combined statement** of their overdue invoices: the first email when an invoice is **1** day overdue, then every **7** days while it stays overdue, up to **3** reminders. Only customers with auto-reminders switched on and an email address are emailed. Escalates to accounts when an invoice is more than **60** days overdue (critical) or the reminders have run out (warning), because it now needs a phone call |
| Thresholds | First reminder (`firstReminderDaysOverdue`) = **1** day; repeat (`repeatEveryDays`) = **7** days; maximum (`maxReminders`) = **3** |
| Output | **Email to the customer** through the outbox. It is sent from the client's Office 365 mailbox once `SMTP_*` is set; until then it is only logged in *Money → Email outbox* |
| Owner role | accounts |

### 3.6 Payables Agent (`payables`)
| | |
|---|---|
| Purpose | Pay vendors on time and plan cash (REQ-021) |
| Rule logic | For each posted, unpaid vendor bill, the due date = the bill's due date, or the invoice date + the vendor's credit terms. Alert when it falls due within **7** days; warning once overdue, critical when more than 30 days overdue |
| Thresholds | Lead (`leadDays`) = **7** days |
| Owner role | accounts |

### 3.7 Stale Price Agent (`stale_price`)
| | |
|---|---|
| Purpose | Quote from current prices, and call suppliers only for the items that really need it (REQ-033, PP-1, PP-6) |
| Rule logic | Finds items whose latest purchase price is too old to quote safely: volatile items (pipes, cable and similar) after **7** days, other items used in open quotes or BOQ templates after **90** days. One alert per item group, listing the sizes to confirm with vendors. The same windows drive the amber **stale** mark on every quotation line (REQ-046) |
| Thresholds | Volatile (`volatileDays`) = **7** days; other items (`normalDays`) = **90** days |
| Owner role | purchase |

### 3.8 Margin Guard (`margin_guard`)
| | |
|---|---|
| Purpose | Protect the 40 to 50 % gap between buying and selling prices (REQ-010/034) |
| Rule logic | For each quotation in `Draft`, `Sent` or `Negotiation`: alert if the quote margin (before GST) is below **15 %**, or if any line is priced below its cost. Critical when the margin is negative or a line is below cost. With the approval setting on its default (*below minimum margin*), the same quotes also need the owner's approval before they can be sent (REQ-045) |
| Thresholds | Minimum margin (`minMarginPct`) = **15 %** |
| Owner role | admin |

### 3.9 Low Stock Agent (`low_stock`)
| | |
|---|---|
| Purpose | Avoid running out once stock is held (REQ-039) |
| Rule logic | For each item with a re-order level: available = on hand (from stock movements) − reserved allocations. Warning when available is at or below the re-order level, critical when nothing is available |
| Thresholds | The re-order level on each item (blank means the item is not checked) |
| Owner role | purchase |

### 3.10 Quote Validity Agent (`quote_expiry`)
| | |
|---|---|
| Purpose | Revalidate or revise quotes before they lapse (REQ-035) |
| Rule logic | Quotations in `Sent` or `Negotiation` whose validity ends within **3** days → "validity ends <date>". Once past validity, the status is set to `Expired` automatically and an alert "Revise and resend?" stays for 30 days |
| Thresholds | Warn (`warnDays`) = **3** days. The default validity of a new quote (30 days) is a pricing setting |
| Owner role | sales |

### 3.11 Project Budget Watch (`project_budget`)
| | |
|---|---|
| Purpose | Spot cost overruns early (REQ-018/019/038, PP-8) |
| Rule logic | For each active project with a budget: actual cost = materials issued − site returns − restocked customer returns + approved expenses (CONVENTIONS rules 5 and 13). Warning at **80 %** of budget, critical at **100 %**. The message also shows the margin on the contract and flags a project in loss |
| Thresholds | Warn (`warnPct`) = **80 %**; critical (`criticalPct`) = **100 %** |
| Owner role | admin |

### 3.12 Accountability Agent, Data Hygiene (`data_hygiene`)
| | |
|---|---|
| Purpose | Show each person their missing entries. Missing entries are why the previous CRM failed (REQ-025, PP-10) |
| Rule logic | (1) a sent quote that has gone quiet: no next follow-up date and no contact for **7** days; (2) a won quote with no order or project after **3** days; (3) **new in version 2, the approvals check:** a quotation waiting for the owner's approval for more than **1** day (critical after 3 days), assigned to admin; it clears as soon as the quote is approved or rejected; (4) an order fully delivered but not fully invoiced after **2** days; (5) expense vouchers waiting for approval for more than **3** days (one grouped alert); (6) a purchase bill left in draft for more than 3 days; (7) an active project with no material or expense entry for 14 days; (8) a customer with unpaid invoices but no email, so reminders cannot be sent |
| Thresholds | Quiet quote (`quoteNoFollowUpDays`) = **7**; won without order (`wonNoOrderDays`) = **3**; delivered not invoiced (`deliveredNotInvoicedDays`) = **2**; expenses pending (`expensePendingDays`) = **3** days. The approval (1 day), draft bill (3 days) and idle project (14 days) limits are fixed in code |
| Owner role | The role that has to act: sales, admin, accounts, purchase or engineer |

## 4. Estimated staff hours saved per month

**Assumptions** (Sirah Digital estimates, *not client data*, to be replaced with real volumes after go-live): 30 quotations a month with about 40 open at any time; 10 customer POs a month averaging 15 lines; 25 purchase invoices a month; 40 unpaid sales invoices at any time; 200 extinguisher refill records; 6 to 8 active projects; about 500 items in the master; **15 active AMC contracts with 4 visits a year each (about 5 visits a month), 6 service calls a month and 1 or 2 renewals a month; 8 quotations a month needing the owner's approval.** Minutes per task are our estimates of the manual effort today.

| Agent | Manual task it replaces | Calculation (assumption) | Hours / month |
|---|---|---|---|
| Follow-up | Going through quotes and notes to see who to call | 40 open quotes × 5 min review a week × 4 weeks ÷ 60 ≈ 13 h; the agent cuts this by about 75 % | **10** |
| Pending Delivery | Matching POs against dispatches | 10 POs × 15 lines × 2 checks × 1 min ÷ 60 ≈ 5 h, plus repeat delivery trips avoided | **5** |
| Refill & HPT | Checking refill registers | 200 records reviewed monthly × 0.5 min ÷ 60 ≈ 2 h | **2** |
| AMC & Service | Keeping a visit calendar, chasing renewals and checking open breakdown calls | 5 visits × 10 min + 6 calls × 10 min + 2 renewals × 15 min ≈ 2.3 h | **2.5** |
| Receivables | Writing reminder emails and statements | 40 invoices × 2 reminders × 5 min ÷ 60 ≈ 7 h | **7** |
| Payables | Listing vendor dues | 25 bills × 2 min ÷ 60 + weekly planning 30 min × 4 | **3** |
| Stale Price | Calling suppliers for every item on every quote (PP-1) | 30 quotes × 30 min price checking ≈ 15 h; the agent narrows calls to stale items, saving about 50 % | **7** |
| Margin Guard | The owner reviewing quote margins | 30 quotes × 6 min ÷ 60 | **3** |
| Low Stock | Manual stock checks (Phase 2) | 2 h a month (only after distributorship starts) | **0 now / 2 later** |
| Quote Validity | Tracking validity dates | 40 quotes × 1.5 min ÷ 60 | **1** |
| Project Budget | Preparing project cost sheets | 7 projects × 30 min | **3.5** |
| Data Hygiene (incl. approvals check) | The owner chasing staff for missing entries, and sales chasing the owner for approvals | About 15 min a day × 22 days ≈ 5.5 h, plus 8 approvals × 5 min ≈ 0.7 h | **6** |
| **Total** | | | **≈ 50 hours a month** (about 6 working days) |

The in-app "hours saved" figure on Home and on the agents screen is calculated differently: each agent counts a few minutes for every **new** alert, email or action it produces (for example 10 minutes per AMC alert and 2 minutes per contract marked expired). It grows with real use and will not match this table exactly.

The bigger benefit is not the hours but the **losses avoided**: forgotten follow-ups (lost orders), undelivered lines that hold up invoices and payments, quotes priced on old pipe rates, missed refill and AMC renewal revenue and breakdown calls answered late. We have not put a number on these here.

## 5. Adding or changing an agent

1. Write the rule in this file (trigger, logic, thresholds, output and owner).
2. Add the REQ in [REQUIREMENTS.md](REQUIREMENTS.md), with a change-log row.
3. Build it with `defineAgent()` in `app/src/lib/agents/` and register it in `registry.ts` (mind the run order). Keep the rule a plain function of the database and `today`, so it can be unit-tested with fixed dates (see [guides/backend-developer.md](guides/backend-developer.md)).
4. Add test cases to [guides/tester.md](guides/tester.md).

## 6. Change log

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-11-21 | Eleven agents catalogued |
| 2.0 | 2026-11-26 | Added the AMC & Service Agent and the approvals check in Data Hygiene. Every threshold checked against the code and corrected where the first draft differed (Follow-up, Pending Delivery, Receivables, Payables, Quote Validity, Margin Guard, Data Hygiene). Hours-saved table updated with stated assumptions |

---

Prepared by Sirah Digital · https://sirahdigital.in/
