# User Guide: Sales / Estimation

This guide is for staff who prepare BOQs and quotations and follow up with customers (system role **sales**).

What changes for you: you **no longer need to call suppliers for every price**. When you pick an item, the system fills in the latest purchase rate (from the last supplier invoice), adds the markup, and shows the date and supplier of that price.

## Your first day

1. Open https://lbe-fire-crm.vercel.app and log in with the email and password your admin gave you.
2. Read the pop-up. It shows undelivered PO lines and other items that need attention today.
3. Open **Customers** and check that your regular customers are there, with phone, email and GSTIN.
4. Open **BOQ templates** and look through the templates for Hydrant, Sprinkler, Fire Alarm, PA and Extinguishers.
5. Make a practice quotation from a template, then open **Follow-ups** to see where your calls will appear each day.

### Finding your way around
- Your work is mostly in the **Sell** group of the menu: **Quotations**, **Import BOQ**, **Follow-ups**, **Customers** and **BOQ templates**. You will also use **Orders & delivery** and **Returns** (under **Deliver**), **AMC**, **Service calls** and **Refills** (under **Service**), and **Projects** and **Expenses** (under **Projects & site**).
- The **New** button in the top bar starts a **New quotation**, an **Import BOQ**, a **New expense** or a **New service call** in one click.
- On a phone, the tab bar at the bottom gives you **Home**, **Quotations**, **Follow-ups** and **Orders & delivery**. Tap **More** for everything else.

## 1. Daily workflow

### Morning (10 minutes)
1. Log in and check the pop-up of **undelivered PO lines** for your customers.
2. **Follow-ups** (or the **Follow-ups due** tile on **Home**): call, visit or email each customer and log it (see "Logging a follow-up" below).
3. **Refills**: extinguisher customers due in the next 10 days. Call them and create a refill quotation.

### Making a quotation from a BOQ template
1. Go to **Quotations** and click **New quotation** (or use the **New** menu).
2. Choose the customer. If they are new, create them with company name, contact, phone, email, GSTIN and billing and site address.
3. Choose the BOQ template for the system: **Hydrant**, **Sprinkler**, **Fire Alarm (FAS)**, **PA / Voice Evacuation** or **Extinguishers**. Then click **Next: enter quantities**. Every line of the template appears.
4. Enter quantities only on the lines you need. For example:
   - Pipe MS 80 NB: 120 (metre)
   - Single Hydrant Valve: 6 (nos)
   - Hose reel drum: 6, RRL Hose with SS: 6, Branch pipe (nozzle): 6
   - Pendant Sprinkler: 140

   Leave everything else at **0**. The editor tells you how many lines have a quantity, and only those are saved.
5. Check each line. The supply rate is filled in for you (latest purchase rate plus markup), and the erection rate comes from the item master. Beside each line you see the cost, its date and the supplier.
   - A **stale** mark means the price is old (more than 7 days for pipes and other fast-moving items, more than 90 days for the rest). Ask purchase to confirm it.
   - A **red margin** means the quote is below the minimum margin. It will need the owner's approval (see section 4).
6. Add remarks, validity (30 days by default) and terms, then click **Save quotation**.
7. Click **Export Excel** (your usual format: BOQ Ref | Description | Qty | UOM | Supply Rate/Amount | Erection Rate/Amount | Remarks) or **Print**, and send it to the customer.
8. Mark the quotation as sent and set the **next follow-up date**.

If the customer or consultant sends their own BOQ as an Excel file, use **Import BOQ** instead (see section 4).

### Logging a follow-up (1 minute each)
Open the quotation and add a follow-up: the date (today), mode (call, visit, email, WhatsApp or meeting), the person you spoke to, what they said and the **next follow-up date**.

### When the customer gives you the order
1. Open the quotation, click **Mark won** and enter the customer's **PO number and date**. A customer order is created with the same lines, under **Orders & delivery**.
2. Check the expected delivery date on each line.
3. If quantities changed in the PO, edit the order lines.

### When you lose
Click **Mark lost** and give a reason (price, competitor, project dropped or other). This helps the owner see why quotes are lost.

### Revising a quote
**Revise** creates a new version such as `LBE/Q/2026-27/0012-R1`. The original stays for reference.

