# System Understanding — Paul Douglas Roofing Business OS

> Generated from codebase review. Last updated: September 2026.

This document captures the current state of the **pdr-system** repository: what is built today, what remains, and how the pieces connect.

---

## 1. Executive Summary

**Paul Douglas Roofing — Business Operating System** is an internal CRM and operations platform for a UK roofing contractor. It covers the full sales-to-cash cycle: lead capture → pipeline → site visits → quotes → jobs → scheduling → timesheets → invoicing → payment tracking, with automation, integrations, and a separate field-staff mobile PWA.

| Layer | Status | Description |
|-------|--------|-------------|
| **Backend API** | **Built** | Express 4, SQLite (`better-sqlite3`), JWT auth, cron automation |
| **Admin web app** | **Built** | React 18 + Vite — dashboard, inbox, pipeline, quotes, schedule, invoices, etc. |
| **Field staff PWA** | **Built** | Mobile-first `/staff/*` routes; structurally excludes financial data |
| **Integrations** | **Architecturally complete** | WhatsApp, Meta, email, Google Calendar, QuickBooks, AI — all have simulated fallback |
| **Phases 1–3 (PRD)** | **Complete** | End-to-end business flow verified by `e2e-test.js` (44 assertions) |
| **Phase 4** | **Not started** | Predictive forecasting, advanced reporting (intentionally deferred) |
| **Requirements backlog** | **~30–40% remaining** | See §6 — gaps vs `docs/requirements.md` |

Built to the PRD/FRD (v1.0) by DuoLogiq. The README is the authoritative runbook; this document maps implementation status against the requirements spec.

**Related but separate:** A public marketing website (Astro on Cloudflare Pages) exists in a different repository. It can POST enquiries to a webhook URL; this CRM does not yet consume that webhook endpoint.

---

## 2. Business Context

- **Company:** Paul Douglas Roofing and Building Ltd
- **Domain:** UK roofing and building — enquiries, site visits, quotes, jobs, crew scheduling, invoicing
- **Users:** Director (owner), office staff, field operatives
- **Compliance focus:** UK VAT, CIS, reverse charge, retention, Consumer Contracts Regulations wording on domestic quotes
- **Data residency:** Designed for UK/EU hosting (SQLite file + generated PDFs in `data/`)

---

## 3. Technology Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| **Monorepo layout** | Root `package.json` orchestrating `server/` + `client/` | Not an Nx workspace |
| **Backend** | Node.js, Express 4 | Single process serves API + built SPA |
| **Database** | SQLite (`better-sqlite3`, WAL mode) | File at `data/pdr.db`; portable SQL with boot-time `ALTER TABLE` migrations |
| **ORM** | Raw SQL | Requirements specify PostgreSQL + Sequelize — **not yet migrated** |
| **Auth** | JWT in httpOnly cookies (+ Bearer header) | Roles: `ADMIN`, `OFFICE`, `STAFF` |
| **Frontend** | React 18, Vite 6, React Router 7 | Tailwind CSS 3, Recharts, Lucide icons |
| **PDF** | PDFKit | Branded quote and invoice PDFs |
| **Automation** | `node-cron` | 5-minute heartbeat for stage advances, follow-ups, tasks, sync |
| **Deploy** | Docker Compose or `npm start` | `Dockerfile` + `docker-compose.yml` included |
| **Testing** | Custom Node scripts | `test-uktax.js`, `e2e-test.js`, `test-features.js` — no Jest/Vitest/RTL |

### Role mapping (code ↔ requirements)

| Code | Requirements term | Access |
|------|-------------------|--------|
| `ADMIN` | Director | Full access including pay rates and job costing |
| `OFFICE` | Office | Operational access; financial restrictions per-user **not yet implemented** |
| `STAFF` | Operative | Field PWA only; structurally blocked from financial API columns |

---

## 4. Architecture

### 4.1 Request flow

