# Finance Hub

A personal finance tracker for **Darsh**, **Bhakti** and an **admin** who can see everything.

- **Expenses**: amount, date, category, payment mode (**UPI / Card / Cash**), which card or UPI app, merchant, description, need vs want, tags and notes. Search, filters and CSV export.
- **Earnings**: salary, freelance, bonus and more.
- **Investments**: monthly plans (SIPs, RDs, PPF…) with one-tap "log this month", a log of one-off investments, and **stock holdings** with P&L (prices refresh from Yahoo Finance's free endpoint, or enter them by hand).
- **Credit cards**: statement day and due day per card. The app works out each bill, its due date, unbilled spend and limit used, and lets you mark bills paid.
- **Reminders**: a push notification every evening (default 9:30 PM, set your own time) to log the day's transactions, plus alerts before card bills are due and on SIP days. If nothing has been logged, an in-app banner shows as well.
- **AI advisor (free)**: tells you how much to invest this month, how to split it, and where to cut spending. Uses a free AI tier (Groq or Google Gemini) or a local model (Ollama). With no key at all, a built-in rule-based advisor (50/30/20 budget, savings rate, emergency fund, card usage, stock concentration) still works.
- **Admin**: sees everyone's data through a "Viewing" switcher, can add people and reset passwords.
- Installable on your phone (PWA), with light and dark mode.

## Run it

Needs **Node.js 22.13 or newer**. It uses Node's built-in SQLite, so nothing needs compiling.

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
- The server must be running at reminder time to send them. Free hosts that "sleep" when idle will miss reminders (see below).

## Hosting

The app is a single Node process with a SQLite file, so any host with a **persistent disk** works:

- A home computer or Raspberry Pi, with a free tunnel such as Cloudflare Tunnel for HTTPS
- An Oracle Cloud "Always Free" VM, or any small VPS
- Railway or Fly.io, with a volume mounted at `./data`

Set `NODE_ENV=production`, a long random `JWT_SECRET`, and `TZ_NAME` (defaults to `Asia/Kolkata`). Back up `data/finance.db` now and then.

## Project layout

```
server/            Express API, SQLite schema, reminder scheduler, AI + rule-based advisor
  routes/          expenses, income, investments & SIPs, holdings, cards, insights, push, users
  lib/             auth, CRUD helper, card billing cycle, insights, LLM client, push, scheduler
  test/            API tests (npm test)
client/            React + Vite + Tailwind web app (PWA)
```
