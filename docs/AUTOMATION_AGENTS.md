# Automation Agents — Catalogue

The CRM includes eleven **rule-based automation agents**. Each agent is a small, deterministic program that reads the CRM database, applies fixed rules with configurable thresholds, and creates **alerts** (in-app, on the dashboard) and, for some agents, **e-mails**. They do the "remembering and chasing" that the team currently does from memory, WhatsApp and Excel.

They answer the pain points of the kickoff meeting ([notes](meetings/2026-11-20-kickoff-meeting.md)): no follow-up tracker (PP-4), forgotten undelivered lines (PP-3), refill due dates (PP-7), daily pipe price changes (PP-6), outstanding chasing (PP-9) and — most importantly — staff not entering data (PP-10).

## 1. How the agents run

| Aspect | Design |
|---|---|
| Schedule | One **Vercel Cron** job calls the agents endpoint **daily at 08:00 IST** (02:30 UTC) before office hours. The endpoint is protected by `CRON_SECRET`. |
| Manual run | Admin → *Automation Agents* → **Run now** (per agent or all). Useful after bulk data entry or for demos. |
| Idempotent | Re-running on the same day does not duplicate alerts: each alert has a key (agent + record + rule), and an open alert with the same key is updated, not re-created. |
| Alert lifecycle | `Open` → `Acknowledged` → `Resolved`. Agents auto-resolve an alert when the underlying condition disappears (e.g. the line is delivered). |
| Output | In-app alert (bell + dashboard panel, filtered by role); internal e-mail digest (optional); **customer e-mail only from the Receivables Dunning Agent**. |
| Configuration | Admin → *Settings → Agents*: enable/disable, thresholds, recipients. Defaults below. |
| Log | Each run stores start/end time, records scanned, alerts created/resolved, e-mails sent, errors. |

## 2. Why no AI credits are needed

Every decision these agents make is a **comparison of dates, quantities or amounts that already exist in the database** — "is the next follow-up date before today?", "is delivered qty less than ordered qty?", "is spend above 80 % of budget?". Such rules are:

- **Free to run** — plain SQL/TypeScript on the existing server; no per-call API charges, which suits the client's request for a budget-friendly system (11-20 [27:55–28:20]).
- **Predictable and explainable** — every alert states the exact rule and numbers, so staff trust and act on it.
- **Testable** — each rule has fixed test cases (see [guides/tester.md](guides/tester.md)).
- **Private** — no customer, price or margin data leaves the system to a third-party AI provider.