```
Browser (admin or staff PWA)
    │
    ▼
Express (server/index.js)
    ├── /api/webhooks/*     ← Meta, email, Twilio (no session auth)
    ├── /api/*              ← JWT-protected management routes
    ├── /api/staff/*        ← STAFF role only; SQL allowlists exclude prices
    ├── /public-files/*     ← HMAC-signed PDF URLs for WhatsApp/Meta
    └── /*                  ← React SPA (client/dist)
```

### 4.2 Business flow (implemented)

```
Enquiry (inbox) → Customer + Pipeline
    → Site visit (Google Calendar) → Quote Pending + task
    → Quote (UK tax, PDF, WhatsApp/email) → Follow-up sequence
    → Accept → Job → AI/rule scheduling → Complete
    → Invoice (QuickBooks push) → Payment → PAID
```

### 4.3 Field-staff security model

Two layers enforce PRD requirement 1.5:

1. **Route guards** — `STAFF` tokens receive 403 on all management routes (`/api/customers`, `/api/quotes`, `/api/invoices`, etc.).
2. **SQL allowlists** — `/api/staff/*` queries never select price, value, quote, or invoice columns. Data cannot leak via the API even if the UI were modified.

Verified by `e2e-test.js` including a scan of raw staff responses for currency values.

### 4.4 Automation heartbeat (every 5 minutes)

- Appointments passed → stage advance to `QUOTE_PENDING` + "produce quote" task
- Due quote follow-ups (halted on customer reply)
- Jobs starting tomorrow / jobs whose start date arrived
- Completed jobs without invoices → invoice task
- Overdue invoices, expired quotes
- Google Calendar sync, QuickBooks payment status polling

---

## 5. Implemented Features (by module)

Status key: **Done** = core requirement met · **Partial** = working but incomplete vs spec · **Missing** = not built

### 5.1 Access & Identity (ACC)

| Req | Status | Implementation |
|-----|--------|----------------|
| 1.1 PostgreSQL + Sequelize | **Missing** | SQLite + raw SQL; boot-time migrations in `server/db.js` |
| 1.2 Email/password auth | **Done** | `server/routes/auth.js`, `server/auth.js` |
| 1.3 httpOnly session cookies | **Done** | JWT in cookie + Bearer support |
| 1.4 Three-role model | **Done** | `ADMIN` / `OFFICE` / `STAFF` |
| 1.5 Route guards + operative financial exclusion | **Done** | Guards + `/api/staff/*` SQL allowlists |
| 1.6 Per-user financial restrictions (Office) | **Missing** | All `OFFICE` users see costing data |
| 1.7 User lifecycle | **Partial** | Create + deactivate in Settings; no password reset, no edit-existing-user modal |
| 1.8 Skills, driver flag, pay rates | **Partial** | DB columns exist (`skills`, `is_driver`, `hourly_cost`, `cis_status`); no Settings UI for pay/CIS |
| 1.9 Audit logging, forced logout on role change | **Missing** | Activity log exists for customers, not security audit |

### 5.2 Customers (CRM)

| Req | Status | Implementation |
|-----|--------|----------------|
| 2.1 Domestic/commercial records | **Partial** | `customer_type`, `company_name`, `vat_number` in DB + PDFs; no customer-form UI |
| 2.2 Multiple site addresses | **Missing** | Single `address` + `postcode` per customer |
| 2.3 Unified activity timeline | **Done** | Messages, activity, quotes, jobs, invoices, appointments, leads, follow-ups, stage history |
| 2.4 Attachments | **Missing** | No photo/document upload on customer records |
| 2.5 Duplicate detection + search | **Partial** | Phone/email normalisation + dedupe on ingest; basic text search only |
| 2.6 Source, lost reason, CSV import | **Partial** | Source + lost reason done; CSV import missing |

**Key paths:** `server/routes/customers.js`, `client/src/pages/CustomerDetail.jsx`

### 5.3 Enquiry Inbox (INB)

