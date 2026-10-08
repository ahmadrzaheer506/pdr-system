# System Understanding — Paul Douglas Roofing Business OS

> Generated from codebase review. Last updated: September 2026.

This document captures the current state of the **pdr-system** repository: what is built today, what remains, and how the pieces connect.

---

## 1. Executive Summary

**Paul Douglas Roofing — Business Operating System** is an internal CRM and operations platform for a UK roofing contractor. It covers the full sales-to-cash cycle: lead capture → pipeline → site visits → quotes → jobs → scheduling → timesheets → invoicing → payment tracking, with automation, integrations, and a separate field-staff mobile PWA.

| Layer | Status | Description |
|-------|--------|-------------|
| **Backend API** | **Built** | Express 4, PostgreSQL + Sequelize, JWT auth, cron automation |
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
- **Data residency:** Designed for UK/EU hosting (PostgreSQL + generated PDFs in `data/`)

---

## 3. Technology Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| **Monorepo layout** | Root `package.json` orchestrating `server/` + `client/` | Not an Nx workspace |
| **Backend** | Node.js, Express 4 | Single process serves API + built SPA |
| **Database** | PostgreSQL via Sequelize | `DATABASE_URL`; migrations in `server/migrations/`; BOOLEAN / TIMESTAMPTZ / JSONB |
| **ORM** | Sequelize 6 | Model APIs in routes/services; Umzug on boot |
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
| 1.1 PostgreSQL + Sequelize | **Done** | `DATABASE_URL`, Sequelize models, Umzug migrations, Compose Postgres service |
| 1.2 Email/password auth | **Done** | `server/routes/auth.js`, `server/auth.js` |
| 1.3 httpOnly session cookies | **Done** | JWT in cookie + Bearer support |
| 1.4 Three-role model | **Done** | `ADMIN` / `OFFICE` / `STAFF` |
| 1.5 Route guards + operative financial exclusion | **Done** | Guards + `/api/staff/*` SQL allowlists |
| 1.6 Per-user financial restrictions (Office) | **Missing** | All `OFFICE` users see costing data |
| 1.7 User lifecycle | **Partial** | Create + deactivate in Settings; no password reset, no edit-existing-user modal |
| 1.8 Skills, driver flag, pay rates | **Partial** | DB columns exist (`skills`, `is_driver`, `hourly_cost`, `cis_status`); no Settings UI for pay/CIS |
| 1.9 Audit logging, forced logout on role change | **Done** | `users.token_version` invalidates JWTs; `security_events` + ADMIN Settings tab |

### 5.2 Customers (CRM)

| Req | Status | Implementation |
|-----|--------|----------------|
| 2.1 Domestic/commercial records | **Done** | `domestic`/`commercial`; company name required when commercial; Pipeline create + customer-detail edit |
| 2.2 Multiple site addresses | **Done** | `customer_sites` / `customer_phones` / `customer_emails`; customer-detail card |
| 2.3 Unified activity timeline | **Done** | Messages, calls, quotes, jobs, invoices (notes live on Internal notes) |
| 2.4 Attachments | **Done** | Internal notes list + `customer_files` on the customer only (`data/files/`) |
| 2.5 Duplicate detection + search | **Done** | 409 on duplicate phone/email create/add; `customer_phones.normalised`; Customers filters |
| 2.6 Source, lost reason, CSV import | **Partial** | Source unchanged; required lost-reason pick-list on customer-detail + pipeline (PUT `/stage`); CSV import deferred |

**Key paths:** `server/routes/customers.js`, `client/src/pages/CustomerDetail.jsx`

### 5.3 Enquiry Inbox (INB)

| Req | Status | Implementation |
|-----|--------|----------------|
| 3.1 Unified inbox | **Done** | All-channel lead list (incl. phone/SMS/manual); CLOSED tab; ADMIN/OFFICE only |
| 3.2 Multi-channel inbound | **Done** | WA/FB/Lead Ad/email webhooks; Meta signature when `META_APP_SECRET` set; Lead Ad ingest without Graph; no website form |
| 3.3 Manual quick-add | **Done** | Inbox Log enquiry — Came in via dropdown; name required, phone optional; matching is 3.4 |
| 3.4 Customer matching + dedupe | **Done** | Phone then email; Log enquiry 409 + notice; webhooks still attach; next_action defaults to Review & respond |
| 3.5 Status, replies, tagging, ageing | **Partial** | NEW/ACTIONED/CONVERTED/CLOSED + channel replies; no tags or ageing indicators |

