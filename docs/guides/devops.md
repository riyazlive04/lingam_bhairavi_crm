# DevOps Guide

Hosting: **Vercel** (the Next.js 15 app in `app/`) and **Neon Postgres**. Demo mode can run on embedded **PGlite** with no database server at all. Our target is the cheapest tiers that do the job, because the client is careful about budget.

## 1. Environments

| Environment | Vercel | Database | Purpose |
|---|---|---|---|
| Local | `npm run dev` | PGlite (no `DATABASE_URL`) or a Neon dev branch | Development |
| Preview | Automatic for each PR or branch | Neon **preview** branch (never production data with real customers unless it is masked) | Testing and client demos |
| Production | `main` branch | Neon **main** branch | Live use by the client |

Vercel project settings: Root Directory = `app`, Framework = Next.js, Node LTS.

## 2. Environment variables

Set these in Vercel → Project → Settings → Environment Variables, separately for Production and Preview.

| Variable | Example or value | Notes |
|---|---|---|
| `DATABASE_URL` | `postgres://user:pass@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require` | Use the **pooled** connection string for serverless. Pick the Neon region closest to India (for example Singapore). If it is not set, the app runs in PGlite demo mode. |
| `AUTH_SECRET` | 32+ random bytes (`openssl rand -base64 32`) | Use a different value in each environment |
| `CRON_SECRET` | 32+ random bytes | Vercel Cron sends it as `Authorization: Bearer <CRON_SECRET>` |
| `SMTP_HOST` | `smtp.office365.com` | Office 365 |
| `SMTP_PORT` | `587` | STARTTLS |
| `SMTP_USER` | The client's sending mailbox (to be provided, A-04) | The mailbox must have **SMTP AUTH enabled** in the Microsoft 365 admin centre (Users → mailbox → Mail → Manage email apps → Authenticated SMTP). If the tenant's Security Defaults block basic SMTP AUTH, the client's admin must allow it for this mailbox, or e-mail sending will fail. |
| `SMTP_PASS` | Mailbox password (or an app password if MFA is on) | Production only |
| `SMTP_FROM` | For example `"Linga Bhairavi Enterprise <accounts@client-domain>"` | Must be the SMTP_USER mailbox, or one it has *Send As* rights for |
| `SHOW_DEMO_LOGINS` | `1` (demo only) | Shows the demo credentials on the login page. **Remove it at go-live.** |
| `SEED_V2_DEMO` | `1` (demo only, version 2) | Adds the version 2 demo data (vendor POs, returns and credit notes, advances, AMC contracts, visits and service calls) to a database that was created under version 1. It runs once, then the settings key `migrations.v2_demo_seeded` stops it running again. **Remove it at go-live**, and never set it on a database that holds real client data. |

Keep `app/.env.example` up to date with the names only (no values).

## 3. Deploy

1. Merge the PR into `main` after review and a preview test.
2. Vercel builds and deploys automatically. Database migrations are embedded in the bundle (`app/src/db/migrations.generated.ts`, built by `node scripts/embed-migrations.mjs`) and applied by the app itself at cold start, under a Postgres advisory lock, so two cold starts cannot race. There is no separate migrate step. Migrations only add things, so the old code keeps working.
3. Smoke test: log in as admin, open Home, a quotation and an Excel export, then Automation agents, Run now, and confirm the agent run log.

### 3.1 Version 2 upgrade path (existing databases)

Version 2 ships one new migration, `app/drizzle/0001_v2_returns_amc_po_approval.sql`. It is **additive only**: new tables (`purchase_orders`, `purchase_order_lines`, `sales_returns`, `sales_return_lines`, `purchase_returns`, `purchase_return_lines`, `payment_allocations`, `amc_contracts`, `amc_visits`, `service_calls`) and new columns with defaults (for example `quotation_lines.cost_date`, `quotations.approval_status`, `delivery_lines.cost_rate`, `payments.is_advance`). There is no `DROP`, `DELETE` or `TRUNCATE`.

What happens on the first boot after the deploy (`app/src/db/index.ts`):

1. The migration is applied as usual.
2. If the database is empty, the normal first-boot seed runs (it already includes the version 2 demo data).
3. If the database already has users, `upgradeExisting()` runs once:
   - it backfills the price date and supplier on old quotation lines and the cost rate on old delivery lines, then sets the settings key `migrations.v2_backfill_done`;
   - only when `SEED_V2_DEMO=1`, it adds the version 2 demo data, then sets `migrations.v2_demo_seeded`.
