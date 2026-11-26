# User Guide: Accounts

This guide is for accounts staff (system role **accounts**). You will keep using **Tally / Vyapar** for statutory accounts and GST returns. In the CRM you raise customer invoices for delivered orders, record payments, approve expenses and keep track of **customer and vendor outstanding**. The system also sends **payment reminder emails** for you.

> We are still confirming with the owner how CRM invoices relate to Tally/Vyapar: which one is the master, and whether we export to Tally (open question Q-11). Until then, follow the owner's instructions, and avoid entering the same invoice differently in two places.

## Your first day

1. Open https://lbe-fire-crm.vercel.app and log in with the email and password your admin gave you.
2. Open **Billing & Outstanding** and look at the ageing view. This is your main screen.
3. Open **Customers** and check that each regular customer has an email address, GSTIN and credit days. Reminders depend on these.
4. Open **Expenses** and look at any vouchers waiting for approval.
5. Open **Email Outbox** to see the reminder emails the system has prepared or sent.

## 1. Daily workflow

### Morning (15 minutes)
1. On the dashboard, open **Ready to invoice**: orders fully delivered but not yet invoiced.
2. **Receivables overdue** and **Payables due this week**.
3. **Expenses awaiting approval**.

### Raising a sales invoice
1. Open **Orders & Delivery**, select the delivered order and click **Create invoice**. For a manual invoice, use **Billing & Outstanding**, then **New tax invoice**.
2. Lines and quantities come from what was delivered. Supply and erection amounts are kept separate.
3. GST is applied for you: **CGST 9 % + SGST 9 %** for Tamil Nadu customers, and **IGST 18 %** for other states. The default is 18 %, but rates can differ by item.
4. Check the customer's GSTIN, billing address and PO reference.
5. Save. You get a number like `LBE/INV/2026-27/0001`. Then print or save as PDF and send it.

### Recording a customer payment
In **Billing & Outstanding**, record the payment: customer, date, mode (bank transfer, UPI, cheque or cash), reference number and amount. Then allocate it to one or more invoices. The outstanding updates straight away.

### Vendor payments
Open the bill in **Purchase Invoices** and click **Record payment**. The payables list updates.

### Approving expenses
In **Expenses**, open the submitted vouchers. Check the amount, category, project, bill or receipt number and any split. Click **Approve** (this adds it to the project cost) or **Reject** with a reason.

### Outstanding reports
- **Customer outstanding:** by customer, with ageing of 0 to 30, 31 to 60, 61 to 90 and over 90 days. You can print a customer statement (ledger).
- **Vendor outstanding:** by vendor, with due dates.

## 2. What the automation agents will do and remind you about

| Agent | What it does |
|---|---|
| Receivables Dunning | **Sends emails to customers** from the company's Office 365 mailbox: on the due date, then every 7 days, up to 4 reminders. Each email lists the invoice number, date, amount, amount received and balance, and you are copied in. It skips customers with no email, customers with reminders turned off, and customers who paid in the last 3 days. After the 4th reminder you get an alert to **call** the customer. |
| Payables Due | Vendor invoices due within 5 days, and those already overdue |
| Data Hygiene | Delivered orders not invoiced after 3 days, expenses waiting more than 5 days for approval, and customers missing an email address or GSTIN |

To stop reminders for a customer (for example, during a dispute or a special arrangement), open the customer in **Customers** and set **Auto reminders** to Off.

## 3. What you need to enter so the system works

| Entry | When | If you skip it |
|---|---|---|
| A sales invoice for each delivered order | Within 3 days of delivery | Revenue and outstanding are wrong, and reminders can't start |
| **Every customer payment**, allocated to invoices | The day it is received | Customers get reminder emails for amounts they have already paid, which is embarrassing |
| Vendor payments | When paid | Payables alerts keep coming |
| Customer credit days and email | When the customer is created or first invoiced | Due dates and reminders are wrong |
| Expense approvals | Within 2 days | Project costs are incomplete, and engineers lose trust in the system |

The most important rule: **record payments the same day**, because reminder emails go out automatically every morning.

## 4. New screens for you

### Advances
When a customer pays before you invoice, go to **Billing > Advances** (or **Record advance** on the order) and record it. Later, use **Apply advance** (on the Advances page or on the invoice) to set it against an invoice. You can never apply more than the invoice balance or the unused advance.

### Credit notes and debit notes
**Returns** shows goods coming back from customers (credit notes) and goods going back to vendors (debit notes). After a credit note is posted, use **Adjust against invoice** to reduce an open invoice. Debit notes can be adjusted against open vendor bills in the same way.

### Net due
Receivables, the Customers list and each customer page show **Invoices due** and **Net due** (invoices due, less unadjusted credit notes and unused advances). For vendors, **Net due** is bills due less unadjusted debit notes.

### Profit & Reports
**Profit & Reports** gives the monthly profit: sales after credit notes, cost of goods, expenses, gross and net profit. You can export it to Excel.

### AMC billing
**AMC Contracts** shows each contract's value and billing frequency, so you know when to raise the AMC invoice.

## Quick help

**A customer says they already paid but still got a reminder. What happened?**
The payment was probably not recorded, or not allocated to that invoice. Record or allocate it in **Billing & Outstanding**, then apologise to the customer. No further reminders will go for that invoice.

**Can I see exactly what email went to a customer?**
Yes. Open **Email Outbox**, or open the invoice to see the reminders sent for it.

**Emails show as "logged" and not "sent". Why?**
The company's Office 365 mailbox hasn't been connected yet. Until it is, emails are only recorded in the outbox. Sirah Digital will switch this on once the mailbox details arrive.

**How do I give a customer a statement of account?**
In **Billing & Outstanding**, open the customer's receivables. You can print the statement or export it to Excel.

**Can I cancel a posted purchase bill?**
No. Posted bills can't be cancelled in the CRM. Raise a debit note in your accounts software and speak to your admin.

---

Prepared by Sirah Digital · https://sirahdigital.in/