| Req | Status | Implementation |
|-----|--------|----------------|
| 3.1 Unified inbox | **Done** | `client/src/pages/Inbox.jsx` |
| 3.2 Multi-channel inbound | **Done** | WhatsApp, Facebook, Lead Ads, email, Twilio SMS/voice via `server/routes/webhooks.js` |
| 3.3 Manual quick-add | **Done** | Log enquiry form + demo simulator |
| 3.4 Customer matching + dedupe | **Done** | `server/services/messenger.js` → `matchCustomer()` |
| 3.5 Status, replies, tagging, ageing | **Partial** | NEW/ACTIONED/CONVERTED/CLOSED + channel replies; no tags or ageing indicators |

**Key paths:** `server/routes/leads.js`, `server/services/messenger.js`

### 5.4 Pipeline (PIP)

| Req | Status | Implementation |
|-----|--------|----------------|
| 4.1 Kanban board | **Done** | 12 stages (spec says 11; implementation adds `PAID`) |
| 4.2 Drag-and-drop + audit | **Done** | `stage_history` + `activity` via `server/services/pipeline.js` |
| 4.3 Auto-progression | **Done** | Appointments, quotes, jobs, invoices, follow-ups trigger stage changes |
| 4.4 Filters (source, owner, date, value) | **Missing** | Board loads all customers; `owner_id` column never populated |
| 4.5 Pipeline value + stalled deals | **Partial** | Pipeline value on dashboard; no stalled-deal indicators |

**Stages:** `ENQUIRY` → `SITE_VISIT_BOOKED` → `QUOTE_PENDING` → `QUOTED` → `FOLLOW_UP` → `WON` / `LOST` → `SCHEDULED` → `IN_PROGRESS` → `COMPLETED` → `INVOICED` → `PAID`

**Key paths:** `server/services/pipeline.js`, `client/src/pages/Pipeline.jsx`

### 5.5 Appointments (APT)

| Req | Status | Implementation |
|-----|--------|----------------|
| 5.1 Site visit booking | **Done** | `client/src/components/BookVisit.jsx` |
| 5.2 Google Calendar sync + auto-progression | **Done** | `server/integrations/gcal.js`; cron advances stage after visit |
| 5.3 Reschedule, cancel, type categorisation | **Partial** | Reschedule/cancel done; no appointment types |

### 5.6 Quoting (QUO)

| Req | Status | Implementation |
|-----|--------|----------------|
| 6.1 Catalogue-driven line items | **Missing** | Manual line-item builder only |
| 6.2 Roof area + pitch calculations | **Missing** | — |
| 6.3 UK VAT, CIS, reverse charge | **Done** | `server/services/ukTax.js` — per-line VAT, labour/materials split |
| 6.4 Retention, staged payments, provisional sums | **Done** | Quote schema + PDF |
| 6.5 Multi-option quotes, optional extras | **Missing** | Single quote per build |
| 6.6 Branded PDF + cancellation notices | **Done** | `server/services/pdf.js` |
| 6.7 WhatsApp/email distribution + acceptance | **Done** | Send, accept/decline → auto job creation |

**Key paths:** `server/routes/quotes.js`, `client/src/components/QuoteBuilder.jsx`, `client/src/pages/Quotes.jsx`

### 5.7 Jobs (JOB)

| Req | Status | Implementation |
|-----|--------|----------------|
| 7.1 Auto-create from accepted quote | **Done** | Inherits scope, value, address |
| 7.2 Status lifecycle, crew assignment, skills | **Done** | `server/routes/jobs.js`, `JobModal.jsx` |
| 7.3 Materials + checklists | **Partial** | Materials text field only; no templated checklists |
| 7.4 Photos, attachments, progress notes | **Missing** | Notes field only |
| 7.5 Per-job chat, variations | **Partial** | Job chat done; no formal variation management |

### 5.8 Scheduling (SCH)

| Req | Status | Implementation |
|-----|--------|----------------|
| 8.1 Week view + unscheduled queue | **Done** | `client/src/pages/Schedule.jsx`, `WeekView.jsx` |
| 8.2 Crew assignment, holiday overlay, double-booking prevention | **Done** | Manual assign + AI validator blocks conflicts |
| 8.3 Skill warnings, driver allocation, change notifications | **Partial** | AI validator checks skills/drivers; no manual UI warnings or change notifications |

