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

Keep `app/.env.example` up to date with the names only (no values).

## 3. Deploy

1. Merge the PR into `main` after review and a preview test.
2. Vercel builds and deploys automatically. Database migrations: run the project's migrate script against production **before** you promote a release that needs new columns. Migrations only add things, so the old code keeps working.
3. Smoke test: log in as admin, open the Dashboard, a quotation and an Excel export, then Agents → Run now (dry check), and confirm the agent run log.

## 4. Cron (automation agents)

`app/vercel.json` (or the equivalent config the developers maintain):

```json
{
  "crons": [
    { "path": "/api/agents/run", "schedule": "30 2 * * *" }
  ]
}
```

- `30 2 * * *` UTC is **08:00 IST** every day.
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

## 7. Monitoring and cost

- Vercel: watch function logs and errors, and set up e-mail alerts for failed deployments.
- Neon: watch storage and compute hours on the free tier, with an alert at 80 %.
- Expected monthly cost at go-live: Vercel Hobby or Pro (Pro is needed if a team uses it commercially, so confirm licensing for the client's use), the Neon free or launch tier, and no AI or API costs. Review this after 3 months of real use.

## 8. Meeting transcription tooling (team machine only)

`python -I scripts/transcribe_meeting.py "<video.mp4>" "<topic>"` needs **ffmpeg** on the PATH and `SARVAM_API_KEY` in the **project-root** `.env.local`. It is not deployed to Vercel. See [meetings/README.md](../meetings/README.md).