**Key paths:** `server/routes/leads.js`, `server/services/messenger.js`

### 5.4 Pipeline (PIP)

| Req | Status | Implementation |
|-----|--------|----------------|
| 4.1 Kanban board | **Done** | All 12 current columns including Paid; card layout polish (name, address, source, quote, updated, tasks) |
| 4.2 Drag-and-drop + audit | **Done** | Any-column + within-column order (`board_order`); drop highlight + toasts; history on customer record |
| 4.3 Auto-progression | **Done** | Appointments, quotes, jobs, invoices, follow-ups trigger stage changes |
| 4.4 Filters (source, owner, date, value) | **Done** | Multi-select source + owner + created_at + latest-quote value; URL-persisted; owner auto-set on create and editable |
| 4.5 Pipeline value + stalled deals | **Done** | Board + column totals (sent+draft, Enquiry→Follow-up, respects 4.4 filters); stall amber 7d / red 14d from updated_at except Lost and Paid |

**Stages:** `ENQUIRY` → `SITE_VISIT_BOOKED` → `QUOTE_PENDING` → `QUOTED` → `FOLLOW_UP` → `WON` / `LOST` → `SCHEDULED` → `IN_PROGRESS` → `COMPLETED` → `INVOICED` → `PAID`

**Key paths:** `server/services/pipeline.js`, `server/pipelineFilters.js`, `server/customerOwner.js`, `client/src/lib/pipelineBoard.js`, `client/src/pages/Pipeline.jsx`

### 5.5 Appointments (APT)

| Req | Status | Implementation |
|-----|--------|----------------|
| 5.1 Site visit booking | **Done** | Linked `customer_id` + site/phone/email; book from customer, pipeline, and inbox; Enquiry → Site visit booked only |
| 5.2 Google Calendar sync + auto-progression | **Done** | Per office-user OAuth (book still works unconnected); poll linked events for time/cancel; visit end → Quote pending + produce-quote task |
| 5.3 Reschedule, cancel, type categorisation | **Done** | Customer record only; booked + not-ended; cancel leaves stage; types Site visit / Follow-up / Measure / Other |

**Key paths:** `server/routes/appointments.js`, `server/visitTypes.js`, `server/integrations/gcal.js`, `client/src/components/BookVisit.jsx`, `client/src/lib/visitTypes.js`

### 5.6 Quoting (QUO)

| Req | Status | Implementation |
|-----|--------|----------------|
| 6.1 Catalogue-driven line items | **Done** | Live `catalogue_items` list in quote builder; qty × unit price; free-text lines and price override; Settings CRUD (17.2) |
| 6.2 Roof area + pitch calculations | **Missing** | — |
| 6.3 UK VAT, CIS, reverse charge | **Done** | Per-line VAT (Settings add/update rates); commercial defaults reverse charge + CIS 20%; domestic standard VAT, no CIS; office can override; same engine on quotes and invoices |
| 6.4 Retention, staged payments, provisional sums | **Done** | Commercial 5% retention of net (ex VAT), domestic 0%; office can override; company payment stages from quote defaults; P.S. listed after works total with include-in-grand-total toggle |
| 6.5 Multi-option quotes, optional extras | **Done** | Duplicate as a new-ref revision; extras listed after works total (never included) and ticked onto the job at acceptance; guarantee years + wording in their own quote-builder section |
| 6.6 Branded PDF + cancellation notices | **Done** | Existing branded PDF (navy/red header, company/VAT/bank from Settings). ADMIN uploads PNG/JPEG logo on disk (17.3); PDFs, login, and chrome use it with the seed file as fallback. Domestic quotes keep CCR 2013 notice + model form. Office can generate/regenerate and Download PDF from the customer quote card and quote builder without sending. |
| 6.7 WhatsApp/email distribution + acceptance | **Done** | Office sends PDF via WhatsApp or email from the quote card and quote builder; resend allowed while draft/sent. Customer replies in the thread; office marks Accepted/Declined on the card. Card shows last send channel and time. |

**Key paths:** `server/routes/quotes.js`, `server/catalogue.js`, `client/src/components/QuoteBuilder.jsx`, `client/src/pages/Quotes.jsx`

### 5.7 Jobs (JOB)

