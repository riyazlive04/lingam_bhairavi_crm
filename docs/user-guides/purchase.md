# User Guide: Purchase

This guide is for staff who buy material from suppliers and record supplier invoices (system role **purchase**).

Why your entries matter most: **every quotation price comes from the purchase invoices you enter.** When you enter a supplier invoice for 200 NB GI pipe, the next quotation with 200 NB GI pipe uses that rate automatically. If invoices aren't entered, sales go back to calling suppliers for every quote, which is exactly what the owner wants to stop (kickoff meeting [04:35 to 05:00]).

## Your first day

1. Open https://lbe-fire-crm.vercel.app and log in with the email and password your admin gave you.
2. Open **Vendors** and check that your regular suppliers are listed, with GSTIN, phone, email and payment terms.
3. Open **Item & Price Master** and search for a few items you buy often, such as "pipe ms 80". Look at the size and make on each item.
4. Pick one recent supplier invoice from your desk and enter it in **Purchase Invoices**, following section 1 below.
5. Open the item again and see your new rate in its purchase history.

## 1. Daily workflow

### Entering a supplier (purchase) invoice as soon as it arrives
1. Go to **Purchase Invoices → New**.
2. Choose the vendor (type to search). If the vendor is new, create them with name, GSTIN, phone, email, payment terms in days and categories.
3. Enter the invoice number and invoice date exactly as printed.
4. **Project:** select the project if the material is for a particular site, so it counts in that project's cost. Leave it blank for general store stock.
5. Add the lines. Type to find the item, for example "pipe ms 80" finds *Pipe MS 80 NB*. Enter qty, rate (before GST) and GST %.
   - Item not found? Add it as a new item with name, size (for example 65 NB, ½", M10), make (for example Ravel UL, Polycab, Safex) and UOM.
   - Make matters. Honeywell, Morley, System Sensor, Ravel, Glyptic, Edwards and ASES (and their UL versions) are **different items** with different prices.
6. Check the totals against the paper invoice and save it as a draft.
7. When everything matches, **Post** the invoice. Posting is what updates prices and stock, and it can only be done once.

What happens automatically when you post:
- The item's **purchase price history** gets a new row, and this becomes the **latest buying price** used in quotations.
- The **vendor master** is updated to show that this vendor supplies this item at this rate.
- A **vendor payable** is created with a due date (invoice date plus payment terms).
- The project's cost goes up (if you selected a project).
- If the rate has jumped by 5 % or more, you will see a warning so you can double-check it.

### Checking prices before a big quotation
Open **Item & Price Master**, then the item, and look at its **purchase history**: date, vendor and rate for recent months and years. The vendor list on the item shows all 3 or 4 suppliers with their last rates, with the cheapest highlighted.

### Refreshing stale prices
Pipe prices change daily. Each morning, open **Alerts** and look for the Stale Price alerts. Call the suppliers about the flagged items that are about to be quoted, and then either:
- enter the actual invoice when you buy, or
- give the salesperson the confirmed rate so they can change the line. *(A "supplier rate confirmation" entry without an invoice is a proposed feature, still to be confirmed with the owner.)*

## 2. What the automation agents will remind you about

| Agent | Reminder |
|---|---|
| Stale Price | Items whose latest rate is older than 7 days (pipes and cables) or 90 days (other items in use), and items with no price at all (many fire-alarm and extinguisher items in the current list) |
| Data Hygiene | Draft purchase invoices not yet posted, and items without a UOM or price |
| Pending Delivery | PO lines waiting for material you are buying |
| Low Stock (later, once distributorship starts) | Stock items below the reorder level |

## 3. What you need to enter so the system works

| Entry | When | If you skip it |
|---|---|---|
| **Every supplier invoice**, line by line, with the correct item, size and make, and posted | The day it arrives | Quotations use old prices, vendor rates are wrong and payables are missing |
| The project on the invoice (if it is for a site) | At the same time | The project's cost and margin look better than they really are |
| Vendor payment terms | When you create a vendor | The Payables Due agent can't warn accounts |
| New items with size, make and UOM | The first time you buy them | Duplicate items and wrong prices |

Tip: don't create "Pipe GI 2 inch" if *Pipe GI 50 NB* already exists. Search by NB size first.

## 4. New screens for you

### Purchase Orders
Go to **Purchase Orders** to place an order with a supplier. The quickest way: open a customer order with pending lines and click **Create vendor PO**. The lines are filled in for you and the customer order line is marked as ordered.
When the goods and the bill arrive, open the PO and create the purchase invoice from it. The quantities still to receive are filled in. When you post the bill, the PO shows how much has been received.

### Return to vendor
If goods must go back to a supplier, open the posted purchase invoice and click **Return to vendor**. Pick the lines and quantities. Once posted, it becomes a debit note, stock goes down, and accounts can adjust it against the vendor's open bills.

### Price date on quotation lines
Sales now see the date and vendor of the price on every quotation line. Entering purchase invoices on time keeps these dates fresh.

### Vendor net due
The Vendors list shows **Bills due** and **Net due** (after unadjusted debit notes).

## Quick help

**I saved an invoice but the price didn't change. Why?**
It is probably still a draft. Open it in **Purchase Invoices** and click **Post**. Prices, stock and payables update only after posting.

**I entered a wrong rate on a posted invoice. Can I edit it?**
A posted invoice is locked to protect the price history. Tell your admin, who can help you correct it.

**The same item appears twice with different names. What should I do?**
Use the one with the correct NB size and make, and tell your admin about the duplicate so it can be tidied up.

**Do I need to enter small local purchases?**
If they are bought for a site, the site engineer usually records them as an expense under **Expenses**. Supplier invoices for material always go in **Purchase Invoices**.

**Where do I see what we owe a vendor?**
Open **Vendors** and select the vendor. You will see their bills, payments and the outstanding balance.

---

Prepared by Sirah Digital · https://sirahdigital.in/
