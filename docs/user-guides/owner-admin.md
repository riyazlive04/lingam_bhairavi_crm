# User Guide: Owner / Admin

This guide is for the proprietors and partners of Linga Bhairavi Enterprise (system role **admin**). You can see and do everything in the CRM. Your most important job here is not data entry. It is making sure your team enters their data, because the reports can only show what has been entered.

> The last quotation CRM failed because staff left entries out ("If it's not entered, how will it come?", kickoff meeting [26:40 to 27:05]). This system shows you, person by person, what is still pending. Please look at it every week.

## Your first day

1. Open https://lbe-fire-crm.vercel.app on your phone or laptop and log in with the email and password Sirah Digital gave you.
2. Read the pop-up that appears. It lists customer PO lines not yet delivered, refills coming up and overdue payments.
3. Go to **Settings & users** and create one login for each staff member, with the right role.
4. Fill in your company details and check the pricing defaults (markup, minimum margin, validity, GST and approvals).
5. Open **Home** and spend five minutes getting to know the tiles. This is where you will start every day.

### Finding your way around
- The menu on the left is grouped by the job you are doing: **Sell**, **Deliver**, **Buy**, **Money**, **Projects & site**, **Service**, **Automation** and **Admin**. As the owner, you see every group.
- The **New** button in the top bar is a quick way to start common work: **New quotation**, **Import BOQ**, **Record payment**, **Record advance**, **New expense** and **New service call**.
- On a phone, the tab bar at the bottom gives you **Home**, **Quotations**, **Orders & delivery** and **Billing & outstanding**. Tap **More** for everything else.

## 1. Your daily routine (10 minutes)

1. **Log in** on your phone or laptop. A pop-up lists the **customer PO lines not yet delivered**. Note any that are overdue and ask the store or sales team about them.
2. **Home.** Read the tiles group by group:
   - *Today's focus*: **Awaiting your approval** (quotes that cannot go out until you decide), **Follow-ups due**, **AMC visits this week** and **PO lines to deliver**.
   - *Sales*: **Open pipeline**, **Quoted this month** (with the win rate) and last month's invoiced sales.
   - *Money*: **Profit this month**, **Receivables** (with the overdue amount) and **Payables due in 7 days**.
   - *Operations*: **Refills due in 10 days**, **Active projects** (with the average margin), **Prices to confirm again** and **Low stock items**.
   - Below the tiles, **Needs your attention** lists the most important open alerts, followed by recent quotations and pending deliveries.
3. **Checks:** quotes waiting for your approval, and expense vouchers waiting in **Expenses**.
4. **Alerts** (under **Automation**): open each one, act on it or pass it to the right person.

## 2. Weekly routine (30 minutes)

| Day | Task |
|---|---|
| Monday | Open **Alerts**, filter by the Data Hygiene agent and go through the missed entries with the team. Ask each person to clear theirs. |
| Monday | Check payables due this week and decide what to pay. |
| Wednesday | Quotation pipeline: Sent, Negotiation, Won and Lost this month, and the reasons for losses. |
| Friday | Project margins: open each active project and check spend against contract value. **Reports & profit** gives the month's profit at a glance. |
| Friday | Stale prices: if many are flagged, ask purchase to refresh the pipe rates. |

## 3. Setup tasks (once, then now and then)

1. **Users.** In **Settings & users**, open the **Users** tab and create one login per person with the right role (sales, purchase, accounts, engineer, store). Never share logins, because accountability depends on it.
2. **Company details.** In **Settings & users**, on the **Company and pricing** tab, fill in the name, address, GSTIN, bank details, logo and quotation terms. These appear on printed quotations and invoices.
3. **Pricing settings.** On the same tab, set the default markup (proposed 40 %), minimum margin (proposed 15 %), quote validity (30 days), default GST (18 %) and **Approval before sending** (see section 7). *These defaults are assumptions until you confirm them.*
4. **Agents.** In **Automation agents**, switch agents on or off and change thresholds (for example, how many days before a pipe price counts as stale).
5. **Email.** Sirah Digital sets up the Office 365 mailbox. We just need the mailbox details from you (action A-04).
6. **Price list.** In **Item & price master**, check that the price list is complete, and fill in missing prices (fire alarm by make, and extinguishers).

## 4. What the automation agents will tell you