| Req | Status | Implementation |
|-----|--------|----------------|
| 7.1 Auto-create from accepted quote | **Done** | Job gets title, quote notes, site address, contacts, value = works + ticked extras. Line items stay on the quote. A second accept returns the existing job. Customer Jobs card shows quote ref and value and opens the job modal. |
| 7.2 Status lifecycle, crew assignment, skills | **Done** | Forward-only status (skip ahead, no back). Required skills picker on the job modal (same list as Settings); matching crew chips highlighted; office can still assign anyone. Crew is per work date (8.1). |
| 7.3 Materials + checklists | **Done** | Structured materials lines (description, qty, unit) with needed/packed/used ticks. Checklists from Settings templates (four seeds plus admin-added lists) applied by office; office and staff add/remove/tick. Settings → Templates add/edit/delete (17.2). Not stock control. |
| 7.4 Photos, attachments, progress notes | **Done** | Job photos tagged before/during/after; PDFs as documents (JPEG/PNG/WebP/PDF ≤10MB). Completing a job does not require photos. Progress notes use `jobs.notes`. Office job modal and assigned staff add/delete. Not customer files; never emailed/WhatsApped. |
| 7.5 Per-job chat, variations | **Done** | Job chat kept as-is. No new site-access field (progress notes / description / checklist). Office-only variation lines (description + amount), hidden from staff, do not change `job.value`. Invoice-from-job appends each variation after quote lines (11.1). |

### 5.8 Scheduling (SCH)

| Req | Status | Implementation |
|-----|--------|----------------|
| 8.1 Week + day view + unscheduled queue | **Done** | Week grid; click a weekday for a single-day board (same cards, not hourly). Unscheduled sidebar (`PENDING`) with start date, optional end, Place (`PUT` dates → `SCHEDULED`). Crew is per-day only (`job_day_assignments`); job-wide `job_assignments` no longer used. |
| 8.2 Crew assignment, holiday overlay, double-booking prevention | **Done** | Per-day crew on the job modal and the open day board. Approved-holiday and already-booked overlays on week/day cards and crew chips. Manual save **warns** for double-book (toast / banner) but is not blocked. **Approved holiday hard-blocks crew save (400)** — requirement 10.3. Pending holidays ignored. AI approve still strips conflicts. |
| 8.3 Skill warnings, driver allocation, change notifications | **Done** | Manual save warns (does not block) if that day's crew misses `required_skills` or if `needs_driver` is on and nobody assigned is a driver. Toggle is on the job modal. Assigned staff get `notifications` rows when they are added or removed from a day **if they opted in**. Field staff also get an email on those crew changes when the crew email switch is on (13.2). |

**AI scheduling:** Voice or text input → LLM or rule-based proposal → server-side constraint validation → human approval. Proposals logged in `ai_proposals` table.

**Key paths:** `server/services/schedulerEngine.js`, `server/integrations/ai.js`

### 5.9 Timesheets (TIM)

| Req | Status | Implementation |
|-----|--------|----------------|
| 9.1 Clock in/out, single active shift | **Done** | Job optional (yard / travel). A picked job must have the user on that day's crew. One open shift per person — second clock-in is 400 until they clock out (no switch-job). GPS, breaks, photos, live board, and payroll CSV left as-is for 9.2–9.4. |
| 9.2 GPS, distance-from-site flags, break tracking | **Done** | Clock-in and clock-out capture GPS when the browser allows it. Missing GPS flags `no_location` and still saves. Job addresses are geocoded (Photon, Nominatim fallback) onto `jobs.lat`/`lng`; distance outside `site_radius_m` (default 300m) flags `far_from_site` warn-only. Yard / travel is not distance-checked. Breaks are a paid log — they do not reduce worked minutes. |
| 9.3 Live "on the clock" board | **Done** | Office/Admin Timesheets tab **On the clock** (full page, not a strip). Polls every 10s; each card has a live elapsed timer plus on-break / `far_from_site` / `no_location`. Office can force clock-out. Empty board still shows. **Not clocked in** lists unique people on today's `job_day_assignments` with no open shift. Approve / edit-with-reason / CSV stay on 9.4. |
| 9.4 Review, approval, corrections, payroll CSV | **Done** | Review lists the date range. Approve (single/batch) and Reject-with-reason apply only to `completed`. Edit-with-reason on `completed` or `approved`; running shifts are read-only. Breaks stay a paid log on office edit (hours = clock-in → clock-out). CSV is the same date-range export; Review’s **Approved only** filter also applies to the CSV (`?status=approved`). Restricted office still omit rate/cost. |

**Job costing:** Quoted value vs labour cost in Timesheets → Costing tab (visible to all `OFFICE` users, not Director-only).

### 5.10 Holidays (HOL)