**AI scheduling:** Voice or text input → LLM or rule-based proposal → server-side constraint validation → human approval. Proposals logged in `ai_proposals` table.

**Key paths:** `server/services/schedulerEngine.js`, `server/integrations/ai.js`

### 5.9 Timesheets (TIM)

| Req | Status | Implementation |
|-----|--------|----------------|
| 9.1 Clock in/out, single active shift | **Done** | `server/services/timesheets.js`, `ClockWidget.jsx` |
| 9.2 GPS + distance-from-site flags | **Partial** | Logic exists; `jobs.lat/lng` must be set manually (no geocoding) |
| 9.3 Live "on the clock" board | **Done** | Office timesheets view |
| 9.4 Review, approval, corrections, payroll CSV | **Done** | Batch approval, edit with reason, `/api/timesheets/export.csv` |

**Job costing:** Quoted value vs labour cost in Timesheets → Costing tab (visible to all `OFFICE` users, not Director-only).

### 5.10 Holidays (HOL)

| Req | Status | Implementation |
|-----|--------|----------------|
| 10.1 Requests with minimum notice | **Done** | Default 28 days; enforced client + server |
| 10.2 Approval/decline with reason | **Done** | Office + staff views |
| 10.3 Allowance + calendar integration | **Done** | `holiday_allowance` per user; blocks AI scheduler |

### 5.11 Invoicing (INV)

| Req | Status | Implementation |
|-----|--------|----------------|
| 11.1 Generate from completed jobs | **Done** | Pre-fills from quote lines |
| 11.2 UK VAT and CIS on invoices | **Partial** | Simple `computeTotals()` — does not reuse full `ukTax.js` engine |
| 11.3 Branded PDF + email | **Done** | `server/services/pdf.js`, email send |
| 11.4 Payment tracking, overdue detection | **Done** | Manual payments, QuickBooks sync, stage → `PAID` |

### 5.12 Automation (AUT)

| Req | Status | Implementation |
|-----|--------|----------------|
| 12.1 Quote follow-up sequences | **Done** | Configurable steps; halts on customer reply |
| 12.2 System task generation | **Done** | `server/services/taskEngine.js` — deduplicated by `rule_key` |
| 12.3 Task list views | **Done** | Open/done/dismissed in `client/src/pages/Tasks.jsx` |

### 5.13 Notifications (NOT)

| Req | Status | Implementation |
|-----|--------|----------------|
| 13.1 In-app notification centre + email alerts | **Missing** | Tasks partially substitute; no notification module |
| 13.2 Per-user preferences + unread badges | **Missing** | — |

### 5.14 Reporting (REP)

| Req | Status | Implementation |
|-----|--------|----------------|
| 14.1 Management dashboard | **Done** | KPIs, charts, date range filter (`client/src/pages/Dashboard.jsx`) |
| 14.2 CSV exports for all reports | **Partial** | Timesheet CSV only |
| 14.3 Director-only profitability | **Partial** | Costing exists in Timesheets; not restricted to `ADMIN` |

### 5.15 Assistants (AI)

| Req | Status | Implementation |
|-----|--------|----------------|
| 15.1 Voice capture + transcription | **Done** | Browser speech-to-text; optional OpenAI Whisper server-side |
| 15.2 AI quote wording / catalogue suggestions | **Missing** | Scheduling AI only |
| 15.3 Schedule proposals + constraint validation | **Done** | `schedulerEngine.js` |
| 15.4 Human approval gate | **Done** | Proposals require explicit approval before commit |

### 5.16 Integrations (INT)