| Agent | What you'll see |
|---|---|
| Margin Guard | Quotes below the minimum margin, or with a line priced below cost. Check them with sales before they go out |
| Data Hygiene (Accountability) | Quotes waiting for your approval for more than a day, quotes with no next follow-up, won quotes without an order, delivered orders not invoiced, expenses not yet approved, purchase bills left in draft and idle projects |
| Project Budget Watch | Projects at 80 % or 100 % of budget, or with a negative margin |
| Pending Delivery | PO lines past their expected date (critical), lines with no delivery date, and deliveries due in the next 3 days |
| Receivables & Dunning | Invoices more than 60 days overdue, or customers who have had 3 reminders and still haven't paid. Please call them yourself |
| Payables | Vendor bills due within 7 days, or already overdue |
| AMC & Service | AMC visits due, contracts ending within 30 days, and service calls past their response deadline |
| All others | You see every alert, and your team acts on their own |

After a big round of data entry, use **Run now** on the **Automation agents** page to refresh the alerts straight away. The agents also run on their own every morning at 8:00, and again when someone logs in if the last run is more than 6 hours old.

## 5. What you need to enter so the system works

| What | When | Why |
|---|---|---|
| Approve or reject quotes waiting for you | The same day | Sales cannot send the quote until you decide |
| Contract value and budget for each project | When the order is won | Without it, the project margin can't be worked out |
| Pricing defaults and agent thresholds | Once | They drive every quotation |
| Weekly review of missed entries | Every week | This is the biggest single factor in whether the system succeeds |

## 6. Meeting notes

Open **Meeting notes** (under **Admin**) to record decisions from customer and vendor meetings and from internal reviews, with action items linked to a customer or project.

## 7. New in version 2

### Quote approval
Choose how approvals work in **Settings & users**, under **Approval before sending**: **Off**, **Only below minimum margin** (the default) or **All quotations**. When a quote has waited for your approval for more than a day, you get the alert "Quote X awaiting your approval". Open the quote, then approve or reject it with a short note.

### Reports & profit
**Reports & profit** (under **Money**) shows the business profit month by month: sales after credit notes, cost of goods delivered or issued, expenses, gross profit and net profit. Each customer order also has a **Profit on this order** card.

### Project History tab
Every project now has a **History** tab: quotes, orders, deliveries, material issued, expenses, invoices and payments in one timeline. Use **Printable view** to print it.

### Import BOQ from Excel
Sales can upload a consultant's BOQ with **Import BOQ** (under **Sell**, or from the **New** menu). Rows are matched to your items with the latest price and its date, and a draft quotation is created after they check it.

### Purchase orders, returns, advances and AMC
- **Purchase orders** (under **Buy**): purchase can raise a vendor PO straight from a customer order's pending lines and track what has been received.
- **Returns** (under **Deliver**): goods coming back from customers (credit notes) and goods going back to vendors (debit notes).
- **Advances** (under **Money**): accounts can record an advance against a customer order and apply it to invoices later.
- **AMC** and **Service calls** (under **Service**): maintenance contracts with planned visits, and breakdown calls with a response deadline.

The automation agents now include the **AMC & Service** agent, which reminds the team about visits, renewals and late service calls.

### Printouts and screens
Every printout (quotation, invoice, challan, purchase order, credit and debit notes, receipts and AMC reports) now uses the same A4 layout. When you delete or cancel something, the button asks you to confirm right there on the page. If you prefer to see more rows on screen, switch the table density to compact.

## Quick help

**I forgot my password. What do I do?**
Ask Sirah Digital to reset it. As admin, you can also reset staff passwords from **Settings & users**.

**A staff member has left. How do I stop their access?**
Open **Settings & users** and deactivate their login. Their past entries stay in the system for the record.

**Why did I get a Margin Guard alert?**
A quotation is below the minimum margin, or a line is priced below cost. Open it from the alert, check the rates and talk to the salesperson before it goes to the customer.

**The numbers on Home look wrong. Why?**
Usually something hasn't been entered yet, such as a payment, a delivery or a purchase invoice. Check the Data Hygiene alerts in **Alerts** first.

**Can I change how early refill reminders come?**
Yes. Open **Automation agents**, choose the Refill & HPT Reminder agent and change the number of days.

---

Prepared by Sirah Digital · https://sirahdigital.in/