| Req | Status | Implementation |
|-----|--------|----------------|
| 10.1 Requests with minimum notice | **Done** | Staff request for themselves; `holiday_notice_days` (default 28) calendar days from local today to `start_date`, client `min` + server 400. Office/Admin can book for a staff member and **bypass** notice (emergency / compassionate). Overlapping pending or approved ranges for the same person are blocked. Inclusive whole days; optional reason. Approve/decline is 10.2; allowance/calendar 10.3. |
| 10.2 Approval/decline with reason | **Done** | Office/Admin `PUT /holidays/:id/decision`. Decline **requires** a non-empty reason (modal + server 400); approve needs none and clears any prior `decline_reason`. Reverse allowed: pending → approved/declined; approved → declined; declined → approved. Same-status re-decide is 400. Approving still blocks 10.1 overlap. Staff withdraw own pending via existing `DELETE` on My Holidays. Operative still sees decline reason. Allowance/calendar stay 10.3. |
| 10.3 Allowance + calendar integration | **Done** | Calendar year; used = inclusive days of **pending + approved** that fall in the year (clip across 1 Jan). Remaining = `holiday_allowance` − used. Staff submit and office book/approve are **400** if over; decline, reverse-to-declined, and withdraw free the days. Staff My Holidays and office list show used/remaining. Office Holidays has a month grid of **approved** off (`GET /holidays/calendar`). Schedule overlays stay; assigning someone with approved holiday that day is **400**. Double-book / skill / driver stay warn-only. |

### 5.11 Invoicing (INV)

| Req | Status | Implementation |
|-----|--------|----------------|
| 11.1 Generate from completed jobs | **Done** | No job-status gate on `POST /invoices { job_id }`. One invoice per job (400 if that job already has one; unique `job_id`). Lines = quote items (or job title + value) then each variation as qty 1, `unit_price` = amount, `vat_code` standard, `kind` labour. Job modal Create when eligible; Invoices page lists COMPLETED jobs with no invoice yet and Create on each row. Tax inherit stays 11.2. |
| 11.2 UK VAT and CIS on invoices | **Done** | Same `ukTax.documentTotals` as quotes (inherit at create). Draft `PUT /invoices/:id/tax` can change `vat_treatment` / CIS; sent/paid frozen (400). Invoices drawer + customer Invoices card show treatment, VAT amount, CIS rate/deduction, due now, and reverse-charge notice. List has a due-now column. Retention stays 6.4; PDF/email stay 11.3. |
| 11.3 Branded PDF + email | **Done** | Same as quotes: `POST /invoices/:id/pdf` generates/regenerates without sending; Download PDF on the Invoices list, invoice drawer, and customer Invoices card. Send emails the branded PDF (logo, Settings company/VAT/bank — no logo upload). Email only; resend while draft or sent; 400 and do not mark sent if the customer has no email. QuickBooks push on send stays as today. |
| 11.4 Payment tracking, overdue detection | **Done** | Payment ledger (`invoice_payments`: date, amount, optional note). `amount_paid` is the ledger sum capped at `due_now`. Record payment on the Invoices list, invoice drawer, and customer Invoices card (sent / part-paid / overdue; no reverse). Overdue scan still flips `sent`/`part_paid` past `due_date` and opens the chase-payment task (task list is 12.2). Dashboard outstanding/overdue and the Invoices totals strip use `due_now − amount_paid`; customer card shows paid / outstanding. |

### 5.12 Automation (AUT)

| Req | Status | Implementation |
|-----|--------|----------------|
| 12.1 Quote follow-up sequences | **Done** | Settings Company tab: on/off, add/remove steps (delay in days from quote send, WhatsApp or email, body template per step). Auto-schedule on send; resend cancels pending then reschedules. Inbound reply stops remaining pending steps for quotes already sent (other quotes keep theirs). Accept / decline / expire / office **Cancel remaining** on the customer follow-ups card cancel that quote’s pending steps. |
| 12.2 System task generation | **Done** | One unassigned `quote_followup:quote:{id}` task when a quote is sent (due on first step date; resend updates due date). Auto-resolves on customer reply, accept/decline/expire, or Cancel remaining. Produce-quote / expired-quote / chase-payment unchanged. Customer follow-ups card links with `when` + `task` (12.3). |
| 12.3 Task list views | **Done** | Tasks page: All open, Overdue, Today, Due (upcoming), Done (completed + dismissed). Filters live in the URL (`/tasks?when=today&task=24`); the customer follow-up chip opens the matching bucket. Cron interval is Settings → Company (1–60 minutes, default 5); scans + `processDue` still run on that schedule. |

