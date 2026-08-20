# Paul Douglas Roofing — Business Operating System

One system covering the whole business: every enquiry in one inbox, CRM pipeline from first contact to paid, quotes sent by WhatsApp with automatic chasing, AI-assisted job scheduling by voice, staff app with no price visibility, holidays with enforced notice rules, invoicing into QuickBooks, and a dashboard that answers "how are we doing" in one screen.

Built to the PRD/FRD (v1.0) by DuoLogiq. **Phases 1–3 are complete and working.**

---

## Running it (2 minutes)

```bash
npm run install:all     # installs server + client dependencies
cp .env.example .env    # then edit: set JWT_SECRET at minimum
npm run seed            # loads realistic demo data
npm run build           # builds the web app
npm start               # http://localhost:4000
```

For development with hot reload: `npm run dev` (client on :5173, server on :4000).

### Demo logins

| Role | Email | Password |
|---|---|---|
| Owner / Admin (Paul) | `paul@pauldouglasroofing.co.uk` | `password123` |
| Office (Lisa) | `lisa@pauldouglasroofing.co.uk` | `password123` |
| Field staff (the lads) | `jamie@pauldouglasroofing.co.uk` | `password123` |

Other field staff: `connor@`, `liam@`, `ryan@`, `callum@`, `nathan@` — same password. Sign in as a field staff account to see the phone view the lads get.

`npm run seed:clean` wipes everything and reseeds. To start a real, empty system: wipe the `data/` folder, run the server once, then create the first admin (or run the seed and delete the demo customers).

---

## Works today without a single API key

Every integration runs in **simulated mode** until its credentials are added. Messages, calendar events, invoices and AI proposals all flow through the system and are recorded against the right customer — they simply aren't delivered to the outside world yet. That means the whole workflow can be demonstrated to Paul before spending anything.

Add credentials to `.env` (see `INTEGRATIONS.md` for exactly what to get and where from) and each integration flips to live automatically. No code changes.

Settings → Integrations shows the live/simulated state of every connection, the webhook URLs to paste into Meta/SendGrid, and a running log of integration activity.

**Try it now:** Lead Inbox → the demo simulator buttons inject a WhatsApp/Facebook/email/phone enquiry so you can watch it land, dedupe against existing customers, and move through the pipeline.

---

## What's in it

### Phase 1 — Foundation
- **Unified lead inbox** — WhatsApp, Facebook, email, phone and manual enquiries land in one place, automatically matched to existing customers by phone/email so duplicates aren't created.
- **CRM pipeline** — Enquiry → Site Visit → Quote Pending → Quoted → Follow-Up → Won/Lost → Scheduled → In Progress → Completed → Invoiced → Paid. Drag cards between stages; every move is timestamped and attributed.
- **Customer records** — one chronological timeline per customer covering every call, message, quote, job and invoice across every channel.
- **Site visits** — booked from the CRM into Google Calendar; when the appointment time passes the customer automatically moves to "Quote Pending" and a "produce quote" task appears.
- **Quotes** — line-item builder with VAT, branded PDF, sent by WhatsApp (as a document) or email, with status tracking.
- **Staff accounts & scheduling** — the lads get their own login showing jobs, addresses, times and materials, with prices and financials structurally unavailable to them.

### Phase 2 — Automation
- **Facebook/Meta** — page messages and Lead Ad submissions create or update customers in the same inbox.
- **Automatic quote follow-ups** — configurable sequence (default: WhatsApp after 2 days, email after 5). **Stops instantly the moment the customer replies on any channel** — no risk of chasing someone who's already been in touch.
- **QuickBooks** — invoices raised from completed jobs push into QuickBooks Online (UK); payment status syncs back so paid/part-paid/overdue is visible without logging in separately.
- **Tasks & reminders** — the system raises its own: produce this quote, chase this payment, invoice this job, this job starts tomorrow, this quote expired. Plus anything added manually.
- **Dashboard** — leads by source and over time, site visits, quotes sent, win rate, average job value, pipeline value, outstanding money.