AI could be added later for things rules cannot do (e.g. reading a consultant's BOQ PDF), but none of the current requirements need it.

## 3. Agent catalogue

Thresholds are **defaults** (configurable). Owner role = the role that receives and must act on the alert; admin always sees everything.

### 3.1 Follow-up Agent
| | |
|---|---|
| Purpose | No quotation is forgotten after it is sent (REQ-012, PP-4) |
| Trigger | Daily cron / Run now |
| Rule logic | For each quotation with status `Sent` or `Follow-up`: (a) `next_follow_up_date` ≤ today → alert "Follow-up due"; (b) no follow-up logged for **7** days → alert "No follow-up for 7 days"; (c) no next follow-up date set → alert "Set next follow-up" |
| Thresholds | `followup.silent_days = 7` |
| Output | In-app alert to the quotation owner; daily digest e-mail (internal) listing today's follow-ups |
| Owner role | sales |
| Example | `LBE/Q/2026-27/0012` — Hydrant & Sprinkler, ₹18,40,000, sent 02-12-2026, last follow-up 05-12-2026 → alert on 12-12-2026 |

### 3.2 Pending Delivery Agent
| | |
|---|---|
| Purpose | Every customer PO line gets delivered (REQ-014–016, PP-3) |
| Trigger | Daily cron / Run now; the **login pop-up** reads the same open alerts |
| Rule logic | For each sales-order line with delivered qty < ordered qty: (a) expected date < today → "Overdue delivery" (critical if > **7** days); (b) status `In transit` and expected date = today or tomorrow → "Arriving — confirm delivery"; (c) order ≥ 90 % delivered but not 100 % for **3** days → "Last items pending" (the classic 9-of-10-lines case) |
| Thresholds | `delivery.overdue_critical_days = 7`, `delivery.tail_pending_days = 3` |
| Output | In-app alert + login pop-up for store, sales, admin |
| Owner role | store (dispatch), sales (customer communication) |

### 3.3 Refill Due Agent
| | |
|---|---|
| Purpose | Approach customers in time for extinguisher refills (REQ-017, PP-7) |
| Rule logic | For each extinguisher record: `next_due = last_service_date + interval (12 or 36 months)`; if today ≥ next_due − **10** days → "Refill due on <date>"; if today > next_due → "Refill overdue" |
| Thresholds | `refill.reminder_days_before = 10` (from meeting, 11-20 [20:00]) |
| Output | Dashboard list "Refills due" + in-app alert. **No customer notification** (decision D-04) |
| Owner role | sales |
| Example | Customer site with 12 × ABC 6 kg (Safex), last refilled 15-12-2025, interval 1 yr → appears from 05-12-2026 |

### 3.4 Receivables Dunning Agent
| | |
|---|---|
| Purpose | Collect outstanding without manual chasing (REQ-021/022, PP-9) |
| Rule logic | For each unpaid/part-paid sales invoice: due date = invoice date + customer credit days. Send reminder e-mail on the due date, then every **7** days while overdue, max **4** reminders; skip if customer has no e-mail, reminders disabled, or a payment was recorded in the last **3** days. Alert accounts when a reminder count reaches the max (needs a phone call). |
| Thresholds | `dunning.interval_days = 7`, `dunning.max_reminders = 4`, `dunning.grace_after_payment_days = 3`, `dunning.default_credit_days = 30` |
| Output | **E-mail to customer** from the client's Office 365 mailbox (SMTP `smtp.office365.com:587`), CC accounts; body lists invoice no., date, amount, received, balance, total outstanding (statement/ledger summary). In-app log of each e-mail. |
| Owner role | accounts |

### 3.5 Payables Due Agent
| | |
|---|---|
| Purpose | Pay vendors on time and plan cash (REQ-021) |
| Rule logic | For each unpaid purchase invoice: due = invoice date + vendor payment terms; alert when due within **5** days, and when overdue |
| Thresholds | `payables.days_before = 5` |
| Output | In-app alert + weekly internal summary (Monday) of payables due this week |
| Owner role | accounts (admin approves payment) |

### 3.6 Stale Price Agent
| | |
|---|---|
| Purpose | Quote from current prices; target only items that really need a supplier call (REQ-033, PP-1, PP-6) |
| Rule logic | For each active item used in a template or open quotation: age = today − date of latest purchase rate. Alert if age > **7** days for category *Pipe* (GI/MS pipes) or > **30** days for others; alert "No price" if the item has no rate at all (many lines in the current fire-alarm and extinguisher price lists are blank) |
| Thresholds | `price.stale_days_default = 30`, `price.stale_days_pipe = 7` |
| Output | In-app list for purchase; badge on quotation lines using a stale price |
| Owner role | purchase |

### 3.7 Margin Guard Agent
| | |
|---|---|
| Purpose | Protect the 40–50 % buy/sell spread (REQ-010/034) |
| Rule logic | For each quotation in `Draft`/`Sent`: line margin = (supply rate − latest purchase rate) ÷ supply rate. Alert if any line < **15 %** margin, or supply rate < purchase rate (selling below cost), or overall quote margin < **25 %**. Also checks sales invoices vs latest purchase rate. |
| Thresholds | `margin.min_line_pct = 15`, `margin.min_quote_pct = 25` |
| Output | In-app alert to admin; quotation shows "needs approval" |
| Owner role | admin (approve) / sales (fix) |

### 3.8 Data Hygiene Agent (accountability)
| | |
|---|---|
| Purpose | Make missing entries visible per person — the reason the previous CRM failed (REQ-025, PP-10) |
| Rule logic | Checks: (1) quotation `Sent` with no follow-up logged within **3** days; (2) quotation `Won` with no sales order after **3** days; (3) sales order fully delivered but not invoiced after **3** days; (4) expense `Submitted` not approved after **5** days; (5) project with zero cost entries after **14** days active; (6) customer without e-mail/GSTIN on an invoice; (7) purchase invoice without project or store tag; (8) item without UOM or price |
| Thresholds | as listed, all configurable |
| Output | Per-user "My pending entries" list; admin dashboard tile "Pending entries by person" |
| Owner role | the user who created/owns the record; summary to admin |

### 3.9 Low Stock Agent (Phase 2 — distributorship)
| | |
|---|---|
| Purpose | Avoid stock-outs once stock is held (REQ-039) |
| Rule logic | For each stocked item with a reorder level: available = on hand − allocated; alert when available ≤ reorder level; critical when available < allocated demand |
| Thresholds | `stock.reorder_level` per item (default 0 = off) |
| Output | In-app alert |
| Owner role | store, purchase |

### 3.10 Quote Expiry Agent
| | |
|---|---|
| Purpose | Revalidate or revise quotes before they lapse (REQ-035) |
| Rule logic | Quotations `Sent`/`Follow-up` with validity date within **5** days → "Expiring"; past validity → status set to `Expired` and alert |
| Thresholds | `quote.default_validity_days = 30`, `quote.expiry_warning_days = 5` |
| Output | In-app alert |
| Owner role | sales |

### 3.11 Project Budget Agent
| | |
|---|---|
| Purpose | See cost overrun early (REQ-018/019/038, PP-8) |
| Rule logic | For each active project: spend % = spend ÷ budget. Warning at ≥ **80 %**, critical at ≥ **100 %**; also alert if margin (contract value − spend) turns negative |
| Thresholds | `project.budget_warn_pct = 80`, `project.budget_critical_pct = 100` |
| Output | In-app alert + dashboard project tile turns amber/red |
| Owner role | admin, assigned site engineer |

## 4. Estimated human hours saved per month

**Assumptions** (Sirah estimates — *not client data*; to be replaced with real volumes after go-live): 30 quotations/month with ~40 open at a time; 10 customer POs/month averaging 15 lines; 25 purchase invoices/month; 40 unpaid sales invoices at any time; 200 extinguisher refill records; 6–8 active projects; ~400 items in the master.

| Agent | Manual task it replaces | Calculation (assumption) | Hours / month |
|---|---|---|---|
| Follow-up | Scanning quotes/notes for who to call | 40 open quotes × 5 min review per week × 4 weeks ÷ 60 ≈ 13 h; agent cuts this by ~75 % | **10** |
| Pending Delivery | Reconciling POs against dispatches | 10 POs × 15 lines × 2 checks × 1 min ÷ 60 ≈ 5 h, plus re-delivery trips avoided | **5** |
| Refill Due | Checking refill registers | 200 records reviewed monthly × 0.5 min ÷ 60 ≈ 2 h | **2** |
| Receivables Dunning | Writing reminder e-mails / statements | 40 invoices × 2 reminders × 5 min ÷ 60 ≈ 7 h | **7** |
| Payables Due | Listing vendor dues | 25 invoices × 2 min ÷ 60 + weekly planning 30 min × 4 | **3** |
| Stale Price | Calling suppliers for every item on every quote (PP-1) | 30 quotes × 30 min price checking ≈ 15 h; agent narrows calls to stale items, saving ~50 % | **7** |
| Margin Guard | Owner reviewing quote margins | 30 quotes × 6 min ÷ 60 | **3** |
| Data Hygiene | Owner chasing staff for missing entries | ~15 min/day × 22 days | **5** |
| Low Stock | Manual stock checks (Phase 2) | 2 h/month (only after distributorship) | **0 now / 2 later** |
| Quote Expiry | Tracking validity dates | 40 quotes × 1.5 min ÷ 60 | **1** |
| Project Budget | Preparing project cost sheets | 7 projects × 30 min | **3.5** |
| **Total** | | | **≈ 46 hours/month** (≈ 6 working days) |

The larger benefit is not hours but **avoided losses**: forgotten follow-ups (lost orders), undelivered lines delaying invoices and payments, quotes priced on old pipe rates, and refill revenue missed. These are not quantified here.

## 5. Adding or changing an agent

1. Write the rule in this file (trigger, logic, thresholds, output, owner).
2. Add the REQ in [REQUIREMENTS.md](REQUIREMENTS.md) and a change-log row.
3. Implement as a pure function `(db, settings, today) → alerts[]` so it can be unit-tested with fixed dates (see [guides/backend-developer.md](guides/backend-developer.md)).
4. Add test cases to [guides/tester.md](guides/tester.md).