### 5.13 Notifications (NOT)

| Req | Status | Implementation |
|-----|--------|----------------|
| 13.1 In-app notification centre + email alerts | **Done** | Bell drawer lists the signed-in user's rows (mark one / mark all as read; click opens the linked record). Events: crew add/remove, new enquiry, quote accepted, site visit booked, invoice overdue, task due today, holiday submitted / approved / declined. In-app for everyone involved **who opted in**. Email only to **STAFF** on crew add/remove **when that email switch is on** (Mailgun simulated when unset). Unread count on the bell (13.1 poll; muted kinds are never written). |
| 13.2 Per-user preferences + unread badges | **Done** | Settings → Notifications (office); staff Account modal (Change password). In-app on/off per kind the user can receive; email on/off only for crew add/remove on field staff. Default **off** until opt-in. Badge stays the 13.1 unread count + 60s poll. |

### 5.14 Reporting (REP)

| Req | Status | Implementation |
|-----|--------|----------------|
| 14.1 Management dashboard | **Done** | Home (`/`) is a short summary: new leads, customer win/loss (current WON/LOST + `updated_at` in 7/30/90), live 4.5 pipeline value. **Reports** hub (`/reports`) has six cards for office; **ADMIN** also sees Job profitability (14.3). |
| 14.2 Date range filtering + CSV exports for all reports | **Done** | 7/30/90 plus From/To (from/to overrides pills). Pipeline value stays live (no dates); its CSV is the live snapshot. Customers / Jobs / Invoices require from/to then **Generate** (`created_at` in range). Invoice total / amount due hidden when `financials_restricted` (1.6). Home dashboard unchanged (no from/to, no CSV). |
| 14.3 Director-only profitability | **Done** | Reports card **Job profitability** (`ADMIN` only; OFFICE 403). From/to required + Generate; jobs by `created_at`. Same quoted-ex-VAT vs labour columns as Timesheets Costing, plus hours/cost by operative. Jobs CSV and labour CSV. Timesheets Costing tab stays on 1.6 (unrestricted OFFICE). |

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
| 16.4 Mailgun email + webhook verification + simulated mode | **Done** | `server/integrations/email.js`, `registry.js` |

**Also implemented (beyond requirements):** QuickBooks Online UK (`server/integrations/quickbooks.js`), Twilio SMS/voice webhooks.

All integrations flip from simulated to live when credentials are added — no code changes. See `INTEGRATIONS.md` and Settings → Integrations.

### 5.17 Settings (SET)

| Req | Status | Implementation |
|-----|--------|----------------|
| 17.1 Company profile, tax, bank details | **Done** | Settings → Company: name, address, **city**, phone, email, VAT number, company number; VAT rates (6.3); `vat_registered` / `cis_registered` / `cis_utr` / `default_cis_rate` (0/20/30). Bank (`bank_name`, `bank_account_name`, `bank_sort_code`, `bank_account_number`) ADMIN-only — stripped from OFFICE `GET /api/settings`. Staff CIS remains 1.8. |
| 17.2 Service catalogue, message/checklist templates | **Done** | `catalogue_items` table + `/api/catalogue` CRUD with `q`/`kind` search (ADMIN mutate, OFFICE list). Settings → Templates: core quote/invoice message bodies, extra named `{key,body}` pairs (picker on customer composer), checklist templates add/edit/delete (seeds plus new lists). Quote `meta/options` reads live catalogue. Follow-ups only on Company (12.1); retired `quote_followup_*` template keys are stripped and never used to send. `quote_defaults` unchanged. |
| 17.3 Timesheet rules, branding, permissions | **Done** | Settings → Company: eight timesheet keys (ADMIN save, OFFICE view). Clock-in still enforces `enabled`, `site_radius_m`, `round_to_minutes`, `max_shift_hours` only. Company default `holiday_allowance_days` inherited when new staff allowance is blank; changing the default does not rewrite users. Notice days stay 10.1. Permissions unchanged beyond Staff & Users (role, Office costing flag, holiday allowance). ADMIN PNG/JPEG logo upload (2MB) on disk; OFFICE view-only; PDFs/login/chrome use it. |

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
| Per-user financial restrictions for Office | 1.6 | Gate costing, pay rates, profitability by user flag |
| Password reset + edit existing users | 1.7 | Create/deactivate only today |
| Security audit log + forced logout on role change | 1.9 | **Done** — token_version + `security_events` |
| Director-only profitability on dashboard | 14.3 | **Done** — Reports hub card (not Home). Timesheets Costing remains 1.6. |