| Req | Status | Implementation |
|-----|--------|----------------|
| 16.1 WhatsApp Business | **Done** | `server/integrations/whatsapp.js` — live or simulated |
| 16.2 Meta (Facebook + Lead Ads) | **Done** | `server/integrations/meta.js` |
| 16.3 Google Calendar OAuth | **Done** | `server/integrations/gcal.js` |
| 16.4 SMTP + webhook verification + simulated mode | **Done** | `server/integrations/email.js`, `registry.js` |

**Also implemented (beyond requirements):** QuickBooks Online UK (`server/integrations/quickbooks.js`), Twilio SMS/voice webhooks.

All integrations flip from simulated to live when credentials are added — no code changes. See `INTEGRATIONS.md` and Settings → Integrations.

### 5.17 Settings (SET)

| Req | Status | Implementation |
|-----|--------|----------------|
| 17.1 Company profile, tax, bank details | **Done** | `server/routes/settings.js` |
| 17.2 Service catalogue, message/checklist templates | **Partial** | Templates in DB defaults; no catalogue UI or template editor |
| 17.3 Timesheet rules, branding, permissions | **Partial** | Some rules in settings JSON; no UI editors for timesheet rules or branding |

### 5.18 Field Staff PWA

| Feature | Status |
|---------|--------|
| Mobile layout (`/staff/*`) | **Done** |
| Jobs list + detail | **Done** |
| Clock in/out, hours history | **Done** |
| Holiday requests | **Done** |
| Team chat | **Done** |
| Installable PWA (manifest + service worker) | **Partial** — `icon-192.png` / `icon-512.png` referenced but only `icon.svg` exists |

**Key paths:** `client/src/components/StaffLayout.jsx`, `client/src/pages/staff/*`

---

## 6. What's Left to Implement

Grouped by priority and mapped to `docs/requirements.md` requirement numbers.

### 6.1 Infrastructure & security (high)

| Item | Req | Notes |
|------|-----|-------|
| PostgreSQL + Sequelize migrations | 1.1 | Current SQLite is portable but not the target stack per spec and Cursor rules |
| Per-user financial restrictions for Office | 1.6 | Gate costing, pay rates, profitability by user flag |
| Password reset + edit existing users | 1.7 | Create/deactivate only today |
| Security audit log + forced logout on role change | 1.9 | — |
| Director-only profitability on dashboard | 14.3 | Move costing KPIs behind `ADMIN` guard |

### 6.2 CRM depth (medium)

| Item | Req | Notes |
|------|-----|-------|
| Multiple site addresses per customer | 2.2 | New table or JSON structure |
| Customer photo/document attachments | 2.4 | File storage in `data/files/` pattern exists for PDFs |
| Advanced search/filtering | 2.5 | Extend beyond text search |
| CSV customer import | 2.6 | — |
| Commercial customer fields in UI | 2.1 | `customer_type`, `company_name`, `vat_number` |
| Lead tagging + ageing indicators | 3.5 | — |
| Pipeline filters + owner assignment | 4.4 | Populate `owner_id`, add filter UI |
| Stalled-deal indicators | 4.5 | — |

### 6.3 Quoting & jobs (medium)

| Item | Req | Notes |
|------|-----|-------|
| Service catalogue + measured quantities | 6.1 | Settings data model partially ready |
| Roof area + pitch calculator | 6.2 | Roofing-specific differentiator |
| Multi-option quotes | 6.5 | — |
| AI-assisted quote wording | 15.2 | Scheduling AI pattern can be reused |
| Job checklists, photos, variations | 7.3–7.5 | Staff clock-out photo pattern exists |
| Job address geocoding | — | Enable distance-from-site flags |
| Invoice UK tax parity | 11.2 | Reuse `ukTax.js` on invoice path |

### 6.4 Notifications module (medium)

| Item | Req | Notes |
|------|-----|-------|
| In-app notification centre | 13.1 | New table + bell icon + unread count |
| Email alerts for critical events | 13.1 | SMTP integration exists |
| Per-user notification preferences | 13.2 | — |

### 6.5 Settings & admin UI (lower)