### Phase 3 — AI & workforce
- **AI voice scheduling** — speak (or type) the day's situation. The assistant already knows every unscheduled job, every lad's skills, who drives, who's on holiday and what's already booked. It proposes a schedule; Paul edits any assignment and approves. **Every proposal is validated server-side before Paul ever sees it** — nobody on holiday, nobody double-booked, required skills covered, a driver on each team. Works with no AI key at all via the built-in rule scheduler.
- **Holidays** — the lads request through their app; dates inside the notice window (default 28 days) can't be selected and are rejected server-side too. Approved holiday shows in the scheduling view and is a hard constraint for the AI.
- **Team communication** — per-job chat threads tied to the actual job, plus an all-staff channel.

---

## How the field-staff lockdown works

The PRD requires field staff to be *structurally* unable to retrieve financial data, not merely prevented from seeing it in the UI. That's implemented in two layers:

1. Field staff tokens are rejected by every management route (`/api/customers`, `/api/quotes`, `/api/invoices`, `/api/dashboard`, `/api/jobs`, `/api/tasks`, `/api/leads`) with a 403.
2. They are served only by `/api/staff/*`, where **no SQL query selects a price, value, quote or invoice column**. The data never enters the response, so there is nothing to leak.

`node e2e-test.js` asserts both, including scanning the raw staff response for any currency values.

---

## Verifying it works

With the server running:

```bash
node e2e-test.js
```

This walks the entire journey — enquiry → dedupe → site visit → quote → send → follow-up scheduling → customer reply halting the chase → acceptance → job creation → AI scheduling with constraint validation → completion → invoice → QuickBooks push → payment → PAID — then runs the permission and financial-leak checks. All 44 assertions should pass.

---

## Deploying

The system is one Node process serving both the API and the web app.

```bash
docker compose up -d --build      # or:
npm run install:all && npm run build && npm start
```

Requirements: a small Linux VPS or PaaS in a **UK/EU region** (the PRD requires UK/EU data residency), HTTPS on a domain, and `APP_URL` in `.env` set to that public URL — webhooks and OAuth callbacks derive from it.

The database is a single SQLite file in `data/`. Back that directory up (it holds the database and generated PDFs); daily snapshots retained 30 days meets the PRD. The schema is written in portable SQL, so moving to Postgres later is a contained change if volume ever demands it.

### Automation heartbeat

A cron worker runs every 5 minutes and handles: appointments that have passed (stage advance + quote task), follow-ups that are due, jobs starting tomorrow, jobs whose start date has arrived, completed jobs with no invoice, overdue invoices, expired quotes, Google Calendar changes, and QuickBooks payment status.

---

## Project layout

```
server/
  index.js              Express app, cron scheduler, static hosting
  db.js                 SQLite schema, settings, migrations
  auth.js               JWT auth, role guards
  seed.js               Demo data
  routes/               API endpoints (auth, leads, customers, quotes,
                        jobs, holidays, invoices, tasks, dashboard,
                        chat, settings, staff, webhooks, integrations)
  services/             Business logic — pipeline stages, task engine,
                        follow-ups, message dispatch, PDF, scheduler engine
  integrations/         WhatsApp, Meta, email, Google Calendar,
                        QuickBooks, AI — each live-or-simulated
client/
  src/pages/            Admin screens + staff/ mobile screens
  src/components/       Shared UI, quote builder, week view, job modal
e2e-test.js             Full business-flow + security test
INTEGRATIONS.md         Everything needed to go live, per integration
```

---

## What's not built (deliberately)

Phase 4 is intentionally open in the PRD — it's meant to be shaped by how the business actually uses Phases 1–3. The foundations for it are in place: every AI proposal and Paul's edits are logged (`ai_proposals`) ready to tune the assistant, and the reporting layer can be extended for predictive forecasting.

Also out of scope per the PRD: payroll, full stock control (a materials note per job is included), accounting beyond what QuickBooks does, and native app-store apps — the staff app is an installable PWA, which covers the same ground without app store overhead.

One platform constraint worth repeating: **Meta's API cannot join Paul's existing personal team WhatsApp group.** That's a hard limit on Meta's side, not a build decision. The in-app job chat and all-staff channel are the replacement. Customer-facing WhatsApp is unaffected and works fully.
