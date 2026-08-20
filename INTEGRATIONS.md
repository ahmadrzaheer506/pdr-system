# Integration Requirements — What I Need From You

**Paul Douglas Roofing — Business OS** · Prepared by DuoLogiq

The software is fully built and runs today **without any of these keys** — every integration has a simulated mode so the whole workflow can be demoed end to end. As each set of credentials below is added to the `.env` file (or the in-app Settings → Integrations screen), that integration switches from simulated to live automatically. No code changes needed.

---

## Summary — the shopping list

| # | Integration | What you must provide | Where it comes from | Lead time / blocker |
|---|---|---|---|---|
| 1 | Hosting + domain | A VPS or PaaS account + a subdomain (e.g. `app.pauldouglasroofing.co.uk`) with HTTPS | Any UK/EU host (Hetzner, Railway, Render, DigitalOcean LON1) | Same day. **Required first** — Meta/Google/QuickBooks all need a public HTTPS URL |
| 2 | AI (scheduling + drafting) | `ANTHROPIC_API_KEY` **or** `OPENAI_API_KEY` | console.anthropic.com or platform.openai.com | Minutes |
| 3 | WhatsApp Business | Access token, Phone Number ID, WABA ID, App Secret + approved message templates | Meta Business Manager + developers.facebook.com | **1–7 days** (template approval by Meta) |
| 4 | Facebook Page | Page ID + Page Access Token (same Meta app as WhatsApp) | developers.facebook.com | **Days–weeks** (Meta App Review for `pages_messaging` + `leadgen`) |
| 5 | Google Calendar | OAuth Client ID + Secret; then Paul clicks "Connect" once | console.cloud.google.com | Same day (verification only needed later for production status) |
| 6 | QuickBooks Online UK | OAuth Client ID + Secret; active QBO UK subscription; Paul clicks "Connect" once | developer.intuit.com | Same day for sandbox; production keys need a short Intuit review |
| 7 | Outbound email (SMTP) | SMTP host/port/user/pass | Their email provider, or SendGrid/Mailgun/Postmark | Minutes–1 day (domain DNS records for deliverability) |
| 8 | Inbound email | A forwarding rule from their enquiry addresses → parse address | SendGrid Inbound Parse or Mailgun Routes (free tiers fine) | ~1 hour |
| 9 | Phone/SMS capture (optional) | Twilio SID + Auth Token + a UK number (or call-forwarding setup) | twilio.com | 1 day (UK number regulatory bundle) |

**Minimum to launch day one:** items 1 + 2 + 7. Everything else can be switched on one at a time — leads can be logged manually or via the in-app simulator until then.

---

## 1. Hosting & domain (required first)

