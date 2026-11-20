# User Guide: Sales / Estimation

This guide is for staff who prepare BOQs and quotations and follow up with customers (system role **sales**).

What changes for you: you **no longer need to call suppliers for every price**. When you pick an item, the system fills in the latest purchase rate (from the last supplier invoice), adds the markup, and shows the last price you quoted or sold at to that customer.

## Your first day

1. Open https://lbe-fire-crm.vercel.app and log in with the email and password your admin gave you.
2. Read the pop-up. It shows undelivered PO lines and other items that need attention today.
3. Open **Customers** and check that your regular customers are there, with phone, email and GSTIN.
4. Open **BOQ Templates** and look through the templates for Hydrant, Sprinkler, Fire Alarm, PA and Extinguishers.
5. Make a practice quotation from a template, then open **Follow-ups** to see where your calls will appear each day.

## 1. Daily workflow

### Morning (10 minutes)
1. Log in and check the pop-up of **undelivered PO lines** for your customers.
2. **Follow-ups** (or the Dashboard tile *Follow-ups due today*): call, visit or email each customer and log it (see "Logging a follow-up" below).
3. **Refill Tracker**: extinguisher customers due in the next 10 days. Call them and create a refill quotation.

### Making a quotation from a BOQ template
1. Go to **Quotations → New quotation** and choose a BOQ template.
2. Choose the customer. If they are new, create them with company name, contact, phone, email, GSTIN and billing and site address.
3. Choose the system: **Hydrant**, **Sprinkler**, **Fire Alarm (FAS)**, **PA / Voice Evacuation** or **Extinguishers**. You can add more than one system to the same quotation.
4. Enter quantities only on the lines you need. For example:
   - Pipe MS 80 NB: 120 (metre)
   - Single Hydrant Valve: 6 (nos)
   - Hose reel drum: 6, RRL Hose with SS: 6, Branch pipe (nozzle): 6
   - Pendant Sprinkler: 140

   Leave everything else at **0**. Lines with zero quantity are left out automatically.
5. Click **Create quotation** and read the message, for example "18 lines with quantity, 42 excluded".
6. Check each line. The supply rate is filled in for you (latest purchase rate plus markup), and the erection rate comes from the item master. The side panel shows the purchase rate, its date and vendor, and the last rate quoted or sold to this customer.
   - An **amber "stale" badge** means the price is old (for pipes, more than 7 days). Ask purchase to confirm it.
   - A **red margin warning** means the line is below the minimum margin. Talk to the owner before sending.
7. Add remarks, validity (30 days by default) and terms, then save.
8. Click **Export Excel** (your usual format: BOQ Ref | Description | Qty | UOM | Supply Rate/Amount | Erection Rate/Amount | Remarks) or **Print/PDF**, and send it to the customer.
9. Mark the quotation as sent and set the **next follow-up date**.

If the customer or consultant sends their own BOQ, choose the closest template, enter their quantities, and edit the BOQ refs and descriptions to match theirs.

### Logging a follow-up (1 minute each)
Open the quotation and add a follow-up: the date (today), mode (call, visit, email, WhatsApp or meeting), the person you spoke to, what they said and the **next follow-up date**.

### When the customer gives you the order
1. Open the quotation, click **Mark won** and enter the customer's **PO number and date**. A customer order is created with the same lines, under **Orders & Delivery**.
2. Check the expected delivery date on each line.
3. If quantities changed in the PO, edit the order lines.

### When you lose
Click **Mark lost** and give a reason (price, competitor, project dropped or other). This helps the owner see why quotes are lost.

### Revising a quote
**Revise** creates a new version such as `LBE/Q/2026-27/0012-R1`. The original stays for reference.

## 2. What the automation agents will remind you about

| Agent | Reminder |
|---|---|
| Follow-up | A follow-up is due today, no follow-up has been logged for 7 days, or a quotation was sent without a next follow-up date |
| Quote Expiry | A quotation's validity ends in 5 days, or it has expired |
| Refill Due | Customer extinguishers due for refill within 10 days (internal only: the customer is not notified) |
| Pending Delivery | Your customers' PO lines that are overdue or arriving soon |
| Stale Price | Lines in your quotations that use old prices |
| Margin Guard | Lines in your quotations below the minimum margin |
| Data Hygiene | Won quotations with no customer order after 3 days |

## 3. What you need to enter so the system works

| Entry | When | If you skip it |
|---|---|---|
| Customer with email and GSTIN | Before the first quotation | Invoices and payment reminders can't go out |
| Quotation marked as sent, with the next follow-up date | The day you send it | The Follow-up agent can't remind you, and the owner sees it as pending |
| Every follow-up | The same day as the call or visit | The quote looks abandoned on the owner's dashboard |
| **Won**, with PO number and date (this creates the order) | The day the PO arrives | Store can't see what to dispatch, and delivery tracking fails |
| **Lost**, with a reason | As soon as you know | The pipeline looks bigger than it really is |
| Refill record (type, kg, make, qty, last refill date, 1 year or 3 years) | When you sell or refill extinguishers | There will be no refill reminder next year |

A simple rule: **if it happened today, enter it today.**

## Quick help

**The rate on a line looks wrong. What should I do?**
Look at the side panel to see which purchase invoice the rate came from. If it is old or wrong, ask purchase to confirm the price. You can change the rate on the line before saving.

**Can I make a refill quotation quickly?**
Yes. Open **Refill Tracker**, select the units that are due and click **Create refill quotation**.

**The customer changed quantities after I sent the quote. Do I start again?**
No. Click **Revise** on the quotation. It keeps the original and creates the next revision.

**I marked a quote as won by mistake. What now?**
Tell your admin straight away, so the order can be corrected before store starts dispatching.

**Why can't I find an item in the template?**
Use the item search on the quotation to add it. If it isn't in the **Item & Price Master** at all, ask purchase to add it with the correct size and make.

---

Prepared by Sirah Digital · https://sirahdigital.in/