## 2. What the automation agents will remind you about

| Agent | Reminder |
|---|---|
| Follow-up | A follow-up is due or overdue, or a quotation was sent 3 days ago and no follow-up has been logged |
| Quote Validity | A quotation's validity ends within 3 days, or it has expired |
| Refill & HPT Reminder | Customer extinguishers due for refill or pressure test within 10 days (internal only: the customer is not notified) |
| AMC & Service | AMC contracts ending within 30 days (send a renewal quotation), and service calls past their response deadline that have no engineer assigned |
| Pending Delivery | Lines on customer orders you entered that are overdue, have no delivery date, or are due in the next 3 days |
| Data Hygiene | Won quotations with no customer order after 3 days, and quotes with no next follow-up date and no contact for 7 days |

Old prices and low margins are not sent to you as alerts. You see them right on the quotation (the **stale** mark and the margin figure), while the Stale Price agent alerts purchase and the Margin Guard agent alerts the owner.

## 3. What you need to enter so the system works

| Entry | When | If you skip it |
|---|---|---|
| Customer with email and GSTIN | Before the first quotation | Invoices and payment reminders can't go out |
| Quotation marked as sent, with the next follow-up date | The day you send it | The Follow-up agent can't remind you, and the owner sees it as pending |
| Every follow-up | The same day as the call or visit | The quote looks abandoned on the owner's screen |
| **Won**, with PO number and date (this creates the order) | The day the PO arrives | Store can't see what to dispatch, and delivery tracking fails |
| **Lost**, with a reason | As soon as you know | The pipeline looks bigger than it really is |
| Refill record (type, kg, make, qty, last refill date, 1 year or 3 years) | When you sell or refill extinguishers | There will be no refill reminder next year |

A simple rule: **if it happened today, enter it today.**

## 4. New screens for you

### Import a consultant's BOQ from Excel
Got the BOQ as an Excel file? Open **Import BOQ** (in the **Sell** menu or the **New** menu), or click **Import consultant BOQ** on the Quotations list.
1. Choose the customer and upload the Excel file.
2. Check the matches. Each row is matched to an item in the master with its latest price and the date of that price. Fix any row that is wrong, or untick rows you don't want.
3. Click **Create quotation**. A draft quotation opens with the consultant's quantities filled in. Lines with zero quantity are left out.

### Price date on every line
Each quotation line now shows where its cost came from, for example "₹1,250 · 12 Nov 2026 · Vendor name". If the date is old, ask purchase to reconfirm the price before you send.

### Quote approval
Some quotes need the owner's approval before they go out (for example when a line is below the minimum margin or below cost). On such a quote, **Mark sent** and **Email** stay locked. Click **Request approval**. The owner approves or rejects it with a note, and you can send it once it is approved. If you edit an approved quote and it still needs approval, it goes back for approval.

### Customer returns
If a customer sends material back, open the order and click **Record return**. Pick the lines, quantities and reason. Once posted, it becomes a credit note and the customer's **Net due** goes down. All returns are listed under **Returns**.

### AMC contracts and service calls
Under **Service**, **AMC** lists annual maintenance contracts with their visit schedule. You get a reminder 30 days before a contract ends so you can send a renewal quote. Breakdown complaints go in **Service calls** (or **New service call** in the **New** menu).

### Net due on customers
The Customers list now shows **Invoices due** and **Net due**. Net due is what the customer really owes after credit notes and advances.

## Quick help

**The rate on a line looks wrong. What should I do?**
Look at the date and supplier shown beside the line to see where the rate came from. If it is old or wrong, ask purchase to confirm the price. You can change the rate on the line before saving.

**Can I make a refill quotation quickly?**
Yes. Open **Refills**, select the units that are due and click **Create refill quotation**.

**The customer changed quantities after I sent the quote. Do I start again?**
No. Click **Revise** on the quotation. It keeps the original and creates the next revision.

**I marked a quote as won by mistake. What now?**
Tell your admin straight away, so the order can be corrected before store starts dispatching.

**Why can't I find an item in the template?**
Use the item search on the quotation to add it. If it isn't in the **Item & price master** at all, ask purchase to add it with the correct size and make.

---

Prepared by Sirah Digital · https://sirahdigital.in/