- Any Linux VPS (~£5–10/mo) or PaaS (Railway/Render). Must be a **UK/EU region** per the PRD's data-residency requirement (e.g. Hetzner Falkenstein, DO London, Railway EU).
- A subdomain pointed at it, with HTTPS (Caddy/Nginx + Let's Encrypt, or automatic on PaaS).
- The repo ships with a `Dockerfile` + `docker-compose.yml` — one command deploy.
- Set `APP_URL=https://app.yourdomain.co.uk` in `.env`. Webhooks and OAuth callbacks all derive from it.
- I also need: **`JWT_SECRET`** — just generate one (`openssl rand -hex 32`).

## 2. AI — scheduling assistant & message drafting

**Powers:** voice/text → proposed next-day schedule (§11.1), and AI-drafted follow-up messages.

Provide **one** of:
- `ANTHROPIC_API_KEY` — from console.anthropic.com → API Keys (recommended)
- `OPENAI_API_KEY` — from platform.openai.com (this one also enables server-side Whisper transcription of audio; without it, voice input still works using the phone/browser's built-in speech-to-text, which is free)

Cost is usage-based — for one scheduling run per day, expect **pennies per day**. Without any key the built-in rule-based scheduler still produces a valid, constraint-checked schedule (drivers, skills, holidays, no double-booking) — the LLM just makes it smarter about free-text instructions and priorities.

## 3. WhatsApp Business Platform (Meta Cloud API)

**Powers:** customer WhatsApp conversations in the CRM, sending quotes as PDF documents, automatic quote follow-ups (§9.1, §9.4, §10.2).

What I need from you/Paul:
1. **A Meta Business Manager (Business Portfolio)** for Paul Douglas Roofing, verified (business.facebook.com → Settings → Business Verification — needs Companies House details or a utility bill).
2. **A dedicated phone number for WhatsApp Business** — cannot be a number actively used on Paul's personal WhatsApp app. A cheap SIM or VoIP number works. (Migrating his existing business number is possible but takes it off his phone app — discuss with Paul.)
3. In **developers.facebook.com**: create an app (type: Business) → add the WhatsApp product. From there I need:
   - `WHATSAPP_ACCESS_TOKEN` — a **permanent System User token** (Business Settings → System Users → create → assign the app + WhatsApp account → generate token with `whatsapp_business_messaging` + `whatsapp_business_management` scopes). Not the 24-hour test token.
   - `WHATSAPP_PHONE_NUMBER_ID` (WhatsApp → API Setup screen)
   - `WHATSAPP_BUSINESS_ACCOUNT_ID` (the WABA ID, same screen)
   - `META_APP_SECRET` (App Settings → Basic)
4. **Webhook configuration** (I give you the values; you paste them in the app dashboard → WhatsApp → Configuration):
   - Callback URL: `{APP_URL}/api/webhooks/whatsapp`
   - Verify token: whatever we set as `META_VERIFY_TOKEN` in `.env`
   - Subscribe to the `messages` field.
5. **Message templates submitted for approval** (Business Manager → WhatsApp Manager → Message Templates). Meta requires pre-approved templates for any business-initiated message (quotes, follow-ups). Drafts to submit (also in Settings → Templates in the app):
   - `quote_sent` — "Hi {{1}}, thanks for having us out. Your quotation from Paul Douglas Roofing is attached. Any questions, just reply here."
   - `quote_followup` — "Hi {{1}}, just checking you received our quotation for {{2}}. How are you getting on with it? Happy to answer any questions."
   - Approval typically takes minutes–48h; occasionally rejected and needs rewording. **Submit these early** — it's the only external review that can delay the WhatsApp go-live.

**Platform rule to be aware of:** WhatsApp allows free-form replies only within 24h of the customer's last message; outside that window only approved templates can be sent. The app handles this automatically (templates for outbound-initiated, free-form inside the window).

**Team WhatsApp group caveat (from the PRD):** Meta's API cannot join or read Paul's existing personal team group — that's a hard platform limit. The app ships with per-job chat + an all-staff channel as the replacement; the customer-facing WhatsApp integration is unaffected.

## 4. Facebook Page — Messenger + Lead Ads

**Powers:** FB page messages and lead-form submissions land in the same CRM inbox (§10.1).

What I need:
1. Paul must have **admin access to the Facebook Business Page** (already assumed in the PRD).
2. Same Meta app as WhatsApp — add **Messenger** and **Webhooks** products:
   - `FB_PAGE_ID` — from the page's About section or Page settings
   - `FB_PAGE_ACCESS_TOKEN` — Messenger → Settings → generate token for the page (via the System User for a non-expiring one)
3. Webhook (same style as WhatsApp): Callback URL `{APP_URL}/api/webhooks/facebook`, verify token = `META_VERIFY_TOKEN`, subscribe to `messages`, `messaging_postbacks`, and `leadgen`.
4. **Meta App Review** for `pages_messaging` and `leadgen` permissions before it works with real public traffic (in Development mode it already works for admins/testers — good for our testing). Review needs a screen recording of the feature; I'll produce that. Allow 1–3 weeks.

## 5. Google Calendar

**Powers:** site visits booked in the CRM appear in Paul's calendar with reminders; moves/cancellations sync back; visit-passed → auto stage change (§9.3).

What I need:
1. In **console.cloud.google.com** (any Google account, ideally the business one): new project → enable **Google Calendar API** → OAuth consent screen (External, add Paul's email as test user) → Credentials → **OAuth Client ID (Web application)**:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - Authorised redirect URI: `{APP_URL}/api/integrations/google/callback`
2. Then **Paul clicks "Connect Google Calendar" once** in Settings → Integrations and grants access. Tokens are stored encrypted server-side; no passwords.
3. While the app is in Google's "Testing" mode, tokens expire weekly — fine for development. For go-live either publish the consent screen (simple) or keep it internal to a Google Workspace org.

## 6. QuickBooks Online (UK)

**Powers:** invoice created from a completed job → pushed into QuickBooks; payment status syncs back; overdue → chase task (§10.3).

What I need:
1. Confirmation the business has an **active QuickBooks Online UK subscription** and Paul's admin login for it.
2. In **developer.intuit.com**: create an app (QuickBooks Online Accounting scope) →
   - `QBO_CLIENT_ID`
   - `QBO_CLIENT_SECRET`
   - Redirect URI registered as: `{APP_URL}/api/integrations/quickbooks/callback`
3. Start with `QBO_ENVIRONMENT=sandbox` (Intuit gives a free fake company for testing), then switch to `production` after Intuit's production-key questionnaire (~1 day).
4. Then **Paul clicks "Connect QuickBooks" once** in Settings → Integrations. The company (realm) ID is captured automatically during that handshake.

## 7. Outbound email (SMTP)

**Powers:** quotes by email, the email leg of follow-ups, holiday/task notifications.

What I need — standard SMTP credentials from wherever their email lives:
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- If they're on Microsoft 365 or Google Workspace, an app password / SMTP relay works but has daily caps — for automated follow-ups I recommend a transactional provider (SendGrid/Mailgun/Postmark free tier) with their domain's SPF+DKIM DNS records set (I'll supply the exact records once the provider is chosen).

## 8. Inbound email → lead inbox

**Powers:** enquiries emailed to their existing addresses become leads automatically (§9.1).

Cheapest reliable route (no change visible to customers):
1. Create a parse address on SendGrid **Inbound Parse** or Mailgun **Routes** pointing at `{APP_URL}/api/webhooks/email?secret={EMAIL_INBOUND_SECRET}`.
2. Add a **forwarding rule** on each existing enquiry mailbox (office@…, info@…) → the parse address.
3. I need: the provider login (or they set the webhook URL themselves) + the list of mailbox addresses to treat as enquiry channels.

(Alternative if forwarding isn't possible: give me IMAP host/user/password for each mailbox and I'll switch the adapter to polling — it's a config change, already catered for.)

## 9. Phone & SMS capture (optional, recommended later)

**Powers:** missed calls/SMS to the business number create leads with caller ID (§9.1). The two personal mobiles are best kept out of scope initially — calls to those get logged with one tap using the app's "Log enquiry" quick-add.

If wanted: a **Twilio** account (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_NUMBER`) with a UK number that the office number forwards to (or that becomes the advertised number). Webhooks: `{APP_URL}/api/webhooks/twilio/voice` and `/api/webhooks/twilio/sms`. UK numbers require Twilio's regulatory bundle (proof of business address) — allow a day.

---

## What I do NOT need from you

- No passwords for Google/QuickBooks/Facebook — those connect via OAuth buttons Paul clicks himself.
- No card details. All accounts are opened in the business's name so they own everything.
- No changes to how customers contact them — existing numbers/emails/pages keep working; they just start feeding the CRM.

## Suggested order

1. Hosting + domain + JWT secret → deploy (day 1)
2. AI key + SMTP → live quotes by email, live AI scheduling (day 1)
3. WhatsApp: business verification + templates submitted (start immediately — the only real waiting line)
4. Google Calendar + QuickBooks sandbox (day 1–2, then Paul clicks Connect)
5. Facebook app review (start early, arrives when it arrives)
6. Inbound email forwarding (hour job, any time)
7. Twilio (optional, later)