| Item | Req | Notes |
|------|-----|-------|
| Service catalogue management UI | 17.2 | — |
| Message/checklist template editor | 17.2 | Templates exist as JSON in settings |
| Timesheet rules editor | 17.3 | Rules in `DEFAULT_SETTINGS.timesheets` |
| Staff pay rate + CIS status UI | 1.8 | DB columns exist |
| Branding options beyond company name | 17.3 | — |
| Appointment type categorisation | 5.3 | — |
| Scheduling change notifications | 8.3 | — |

### 6.6 Reporting & exports (lower)

| Item | Req | Notes |
|------|-----|-------|
| Dashboard/report CSV exports | 14.2 | Only timesheet CSV today |
| Phase 4 predictive forecasting | — | `ai_proposals` history ready for tuning |

### 6.7 External integrations (lower)

| Item | Notes |
|------|-------|
| Marketing website enquiry webhook | Separate Astro site can POST to `ENQUIRY_WEBHOOK_URL`; add `POST /api/webhooks/website` (or similar) to ingest |
| PWA icon assets | Add `icon-192.png` and `icon-512.png` to `client/public/` |
| `docs/requirements-indexed.md` | Referenced by `docs/example-prompt.md` but not created |

### 6.8 Deliberately out of scope (per PRD/README)

- Payroll processing (CSV export only)
- Full stock/inventory control (materials note per job included)
- Accounting beyond QuickBooks
- Native app-store apps (PWA covers field staff)
- Meta cannot join existing personal WhatsApp groups (platform limitation)

---

## 7. Integration Points

### 7.1 Inbound channels (into CRM)

```
WhatsApp Cloud API  ──► POST /api/webhooks/whatsapp
Facebook/Meta       ──► POST /api/webhooks/facebook
Inbound email       ──► POST /api/webhooks/email?secret=...
Twilio SMS/voice    ──► POST /api/webhooks/twilio
Manual / simulator  ──► POST /api/leads, /api/integrations/simulate/enquiry
Website (planned)   ──► not yet wired
```

All inbound paths funnel through `server/services/messenger.js` → `ingestInbound()` → customer match → inbox + pipeline.

### 7.2 Outbound channels (from CRM)

- WhatsApp document messages (quote PDFs)
- SMTP email (quotes, invoices, follow-ups)
- Google Calendar events (site visits)
- QuickBooks Online UK (invoices + payment sync)

### 7.3 Marketing website (separate repo)

```
┌─────────────────────────┐         webhook (optional)         ┌─────────────────────┐
│   Marketing Website     │  ─────────────────────────────────►│   pdr-system CRM    │
│   (Astro + CF Pages)    │         ENQUIRY_WEBHOOK_URL        │   (this repo)       │
│                         │         [not consumed yet]         │                     │
│  EnquiryForm → Resend   │                                    │  Enquiry Inbox      │
└─────────────────────────┘                                    └─────────────────────┘
```

---

## 8. Repository Layout

```
pdr-system/
├── package.json                # Root scripts: dev, build, seed, test
├── server/
│   ├── index.js                # Express app, cron, static hosting
│   ├── db.js                   # SQLite schema, settings, migrations
│   ├── auth.js                 # JWT, role guards
│   ├── seed.js                 # Demo data
│   ├── routes/                 # 15 API route modules
│   ├── services/               # pipeline, tasks, followups, pdf, ukTax, scheduler, timesheets, messenger
│   └── integrations/           # whatsapp, meta, email, gcal, quickbooks, ai, registry
├── client/
│   ├── src/
│   │   ├── App.jsx             # Routes (admin + staff)
│   │   ├── pages/              # 11 admin + 5 staff screens
│   │   ├── components/         # Layout, QuoteBuilder, WeekView, JobModal, ClockWidget, ui
│   │   └── lib/                # api.js, auth.jsx
│   └── public/                 # PWA manifest, service worker
├── data/                       # SQLite DB + generated PDFs (created at runtime)
├── docs/
│   ├── requirements.md         # CRM functional requirements (17 modules)
│   ├── example-prompt.md       # Per-requirement implementation template
│   ├── Scope-of-Work-and-FRD.docx
│   └── system-understanding.md # This file
├── e2e-test.js                 # Full business-flow + security test
├── test-features.js            # Timesheets, quoting, staff isolation
├── test-uktax.js               # UK tax engine unit tests
├── check.js                    # Integration credential doctor
├── INTEGRATIONS.md             # Live-credentials guide per provider
├── Dockerfile
├── docker-compose.yml
└── .cursor/rules/              # Agent standards for CRM development
```