4. The upgrade is wrapped in `try/catch`. If it fails, the error is logged and the app still boots.

Things to know:

- The **first cold start after the deploy waits for the backfill**, so the first page load is slower. Open the site yourself straight after deploying.
- Two cold starts at the same moment may both run the backfill. That is safe, because it only touches rows that have not been filled yet.
- To re-run a step on purpose (for example on a restored copy), delete its settings key and restart.
- Before deploying version 2 to a database with real data, take a Neon branch snapshot (see §5). We tested the upgrade on a copy of the version 1 database first, and you should do the same.

## 4. Cron (automation agents)

`app/vercel.json` (or the equivalent config the developers maintain):

```json
{
  "crons": [
    { "path": "/api/cron/agents", "schedule": "30 2 * * *" }
  ]
}
```

- `30 2 * * *` UTC is **08:00 IST** every day. The region is `bom1` (Mumbai).
- One run covers all 12 agents, including the version 2 AMC & Service agent and the approvals check inside Data Hygiene.
- On the Vercel Hobby plan, cron jobs are limited (daily at most, and not exact to the minute). Daily is all we need, but confirm the current plan limits before go-live.
- The endpoint rejects any request without the correct `CRON_SECRET`.
- Monitoring: Admin → Agents shows the last run. If there has been no run for 26 hours, show the admin a red banner.

## 5. Backups (Neon)

- Neon keeps history for **point-in-time restore**. The window depends on the plan, so check the retention and upgrade if the client needs more than the free tier gives.
- Before every schema migration, create a Neon **branch** snapshot named `pre-migrate-YYYYMMDD`.
- Every week, take a `pg_dump` to an encrypted file stored in the client's Office 365 OneDrive (outside Neon). Every month, test a restore into a scratch Neon branch and run the smoke test.

## 6. Rollbacks

| Problem | Action |
|---|---|
| Bad app release | Vercel → Deployments → the previous good deployment → **Instant Rollback** (promote). Because migrations only add things, the older build works with the newer schema. |
| Bad data change or migration | Restore Neon to a point in time **into a new branch**, check it, then switch `DATABASE_URL` (or copy the affected rows back). Never restore over production without checking. |
| E-mail flood or agent bug | Admin → Settings → Agents → disable the agent. Or remove `SMTP_PASS` in Vercel to stop all e-mail at once, then redeploy. |

## 7. Go-live data clearing

At go-live we keep the masters (items and prices, BOQ templates, vendors, customers, settings) and clear the demo transactions. Take a Neon branch snapshot first. Then clear the transaction tables, children before parents:

- Version 1: `alerts`, `email_outbox`, `agent_runs`, `audit_log` (optional), `follow_ups`, `quotation_lines`, `quotations`, `delivery_lines`, `deliveries`, `sales_order_lines`, `sales_orders`, `sales_invoice_lines`, `sales_invoices`, `payments`, `purchase_invoice_lines`, `purchase_invoices`, `price_history` (demo rows), `vendor_items` (demo rows), `stock_movements`, `stock_allocations`, `expense_allocations`, `expenses`, `projects`, `refill_services`, `extinguisher_assets`.
- **Version 2, also clear:** `payment_allocations`, `purchase_order_lines`, `purchase_orders`, `sales_return_lines`, `sales_returns`, `purchase_return_lines`, `purchase_returns`, `amc_visits`, `amc_contracts`, `service_calls`.
- Reset the document counters in `sequences` so real numbering starts at 0001.
- Delete or deactivate the demo users and create the real ones.
- Remove `SHOW_DEMO_LOGINS` **and** `SEED_V2_DEMO` from the Vercel environment, then redeploy.

Check the exact list against `app/src/db/schema.ts` on the day, in case tables were added after this guide was written.

## 8. Monitoring and cost

- Vercel: watch function logs and errors, and set up e-mail alerts for failed deployments.
- Neon: watch storage and compute hours on the free tier, with an alert at 80 %.
- Expected monthly cost at go-live: the Neon free or launch tier, and no AI or API costs. **Vercel Hobby is for personal, non-commercial use only**, so for the client's business use move the project to **Vercel Pro** (one paid seat is enough) or host it on a small VPS (Node.js with Postgres, or Neon). Review the cost after 3 months of real use.

## 9. Meeting transcription tooling (team machine only)

`python -I scripts/transcribe_meeting.py "<video.mp4>" "<topic>"` needs **ffmpeg** on the PATH and `SARVAM_API_KEY` in the **project-root** `.env.local`. It is not deployed to Vercel. See [meetings/README.md](../meetings/README.md).
