# User Guide — Accounts

For: accounts staff (system role **accounts**). You continue to use **Tally / Vyapar** for statutory accounts and GST returns. In the CRM you raise customer invoices from delivered orders, record payments, approve expenses, and track **customer and vendor outstanding** — and the system sends **payment reminder e-mails** for you.

> How CRM invoices relate to Tally/Vyapar (which one is the master, and whether we export to Tally) is still being confirmed with the owner (open question Q-11). Follow the owner's instruction until then and avoid entering the same invoice differently in two places.

## 1. Daily workflow

### Morning (15 min)
1. Dashboard → **Ready to invoice**: orders fully delivered but not invoiced.
2. **Receivables overdue** and **Payables due this week**.
3. **Expenses awaiting approval**.

### Raising a sales invoice
1. Sales Orders → open the delivered order → **Create invoice** (or Sales Invoices → New for a manual invoice).
2. Lines and quantities come from the delivered quantities; Supply and Erection amounts are kept separately.
3. GST is applied automatically: **CGST 9 % + SGST 9 %** for Tamil Nadu customers, **IGST 18 %** for other states (default 18 % — rates per item can differ).
4. Check customer GSTIN, billing address, PO reference.
5. Save → number like `LBE/INV/2026-27/0001` → Print/PDF and send.

### Recording a customer payment
Payments → **New**: customer, date, mode (NEFT/RTGS/cheque/UPI/cash), reference no., amount → allocate to one or more invoices. Outstanding updates immediately.

### Vendor payments
Purchase Invoices → open → **Record payment** (or Payments → Vendor). Payables list updates.

### Approving expenses
Expenses → **Submitted**: check amount, category, project, receipt photo, split. **Approve** (adds to project cost) or **Reject** with reason.

### Outstanding reports
- **Customer outstanding**: by customer, ageing 0–30 / 31–60 / 61–90 / 90+ days; customer statement (ledger) printable.
- **Vendor outstanding**: by vendor with due dates.

## 2. What the automation agents will do / remind you about

| Agent | What it does |
|---|---|
| Receivables Dunning | **Sends e-mails to customers** from the company Office 365 mailbox: on the due date, then every 7 days, up to 4 reminders, listing invoice no., date, amount, received, balance. You are CC'd. It skips customers without e-mail, customers with reminders turned off, and customers who paid in the last 3 days. After the 4th reminder you get an alert to **call** the customer. |
| Payables Due | Vendor invoices due within 5 days, and overdue ones |
| Data Hygiene | Delivered orders not invoiced after 3 days; expenses waiting for approval more than 5 days; customers missing e-mail/GSTIN |

To stop reminders for a customer (e.g. dispute or special arrangement): Customer → **Payment reminders: Off**.

## 3. What you MUST enter so the system works

| Entry | When | If you skip it… |
|---|---|---|
| Sales invoice for each delivered order | Within 3 days of delivery | Revenue and outstanding are wrong; dunning can't start |
| **Every customer payment** (with allocation to invoices) | The day it is received | Customers get reminder e-mails for amounts already paid — embarrassing |
| Vendor payments | When paid | Payables alerts keep firing |
| Customer credit days and e-mail | When the customer is created/first invoiced | Due dates and reminders are wrong |
| Expense approvals | Within 2 days | Project costs incomplete; engineers lose trust |

The most important rule: **record payments the same day** — the reminder e-mails go out automatically every morning.
