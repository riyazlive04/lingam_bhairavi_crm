# User Guide: Owner / Admin

This guide is for the proprietors and partners of Linga Bhairavi Enterprise (system role **admin**). You can see and do everything in the CRM. Your most important job here is not data entry. It is making sure your team enters their data, because the reports can only show what has been entered.

> The last quotation CRM failed because staff left entries out ("If it's not entered, how will it come?", kickoff meeting [26:40 to 27:05]). This system shows you, person by person, what is still pending. Please look at it every week.

## Your first day

1. Open https://lbe-fire-crm.vercel.app on your phone or laptop and log in with the email and password Sirah Digital gave you.
2. Read the pop-up that appears. It lists customer PO lines not yet delivered, refills coming up and overdue payments.
3. Go to **Settings & Users** and create one login for each staff member, with the right role.
4. Fill in your company details and check the pricing defaults (markup, minimum margin, validity, GST).
5. Open **Dashboard** and spend five minutes getting to know the tiles. This is where you will start every day.

## 1. Your daily routine (10 minutes)

1. **Log in** on your phone or laptop. A pop-up lists the **customer PO lines not yet delivered**. Note any that are overdue and ask the store or sales team about them.
2. **Dashboard.** Read the tiles from left to right:
   - *Follow-ups due today*: quotations your sales team must call about.
   - *Undelivered lines*: PO items still pending for customer sites.
   - *Ready to invoice*: fully delivered orders not yet billed.
   - *Receivables overdue* and *Payables due this week*.
   - *Refills due (next 10 days)*: extinguisher customers to approach.
   - *Projects*: contract value against spend. Amber at 80 % of budget, red at 100 %.
   - *Pending entries by person*: the accountability tile.
3. **Checks:** quotations flagged below the minimum margin, and expense vouchers waiting in **Expenses** (if you approve them).
4. **Alerts** from the automation agents: open each one, act on it or pass it to the right person.

## 2. Weekly routine (30 minutes)

| Day | Task |
|---|---|
| Monday | Go through *Pending entries by person* with the team. Ask each person to clear their list. |
| Monday | Check payables due this week and decide what to pay. |
| Wednesday | Quotation pipeline: Sent, Follow-up, Won and Lost this month, and the reasons for losses. |
| Friday | Project margins: open each active project and check spend against contract value. |
| Friday | Stale prices: if many are flagged, ask purchase to refresh the pipe rates. |

## 3. Setup tasks (once, then now and then)

1. **Users.** In **Settings & Users**, create one login per person with the right role (sales, purchase, accounts, engineer, store). Never share logins, because accountability depends on it.
2. **Company details.** In **Settings & Users**, fill in the name, address, GSTIN, bank details, logo and quotation terms. These appear on printed quotations and invoices.
3. **Pricing settings.** In **Settings & Users**, set the default markup (proposed 40 %), minimum margin (proposed 15 %), quote validity (30 days) and default GST (18 %). *These defaults are assumptions until you confirm them.*
4. **Agents.** In **Automation Agents**, switch agents on or off, change thresholds (for example, how many days before a pipe price counts as stale) and set who receives reminder emails.
5. **Email.** Sirah Digital sets up the Office 365 mailbox. We just need the mailbox details from you (action A-04).
6. **Price list.** In **Item & Price Master**, check that the price list is complete, and fill in missing prices (fire alarm by make, and extinguishers).

## 4. What the automation agents will tell you

| Agent | What you'll see |
|---|---|
| Margin Guard | Quotes with a line below the minimum margin or below cost. Check them with sales before they go out |
| Data Hygiene | Who hasn't logged follow-ups, won quotes without sales orders, delivered orders not invoiced, and expenses not yet approved |
| Project Budget | Projects at 80 % or 100 % of budget, or with a negative margin |
| Pending Delivery | Overdue PO lines (critical after 7 days) |
| Receivables Dunning | Customers who have had 4 reminders and still haven't paid. Please call them yourself |
| Payables Due | Vendor invoices due within 5 days |
| All others | You see every alert, and your team acts on their own |

After a big round of data entry, use **Automation Agents → Run now** to refresh the alerts straight away. The agents also run on their own every morning at 8:00.

## 5. What you need to enter so the system works

| What | When | Why |
|---|---|---|
| Review quotes flagged by Margin Guard | The same day | So a low-margin quote doesn't reach the customer unnoticed |
| Contract value and budget for each project | When the order is won | Without it, the project margin can't be worked out |
| Pricing defaults and agent thresholds | Once | They drive every quotation |
| Weekly review of pending entries | Every week | This is the biggest single factor in whether the system succeeds |

## 6. Meeting Notes

Open **Meeting Notes** to record decisions from customer and vendor meetings and from internal reviews, with action items linked to a customer or project.

## 7. New in version 2

### Quote approval
Choose how approvals work in **Settings > Pricing**: off, only for quotes below the minimum margin (the default), or for every quote. When a quote has waited for your approval for more than a day, you get the alert "Quote X awaiting your approval". Open the quote, then approve or reject it with a short note.

### Profit & Reports
**Profit & Reports** shows the business profit month by month: sales after credit notes, cost of goods delivered or issued, expenses, gross profit and net profit. Each customer order also has a **Profit on this order** card.

### Project History tab
Every project now has a **History** tab: quotes, orders, deliveries, material issued, expenses, invoices and payments in one timeline. Use **Printable view** to print it.

### Import BOQ from Excel
Sales can upload a consultant's BOQ in **Quotations > Import BOQ**. Rows are matched to your items with the latest price and its date, and a draft quotation is created after they check it.

### Purchase Orders, Returns, Advances and AMC
- **Purchase Orders**: purchase can raise a vendor PO straight from a customer order's pending lines and track what has been received.
- **Returns**: goods coming back from customers (credit notes) and goods going back to vendors (debit notes).
- **Advances**: accounts can record an advance against a customer order and apply it to invoices later.
- **AMC Contracts** and **Service Calls**: maintenance contracts with planned visits, and breakdown calls with a response deadline.

The automation agents now include the **AMC Service** agent, which reminds the team about visits, renewals and late service calls.

## Quick help

**I forgot my password. What do I do?**
Ask Sirah Digital to reset it. As admin, you can also reset staff passwords from **Settings & Users**.

**A staff member has left. How do I stop their access?**
Open **Settings & Users** and deactivate their login. Their past entries stay in the system for the record.

**Why did I get a Margin Guard alert?**
At least one line in a quotation is below the minimum margin or below cost. Open it from the alert, check the rates and talk to the salesperson before it goes to the customer.

**The dashboard numbers look wrong. Why?**
Usually something hasn't been entered yet, such as a payment, a delivery or a purchase invoice. Check the *Pending entries by person* tile first.

**Can I change how early refill reminders come?**
Yes. Open **Automation Agents**, choose Refill Due and change the number of days.

---

Prepared by Sirah Digital · https://sirahdigital.in/
