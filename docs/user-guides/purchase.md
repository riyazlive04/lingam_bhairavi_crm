# User Guide — Purchase

For: staff who buy material from suppliers and record supplier invoices (system role **purchase**).

Why your entries matter most: **every quotation price comes from the purchase invoices you enter.** When you enter a supplier invoice for 200 NB GI pipe, the next quotation with 200 NB GI pipe automatically uses that rate. If invoices are not entered, sales go back to calling suppliers for every quote — the exact problem the owner wants to stop (kickoff meeting [04:35–05:00]).

## 1. Daily workflow

### Entering a supplier (purchase) invoice — as soon as it arrives
1. Purchase Invoices → **New**.
2. Vendor (type to search; create if new: name, GSTIN, phone, e-mail, payment terms in days, categories).
3. Invoice no. and invoice date (exactly as printed).
4. **Project** — select the project if the material is for a specific site (it then counts in that project's cost). Leave blank / "Store" for general stock.
5. Lines: type to find the item, e.g. "pipe ms 80" → *Pipe MS 80 NB*; enter qty, rate (before GST), GST %.
   - Item not found? Click **+ New item** inline: name, size (e.g. 65 NB, ½", M10), make (e.g. Ravel UL, Polycab, Safex), UOM.
   - Make matters: Honeywell / Morley / System Sensor, Ravel, Glyptic, Edwards, ASES (and UL versions) are **different items** with different prices.
6. Check totals against the paper invoice; **Save**.

What happens automatically on save:
- The item's **purchase price history** gets a new row; it becomes the **latest procured price** used in quotations.
- The **vendor master** updates: this vendor supplies this item at this rate.
- A **vendor payable** is created with due date (invoice date + payment terms).
- The project's cost increases (if a project was selected).

### Checking prices before a big quotation
Items & Prices → item → **Purchase history**: date, vendor, rate for the last months/years. The **Vendors** list on the item shows all 3–4 suppliers with their last rates; the cheapest is highlighted.

### Refreshing stale prices
Pipes change price daily. Each morning open **Alerts → Stale prices**. Call the suppliers for the flagged items you are about to quote, and either:
- enter the actual invoice when you buy, or
- tell the salesperson the confirmed rate so they can override the line. *(A "supplier rate confirmation" entry without an invoice is a proposed feature — to be confirmed with the owner.)*

## 2. What the automation agents will remind you about

| Agent | Reminder |
|---|---|
| Stale Price | Items whose latest rate is older than 7 days (pipes) or 30 days (others); items with no price at all (many fire-alarm and extinguisher items in the current list) |
| Data Hygiene | Purchase invoices without project/store tag; items without UOM or price |
| Pending Delivery | PO lines waiting for material you are procuring |
| Low Stock (later, after distributorship) | Stock items below reorder level |

## 3. What you MUST enter so the system works

| Entry | When | If you skip it… |
|---|---|---|
| **Every supplier invoice**, line by line, with correct item, size and make | The day it arrives | Quotations use old prices; vendor rates are wrong; payables are missing |
| Project on the invoice (if for a site) | Same time | Project cost and margin are understated |
| Vendor payment terms | When creating a vendor | Payables Due agent can't warn accounts |
| New items with size + make + UOM | When first bought | Duplicates and wrong prices |

Tip: don't create "Pipe GI 2 inch" if *Pipe GI 50 NB* exists — search by NB size first.