### 6.2 CRM depth (medium)

| Item | Req | Notes |
|------|-----|-------|
| Multiple site addresses per customer | 2.2 | New table or JSON structure |
| Customer photo/document attachments | 2.4 | **Done** — `customer_files` on the customer; JPEG/PNG/WebP/PDF ≤10MB in `data/files/` |
| Advanced search/filtering | 2.5 | **Done** — postcode, source, company name, created-date range; phone search via `normalised` |
| CSV customer import | 2.6 | Deferred — not in this pass |
| Commercial customer fields in UI | 2.1 | **Done** — type + company/VAT on create and customer-detail edit |
| Lead tagging + ageing indicators | 3.5 | — |
| Pipeline filters + owner assignment | 4.4 | **Done** — auto-set on create, editable on the customer; board query filters |
| Stalled-deal indicators | 4.5 | **Done** — amber 7d / red 14d on Updated line + badge; Lost and Paid excluded |

### 6.3 Quoting & jobs (medium)

| Item | Req | Notes |
|------|-----|-------|
| Roof area + pitch calculator | 6.2 | Roofing-specific differentiator |
| Multi-option quotes | 6.5 | **Done** — duplicate quote as a new ref; extras listed not in total; guarantee section |
| AI-assisted quote wording | 15.2 | Scheduling AI pattern can be reused |
| Job checklists, photos, variations | 7.3–7.5 | **Done** — 7.3 materials/checklists, 7.4 photos/notes, 7.5 office-only variations (appended on invoice-from-job in 11.1) |
| Job address geocoding | 9.2 | **Done** — Photon then Nominatim on job create/update and lazy on clock-in |
| Invoice UK tax parity | 11.2 | **Done** — invoices use `ukTax.documentTotals`; drafts can edit VAT/CIS; sent/paid frozen |

### 6.4 Notifications module (medium)

| Item | Req | Notes |
|------|-----|-------|
| In-app notification centre | 13.1 | **Done** — `GET /api/notifications`, bell drawer, mark read, unread count |
| Email alerts for critical events | 13.1 | **Done** — STAFF only, crew add/remove, when email pref is on |
| Per-user notification preferences | 13.2 | **Done** — `GET/PUT /api/notifications/preferences`; default off |

### 6.5 Settings & admin UI (lower)

| Item | Req | Notes |
|------|-----|-------|
| Staff pay rate + CIS status UI | 1.8 | DB columns exist |
| Scheduling change notifications | 8.3 | Rows written on crew add/remove when in-app is on; staff email when that switch is on (13.2) |

### 6.6 Reporting & exports (lower)

| Item | Req | Notes |
|------|-----|-------|
| Dashboard/report CSV exports | 14.2 | **Done** — CSV on all six Reports hub types. Home `/` stays 7/30/90 summary only. Timesheet payroll CSV remains 9.4. |
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
- Mailgun email (quotes, invoices, follow-ups)
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
│   ├── db.js                   # Settings, DATA_DIR, Umzug
│   ├── config/                 # DATABASE_URL Sequelize connection
│   ├── models/                 # Sequelize models
│   ├── migrations/             # PostgreSQL schema
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
├── data/                       # Generated PDFs + photos (created at runtime)
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
| `server/__tests__/*.test.js` | Unit | Sequelize helpers, migration types, auth, quote BOOLEAN/JSONB, site-visit booking |
| `client/src/components/QuoteBuilder.test.jsx` | RTL | Quote builder consumes native booleans and JSON objects |
| `check.js` | Diagnostic | Integration credential validation (manual, not CI) |

**Gaps:** No CI pipeline in repo.

---

## 11. Key Gaps & Open Questions

1. **Director-only financials** — 14.3 job profitability report is `ADMIN` only. Timesheets Costing and labour-cost columns stay on 1.6 (unrestricted OFFICE). Pay rates remain 1.8.

2. **Notifications module** — Entire module (13.x) unbuilt; tasks are a partial substitute.

3. **Roof pitch/area quoting** — Catalogue picker and qty × unit price are in; roof pitch/area math (6.2) is still missing.

4. **Website webhook** — Marketing site integration endpoint not implemented in this CRM.

5. **Documentation** — `docs/requirements-indexed.md` referenced by implementation prompts but not created.

6. **Planned vs actual stage count** — Requirements say 11-stage pipeline; 4.1 keeps all 12 current columns including `PAID`.

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