---

## 9. Local Development & Deployment

### 9.1 Quick start

```bash
npm run install:all
cp .env.example .env          # set JWT_SECRET at minimum
npm run seed                  # demo data
npm run build
npm start                     # http://localhost:4000
```

Development with hot reload: `npm run dev` (client :5173, server :4000).

### 9.2 Demo logins

| Role | Email | Password |
|------|-------|----------|
| Director (Paul) | `paul@pauldouglasroofing.co.uk` | `password123` |
| Office (Lisa) | `lisa@pauldouglasroofing.co.uk` | `password123` |
| Field staff | `jamie@pauldouglasroofing.co.uk` (+ connor, liam, ryan, callum, nathan) | `password123` |

### 9.3 Verification

```bash
npm test    # uktax + e2e + features
node e2e-test.js   # 44 assertions: full journey + permission checks
```

### 9.4 Production deploy

```bash
docker compose up -d --build
# or: npm run install:all && npm run build && npm start
```

Requirements: UK/EU VPS or PaaS, HTTPS, `APP_URL` set to public URL (webhooks and OAuth derive from it). Back up `data/` directory (DB + PDFs).

### 9.5 Environment variables

See `.env.example` for the full list. Minimum to run: `JWT_SECRET`. All integration keys are optional — simulated mode works without them.

---

## 10. Test Coverage

| File | Type | What it covers |
|------|------|----------------|
| `test-uktax.js` | Unit | VAT, CIS, retention, payment schedules (~10 scenarios) |
| `e2e-test.js` | E2E | Enquiry → paid journey + staff financial leak checks (~44 assertions) |
| `test-features.js` | Integration | Timesheets lifecycle, staff isolation, UK quoting, job costing |
| `check.js` | Diagnostic | Integration credential validation (manual, not CI) |

**Gaps:** No route unit tests, no React component tests, no CI pipeline in repo.

---

## 11. Key Gaps & Open Questions

1. **Stack divergence** — Requirements and Cursor rules specify PostgreSQL + Sequelize; implementation uses SQLite + raw SQL. Migration is requirement 1.1 and the largest infrastructure item remaining.

2. **Invoice tax parity** — Quotes use the full UK tax engine; invoices use simplified totals. CIS/reverse charge/retention should flow through to invoices.

3. **Director-only financials** — `hourly_cost` and job costing are visible to any `OFFICE` user; requirement 14.3 expects Director-only access.

4. **Notifications module** — Entire module (13.x) unbuilt; tasks are a partial substitute.

5. **Catalogue quoting** — Manual line items only; roof pitch/area math and catalogue picker are core roofing differentiators still missing.

6. **Website webhook** — Marketing site integration endpoint not implemented in this CRM.

7. **Documentation** — `docs/requirements-indexed.md` referenced by implementation prompts but not created.

8. **Planned vs actual stage count** — Requirements say 11-stage pipeline; implementation has 12 (includes explicit `PAID` stage).

---

## 12. Related Documentation

| Document | Purpose |
|----------|---------|
| `README.md` | Setup, demo logins, phase summary, deployment |
| `INTEGRATIONS.md` | Per-integration credential setup |
| `docs/requirements.md` | CRM functional requirements (17 modules, ~160 lines) |
| `docs/example-prompt.md` | Template for implementing a single requirement |
| `docs/Scope-of-Work-and-FRD.docx` | Full scope of work and functional requirements |
| `.cursor/rules/*.mdc` | Agent behaviour for CRM development |
