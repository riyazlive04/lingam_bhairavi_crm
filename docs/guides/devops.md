# DevOps Guide

Hosting: **Vercel** (Next.js 15 app in `app/`) + **Neon Postgres**. Demo mode can run on embedded **PGlite** without any database server. Target: lowest-cost tiers that meet the need (client is budget-conscious).

## 1. Environments

| Environment | Vercel | Database | Purpose |
|---|---|---|---|
| Local | `npm run dev` | PGlite (no `DATABASE_URL`) or Neon dev branch | Development |
| Preview | Auto per PR/branch | Neon **preview** branch (never production data with real customers unless masked) | Testing, client demos |
| Production | `main` branch | Neon **main** branch | Live use by the client |

Vercel project settings: Root Directory = `app`; Framework = Next.js; Node LTS.

## 2. Environment variables

Set in Vercel → Project → Settings → Environment Variables (separately for Production and Preview).

| Variable | Example / value | Notes |
|---|---|---|
| `DATABASE_URL` | `postgres://user:pass@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require` | Use the **pooled** connection string for serverless. Choose the Neon region closest to India (e.g. Singapore). Absent → PGlite demo mode. |
| `AUTH_SECRET` | 32+ random bytes (`openssl rand -base64 32`) | Different per environment |
| `CRON_SECRET` | 32+ random bytes | Vercel Cron sends it as `Authorization: Bearer <CRON_SECRET>` |
| `SMTP_HOST` | `smtp.office365.com` | Office 365 |
| `SMTP_PORT` | `587` | STARTTLS |
| `SMTP_USER` | the client's sending mailbox (to be provided, A-04) | Mailbox must have **SMTP AUTH enabled** in Microsoft 365 admin (Users → mailbox → Mail → Manage email apps → Authenticated SMTP). If the tenant has Security Defaults blocking basic SMTP AUTH, the client's admin must allow it for this mailbox or e-mail sending will fail. |
| `SMTP_PASS` | mailbox password (or app password if MFA) | Production only |
| `SMTP_FROM` | e.g. `"Linga Bhairavi Enterprise <accounts@client-domain>"` | Must be the SMTP_USER mailbox or one it has *Send As* rights for |

Keep an up-to-date `app/.env.example` with names only (no values).

## 3. Deploy

1. Merge PR to `main` after review and preview test.
2. Vercel builds and deploys automatically. Database migrations: run the project's migrate script against production **before** promoting a release that needs new columns (migrations are additive so old code keeps working).
3. Smoke test: login as admin; open Dashboard, a quotation, Excel export; Agents → Run now (dry check); confirm agent run log.

## 4. Cron (automation agents)

`app/vercel.json` (or equivalent config maintained by developers):

```json
{
  "crons": [
    { "path": "/api/agents/run", "schedule": "30 2 * * *" }
  ]
}
```

- `30 2 * * *` UTC = **08:00 IST** daily.
- On the Vercel Hobby plan cron jobs are limited (daily frequency, timing not exact to the minute) — daily is all we need. Confirm current plan limits before go-live.
- Endpoint rejects requests without the correct `CRON_SECRET`.
- Monitor: Admin → Agents shows the last run; if no run in 26 h, show a red banner to admin.

## 5. Backups (Neon)

- Neon keeps history for **point-in-time restore** (window depends on plan; check retention and upgrade if the client needs > what the free tier offers).
- Before every schema migration: create a Neon **branch** snapshot named `pre-migrate-YYYYMMDD`.
- Weekly `pg_dump` to encrypted file stored in the client's Office 365 OneDrive (outside Neon). Monthly test restore into a scratch Neon branch and run the smoke test.

## 6. Rollbacks

| Problem | Action |
|---|---|
| Bad app release | Vercel → Deployments → previous good deployment → **Instant Rollback** (promote). Additive migrations mean the older build works with the newer schema. |
| Bad data change / migration | Restore Neon to a point in time **into a new branch**, verify, then switch `DATABASE_URL` (or copy affected rows back). Never restore over production blindly. |
| E-mail flood / agent bug | Admin → Settings → Agents → disable the agent; or remove `SMTP_PASS` in Vercel to stop all e-mail immediately; redeploy. |

## 7. Monitoring and cost

- Vercel: function logs and errors; set up e-mail alerts for failed deployments.
- Neon: storage and compute hours on the free tier; alert at 80 %.
- Expected monthly cost at go-live: Vercel Hobby or Pro (Pro required if used commercially by a team — confirm licensing for the client's use), Neon free/launch tier, no AI/API costs. Review after 3 months of real usage.

## 8. Meeting transcription tooling (team machine only)

`python -I scripts/transcribe_meeting.py "<video.mp4>" "<topic>"` needs **ffmpeg** on PATH and `SARVAM_API_KEY` in the **project-root** `.env.local`. This is not deployed to Vercel. See [meetings/README.md](../meetings/README.md).
