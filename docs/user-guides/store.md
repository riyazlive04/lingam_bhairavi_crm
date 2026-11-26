# User Guide: Store / Dispatch

This guide is for staff who dispatch material to customers and sites, and who will later manage stock (system role **store**).

The problem this solves: when a customer PO has 10 lines, 9 get delivered and one is out of stock or in transit. That last line gets **forgotten under the pressure of other orders** (kickoff meeting [15:50 to 16:15]). The system now keeps every undelivered line in front of you until it is delivered.

## Your first day

1. Open https://lbe-fire-crm.vercel.app and log in with the email and password your admin gave you.
2. Read the pop-up. It lists every PO line that hasn't been delivered yet.
3. Open **Orders & Delivery** and look at the pending lines. Click one order to see its lines and their status.
4. Record your next real dispatch in the system, following section 1 below.
5. If you will handle stock, open **Stock** to see what is on hand, reserved and available.

## 1. Daily workflow

### At login
A **pop-up lists all undelivered PO lines**: customer, PO number, item (for example *Pipe MS 65 NB* or *2 way FBI valve*), pending quantity, expected date and days overdue. Overdue lines are at the top. Click a line to open the order, or close the pop-up for now. It comes back at your next login until the line is delivered.

### Dispatching material
1. Open **Orders & Delivery**, select the customer order and click **Record delivery**.
2. All pending lines are listed, with the pending quantity already filled in.
3. Change the quantity actually sent on each line. It can be less than pending (a partial delivery).
4. Enter the date, the DC number (filled in for you, like `LBE/DC/2026-27/0001`) and the vehicle or transporter.
5. **Save**, and print the delivery challan if needed.

The line status updates by itself: **Pending → Partial → Delivered**.

### Item not available yet or coming later
On the order line, set the status to **In transit** and enter the **expected date**, with a note if useful (for example, "Supplier dispatch on Monday"). The system will remind you on that date.

### When everything is delivered
The order moves to **Ready to invoice** for accounts. You don't need to tell anyone.

### Stock (once distributorship starts)
When the company starts holding stock (for example, fire-alarm panels), you will use **Stock** to record goods received and issues to projects, and to see **allocations**: how many of 100 panels are reserved for which order. This becomes part of your daily work in Phase 2.

## 2. What the automation agents will remind you about

| Agent | Reminder |
|---|---|
| Pending Delivery | Lines past their expected date (critical after 7 days), in-transit lines arriving today or tomorrow, and orders that are 90 % delivered but whose last items are still pending after 3 days |
| Low Stock (Phase 2) | Stock items below the reorder level, or not enough for allocated orders |

## 3. What you need to enter so the system works

| Entry | When | If you skip it |
|---|---|---|
| **Every delivery**, with the actual quantity on each line | When the vehicle leaves | The pop-up keeps showing items already delivered, or worse, shows nothing pending when something is |
| In-transit status and expected date for items not yet available | As soon as you know | There is no reminder, and the item is forgotten |
| Exact partial quantities | At dispatch | Invoice quantities will be wrong |

The rule: **nothing leaves the store without a delivery entry.**

## 4. New screens for you

### Customer returns
When material comes back from a customer, open the order and click **Record return**. Tick **restock** if the goods can go back on the shelf. Restocked goods show in stock as **Customer return**.

### Return to vendor
Goods sent back to a supplier are recorded from the purchase invoice with **Return to vendor**. They show in stock as **Returned to vendor** and reduce stock on hand.

### Purchase Orders
**Purchase Orders** shows what has been ordered from suppliers and how much has arrived, so you know what to expect at the store.

### Pending deliveries after a return
If a customer returns goods, that quantity counts as pending again on the order, so a replacement can be dispatched.

## Quick help

**I delivered something but it still shows as pending. Why?**
The delivery probably hasn't been recorded, or the quantity entered was less than what was sent. Open the order in **Orders & Delivery** and check the delivery entries.

**Can I deliver half the quantity now and the rest later?**
Yes. Enter only what you sent. The line shows as Partial, and the rest stays on your pending list.

**The pop-up is long. Can I hide it?**
You can close it for now, but it returns at your next login until the lines are delivered. The best way to shorten it is to record deliveries and set expected dates.

**What is a DC number and do I type it?**
It is the delivery challan number. The system fills it in for you in order, so you don't need to type it.

---

Prepared by Sirah Digital · https://sirahdigital.in/
