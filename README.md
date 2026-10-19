# Finance Hub

A personal finance tracker for **Darsh**, **Bhakti** and an **admin** who can see everything.

- **Expenses**: amount, date, category, payment mode (**UPI / Card / Cash**), which card or UPI app, merchant, description, need vs want, tags and notes. Search, filters and CSV export.
- **Earnings**: salary, freelance, bonus and more.
- **Investments**: monthly plans (SIPs, RDs, PPF…) with one-tap "log this month", a log of one-off investments, and **stock holdings** with P&L (prices refresh from Yahoo Finance's free endpoint, or enter them by hand).
- **Credit cards**: statement day and due day per card. The app works out each bill, its due date, unbilled spend and limit used, and lets you mark bills paid.
- **Reminders**: a push notification every evening to log the day's transactions, plus one in the morning the **day before** each credit card bill is due and each SIP is debited (skipped if the bill is already paid or the SIP already logged). If nothing has been logged today, an in-app banner shows as well.
- **AI advisor (free)**: tells you how much to invest this month, how to split it, and where to cut spending. Uses a free AI tier (Groq or Google Gemini) or a local model (Ollama). With no key at all, a built-in rule-based advisor (50/30/20 budget, savings rate, emergency fund, card usage, stock concentration) still works.
- **Admin**: sees everyone's data through a "Viewing" switcher, can add people and reset passwords.
- Installable on your phone (PWA), with light and dark mode.

## Run it

Needs **Node.js 22**.

```bash
npm install
npm run build        # builds the web app
npm start            # http://localhost:3000
```

On first start three accounts are created:

| User   | Password    | Role  |
|--------|-------------|-------|
| darsh  | `darsh123`  | user  |
| bhakti | `bhakti123` | user  |
| admin  | `admin123`  | admin |

**Change these passwords right away** in Settings (or set `DARSH_PASSWORD` etc. in `.env` before the first start).

Want to look around first? `DB_PATH=./data/demo.db npm run demo` fills a separate database with three months of sample data. Start the server with the same `DB_PATH` to see it.

For development with hot reload: `npm install && npm --prefix client install && npm run dev`, then open http://localhost:5173.

## Turn on the free AI

Copy `.env.example` to `.env` and add **one** of these:

- **Groq** (recommended, fast): create a free key at https://console.groq.com/keys and set `GROQ_API_KEY=...`
- **Google Gemini**: create a free key at https://aistudio.google.com/apikey and set `GEMINI_API_KEY=...`
- **Ollama** (runs on your own computer, fully offline): install it from https://ollama.com, run `ollama pull llama3.1`, then set `OLLAMA_URL=http://localhost:11434`

Restart the server. The AI advisor page shows which one is in use. Free tiers have rate limits, which is plenty for a few people. The app sends your monthly summary (totals by category, payment mode, top merchants, SIPs, holdings, card bills) to the provider you choose. Individual transaction notes are not sent.

## Reminders and notifications

1. Open **Settings → Notifications on this device → Turn on** on each phone or computer.
2. Pick your daily reminder time.

Notes:
- Push notifications need the app served over **HTTPS** (or `localhost`).
- **iPhone**: open the site in Safari, tap Share → **Add to Home Screen**, open the app from the home screen, then turn notifications on (iOS 16.4+).
- Reminders are sent by the server's scheduler, or on Vercel by the cron job (see below).

## Deploy free on Vercel

Vercel's free plan has no permanent disk, so the database lives on **Turso** (free hosted SQLite). Reminders run on Vercel's own free scheduled jobs, so nothing else is needed. Takes about 10 minutes.

### 1. Create the database (Turso, free)
1. Sign up at https://turso.tech and create a database. Pick the region closest to you, e.g. Mumbai (`aws-ap-south-1`).
2. On the database page, copy the **URL** (`libsql://….turso.io`) and click **Create token** to get an **auth token**.

### 2. Deploy (Vercel, free)
1. At https://vercel.com/new, import the `finance-hub` GitHub repository. Leave Framework Preset as **Other**. `vercel.json` already sets the build.
2. Before clicking Deploy, open **Environment Variables** and add:

| Name | Value |
|------|-------|
| `DATABASE_URL` | the Turso URL |
| `DATABASE_AUTH_TOKEN` | the Turso token |
| `JWT_SECRET` | a long random string (e.g. from https://generate-random.org/api-key-generator) |
| `CRON_SECRET` | another long random string |
| `DARSH_PASSWORD` | Darsh's first password |
| `BHAKTI_PASSWORD` | Bhakti's first password |
| `ADMIN_PASSWORD` | the admin's first password |
| `GROQ_API_KEY` *(or `GEMINI_API_KEY`)* | optional, for written AI advice |
| `TZ_NAME` | optional, defaults to `Asia/Kolkata` |

   The app will not start on Vercel without `JWT_SECRET` and the three passwords, so the default `admin123`-style passwords are never online.
3. Click **Deploy**. Open the `…vercel.app` link and sign in.

### 3. Reminders
Nothing to set up: `vercel.json` registers two daily jobs (the free plan allows two, each once a day):

| Job | Time (IST) | Sends |
|-----|-----------|-------|
| `/api/cron/evening` | about 9 PM | "Log today's transactions" to everyone with reminders on |
| `/api/cron/morning` | about 9 AM | Credit card bills and SIPs due **tomorrow** (skipped if already paid or logged) |

Each person just opens **Settings → Turn on** notifications on their phone. Vercel may run a job some minutes after the hour it is scheduled for, so expect them roughly between 8:30 and 9:30. On Vercel the evening time is the same for everyone. The per-person reminder time in Settings applies when you self-host (below).

Changed a variable later? Redeploy from the Vercel dashboard (Deployments → ⋯ → Redeploy) so it takes effect.

## Other hosting

To run it as a normal long-lived server instead (a home computer with Cloudflare Tunnel, an Oracle Cloud "Always Free" VM, Railway, Fly.io…), use `npm run build && npm start`. Data lives in `data/finance.db` (back it up now and then), or point `DATABASE_URL` at Turso. Reminders are sent by the built-in scheduler, and each person can pick their own evening reminder time in Settings.

## Project layout

```
api/index.js       Vercel serverless entry (wraps the Express app)
server/            Express API, SQLite/libSQL schema, reminder scheduler, AI + rule-based advisor
  routes/          expenses, income, investments & SIPs, holdings, cards, insights, push, users
  lib/             auth, CRUD helper, card billing cycle, insights, LLM client, push, scheduler
  test/            API tests (npm test)
client/            React + Vite + Tailwind + shadcn/ui web app (PWA)
  src/components/ui/   shadcn/ui components (add more with `npx shadcn@latest add <name>`)
```
