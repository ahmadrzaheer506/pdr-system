# Integration setup guide

This guide walks through each connected service, one at a time:

1. What it does in your roofing CRM  
2. How to create the account  
3. Where to find the keys  
4. What to copy and send to your developer  

You do **not** paste keys into the CRM screens. After you collect them, your developer puts them on the server. Then you click **Connect** in the CRM where this guide says so.

**Contents**

1. [Google Calendar](#1-google-calendar)  
2. [Email (Mailgun + inbound)](#2-email-mailgun--inbound-parse)  
3. [QuickBooks Online (UK)](#3-quickbooks-online-uk)  
4. [WhatsApp Business](#4-whatsapp-business-meta-cloud-api)  
5. [Facebook Page](#5-facebook-page-messenger--lead-ads)  
6. [AI scheduling assistant](#6-ai--scheduling-assistant)  
7. [Phone & SMS (Twilio)](#7-phone--sms-capture-twilio--optional)  
8. [After keys are saved](#after-your-developer-has-saved-the-keys)  
9. [Copy-and-send checklist](#copy-and-send-checklist)

### Please read before starting

Please create or sign in to the company accounts, copy the details listed below, and complete the **Connect** steps when your developer asks you to. They will place the keys on the server.

**Important:**

- Some services need **paid plans**, **business verification**, or **provider approval** before they work with real customers. A test setup is not automatically live.  
- Please do **not** switch a test integration (sandbox / Testing mode) to production until your developer confirms it is ready.  
- Please never send passwords, API keys or access tokens in WhatsApp, SMS, or ordinary email, and never send a screenshot that shows a secret. A **password manager** (1Password, Bitwarden, or similar) is the safest way to share them. Please send only the credentials they asked for.  
- If a screen does not match these instructions, please pause and ask your developer — provider menus change often.  
- Before using an integration with customers, please ask your developer to complete a **test** and confirm it is working.

Until a service is fully connected, the CRM still runs. Email, calendar, QuickBooks, Facebook and phone capture stay in **Simulated** mode (they log what would have been sent, but do not send for real). **WhatsApp is different:** sending a quote on WhatsApp shows an error until the token, phone ID and (usually) templates are in place. The rest of the CRM is unaffected.

**Need help?** Google, Meta and Mailgun update their dashboards regularly. If you would like a hand with any step, please ask your developer or IT contact to join a short screen-share.

**Before you start, ask your developer for:**

- Your **live** CRM website address with **HTTPS**, for example `https://crm.yourcompany.co.uk`  
  In this guide that is written as **YOUR_CRM_URL**. Production Google, Meta, Mailgun and Twilio cannot use `localhost`.  
- How they want secrets delivered (password manager is best).

### Two phases

1. **Account setup and approval (you):** create accounts, verify the business where asked, copy Client IDs and similar **non-secret** labels, and send secrets only through the agreed secure method.  
2. **Technical setup and testing (developer, then you):** they save credentials on the server, register webhook and callback URLs, handle OAuth, and confirm production access. You then click **Connect** only where they say so.

The callback and webhook addresses in this guide match this CRM (`/api/integrations/...` and `/api/webhooks/...`). Your developer still registers the **exact** HTTPS URLs in each provider dashboard. Please use only the URLs they confirm.

If a screen name at Google, Intuit, Meta, Mailgun or Twilio has changed slightly, look for the same words (API keys, Redirect URI, Webhooks, Phone numbers). At Google, that may now sit under **Google Auth Platform** instead of **APIs & Services** — the **Client ID** and **Client Secret** fields are still the same.

---

## 1. Google Calendar

**What it does:** Site visits, jobs, holidays and tasks from the CRM appear on a **Paul Douglas Roofing** calendar inside each office user’s Google account. Each person connects **their own** Google account from **Profile** after the company keys are on the server. Create and edit in the CRM; nothing is sent until that person has connected.

**What you need:** a Google account (Workspace or personal Gmail).

Google’s console changes often. You may see the classic path **APIs & Services**, or the newer **Google Auth Platform** (sometimes **Google Auth Platform → Clients**). Either is fine. Look for **Client ID** and **Client Secret** — those names stay the same. If the menus differ, please ask your developer to join a short screen-share.

### A. Create a Google Cloud project

1. Open [https://console.cloud.google.com](https://console.cloud.google.com) and sign in.  
2. At the top, open the project picker (it may say “Select a project”).  
3. Click **New project**.  
4. Name it something clear, for example `Paul Douglas Roofing CRM`.  
5. Click **Create**, then select that project.

### B. Turn on the Calendar API

1. In the left menu open **APIs & Services** → **Library**.  
2. Search for **Google Calendar API**.  
3. Open it and click **Enable**.

### C. Fill in the OAuth consent screen (the “this app wants Calendar” page)

1. Go to **APIs & Services** → **OAuth consent screen** (or **Google Auth Platform** → **Branding** / **Audience** / **Data access** — same job: the page customers see when they allow Calendar).  
2. Choose **External** (unless you only use Google Workspace users in your company domain, in which case **Internal** is fine).  
3. App name: your company name.  
4. User support email: your office email.  
5. Developer contact: the same email.  
6. Save.  
7. On **Scopes**, click **Add or remove scopes**. Add:  
   - `https://www.googleapis.com/auth/calendar`  
     (or the Calendar scopes Google lists for “See, edit, share, and permanently delete all the calendars you can access”).  
8. Save.  
9. If the app is in **Testing**, under **Test users** add every office Gmail that will click Connect (including yours).

### D. Create the Client ID and Client Secret

1. Go to **APIs & Services** → **Credentials**, or **Google Auth Platform** → **Clients**.  
2. Click **Create credentials** → **OAuth client ID** (or **Create client**).  
3. Application type: **Web application**.  
4. Name: `CRM Google Calendar`.  
5. Under **Authorised redirect URIs**, click **Add URI** and enter **exactly**:

   `YOUR_CRM_URL/api/integrations/google/callback`

   Example: `https://crm.yourcompany.co.uk/api/integrations/google/callback`

   No extra slash at the end. It must match what your developer puts on the server. Google does not create this address for you — the CRM already implements it. Production **YOUR_CRM_URL** must start with `https://`.

6. Click **Create**.  
7. Copy:

| Name to send your developer | Where it is |
| --- | --- |
| `GOOGLE_CLIENT_ID` | “Client ID” |
| `GOOGLE_CLIENT_SECRET` | “Client secret” (click to reveal) |
| `GOOGLE_REDIRECT_URI` | The same redirect URI you just added |

### E. After keys are on the server

1. In the CRM, Google Calendar should show **keys present** (not missing) on **Settings → Integrations**.  
2. Each office user opens **Profile** (your name / photo) → **Google Calendar** → **Connect**. Settings → Integrations also has Connect for the person who is signed in.  
3. Sign in with Google and allow Calendar access.  
4. Look in Google Calendar for a calendar named **Paul Douglas Roofing**. Nothing is pushed until that person has connected. Test **each** office user who needs a calendar, not only the owner.

While the Google app is in **Testing**, only listed **Test users** can Connect, and Google may expire those connections about weekly. That is normal until the app is published / verified.

### F. Production (all staff, not only testers) — developer handles this

A testing-mode app is **not** automatically ready for every office Gmail. For real company-wide use, Google may require:

- Publishing the OAuth consent screen (or **Internal** if you use Google Workspace only)  
- A public homepage and a **privacy policy** URL  
- Verified domains  
- **OAuth verification** if Google asks for it (calendar access is sensitive)

This CRM writes visits, jobs, holidays and tasks onto each connected calendar, so it requests full Calendar access (`https://www.googleapis.com/auth/calendar`). Your developer confirms the scopes, verification paperwork, and HTTPS redirect. **Do not** try to complete Google’s verification questionnaire yourself unless they ask you to upload a privacy page.

Until they confirm production is ready, keep using **Test users** and treat calendar sync as a trial.

---

## 2. Email (Mailgun + inbound parse)

**What it does:** Sends real emails from the CRM (quotes, follow-ups, login emails). Optional inbound parse puts emails that customers send back into the CRM.

**What you need:** a Mailgun account and a domain you control (for example `pauldouglasroofing.co.uk` or a subdomain like `mg.pauldouglasroofing.co.uk`).

### A. Create a Mailgun account

1. Open [https://www.mailgun.com](https://www.mailgun.com) → **Sign up**.  
2. Use the office email and a strong password.  
3. Confirm the email Mailgun sends you.  
4. Choose a plan. A trial is usually enough to **test**. Ongoing sending to real customers typically needs a paid plan and a **verified** domain — ask Mailgun or your developer which plan you are on. Plans and sending limits differ; do not assume every account behaves the same.

### B. Add and verify your sending domain

1. In Mailgun open **Sending** → **Domains** → **Add new domain**.  
2. Enter the domain. Please **ask your IT person or developer first** whether to use the main website domain or a subdomain such as `mg.…`.  
3. Mailgun shows DNS records (usually **SPF**, **DKIM**, and sometimes **CNAME** / tracking).  
4. Please copy Mailgun’s table (or a screenshot) and send it to whoever manages the domain (IT, your developer, or the registrar such as GoDaddy, Cloudflare or 123-Reg). They should add the records **exactly** as Mailgun lists them. Incorrect DNS can affect company email, not only CRM sending.  
5. When they confirm the records are saved, go back to Mailgun and click **Verify DNS settings**. Wait until the domain is **Active** / verified. This can take from minutes to a few hours.

Please complete DNS as Mailgun shows it, rather than writing SPF or DKIM values from memory. An unverified domain often cannot send reliably to real inboxes — your developer can confirm deliverability for **your** plan and region.

### C. Copy the sending keys (you)

1. **API key:** Mailgun → **Settings** (or your profile) → **API keys** → **Private API key** (sometimes labelled “Mailgun API key”). Copy it once; it may not be shown again.  
2. **Domain:** the verified domain name, for example `mg.pauldouglasroofing.co.uk`.  
3. **From address:** the name customers will see, for example  
   `Paul Douglas Roofing <office@pauldouglasroofing.co.uk>`  
   The email part should be allowed on that Mailgun domain.  
4. **Region:** if you signed up on Mailgun **EU** (app.eu.mailgun.com), this is `eu`. The US dashboard is `us`. Your developer must use the same region as the dashboard.

| Name to send your developer | What to copy |
| --- | --- |
| `MAILGUN_API_KEY` | Private API key (Mailgun → Settings → API keys) |
| `MAILGUN_DOMAIN` | Verified domain |
| `MAILGUN_FROM` | Display name + from address |
| `MAILGUN_REGION` | `us` or `eu` |

### D. Inbound email (optional) — developer configures this

This lets replies and inbound messages hit the CRM. **Do not invent a secret or paste a webhook URL yourself** unless your developer asks.

Your developer will:

1. Generate `EMAIL_INBOUND_SECRET` on the server (this CRM currently checks that secret on the inbound URL).  
2. Register an HTTPS POST route at:

   `YOUR_CRM_URL/api/webhooks/email?secret=…`

3. Paste that URL into Mailgun **Receiving** → **Create route** (or **Inbound**).  
4. Confirm **receiving MX** records (inbound is separate from sending SPF/DKIM) with whoever manages DNS.  
5. Also turn on Mailgun’s **signed webhook** check (signature + timestamp) on the server. Do not send the inbound URL or its secret in WhatsApp or ordinary email.

You only need to tell them which mailbox should become leads (for example `quotes@…` or a catch-all on the Mailgun domain). They may also ask you to **forward** existing office mailboxes to that parse address so customers keep writing to the same address.

Until Mailgun sending is live, the CRM still records “email sent” in simulated mode; customers do not receive it.

---

## 3. QuickBooks Online (UK)

**What it does:** Pushes quotes/estimates and invoices into QuickBooks, and can bring payment status back. **Only the owner / admin** clicks **Connect** in **Settings → Integrations**.

**What you need:** a QuickBooks Online **UK** company, plus a free Intuit Developer account (same Intuit login is fine).

### A. Create or log in to QuickBooks Online UK

1. Open [https://quickbooks.intuit.com/uk](https://quickbooks.intuit.com/uk) and sign in (or create the company).  
2. For testing, Intuit also gives a **sandbox** company from the developer site. Use sandbox first so live accounts are not filled with test invoices.

### B. Create an app at Intuit Developer

1. Open [https://developer.intuit.com](https://developer.intuit.com) and sign in with the same Intuit account.  
2. Go to **My Hub** / **Dashboard** → **Create an app**.  
3. Choose **QuickBooks Online and Payments**.  
4. Name the app, for example `Paul Douglas Roofing CRM`.  
5. Under scopes / APIs, select **Accounting** (`com.intuit.quickbooks.accounting`). You do not need Payments unless you later add card checkout.

### C. Where the keys are (sandbox first)

1. Open your app.  
2. Open the **Keys & credentials** (or **Keys**) tab.  
3. There are two sets: **Development (sandbox)** and **Production**.  
4. Start with **Development**:

| Name to send your developer | Where it is |
| --- | --- |
| `QBO_CLIENT_ID` | Client ID |
| `QBO_CLIENT_SECRET` | Client secret |
| `QBO_REDIRECT_URI` | See next step |
| `QBO_ENVIRONMENT` | Type `sandbox` for testing. Leave production until your developer says so. Keep sandbox and production Client IDs **separate**. |

### D. Redirect URI (must match exactly)

1. In the same Keys screen, find **Redirect URIs**.  
2. Add:

   `YOUR_CRM_URL/api/integrations/quickbooks/callback`

   Example: `https://crm.yourcompany.co.uk/api/integrations/quickbooks/callback`

3. Save. Copy that exact URI as `QBO_REDIRECT_URI`.

### E. Connect in the CRM (sandbox first)

1. After the developer has saved the **Development** keys, open **Settings → Integrations**.  
2. On **QuickBooks Online (UK)** click **Connect**.  
3. Sign in to Intuit and allow access to the **sandbox** company while `QBO_ENVIRONMENT=sandbox`.  
4. The CRM handles sign-in, token refresh, disconnect and reconnect. If Connect fails, do not keep retrying with production keys — tell your developer.

Sandbox invoices go to Intuit’s test company, not your real accounts.

### F. Going live (production) — wait for the developer

Production Client ID and Secret **alone** are not enough. Intuit usually requires the app to meet **production** requirements (questionnaire / review) before live UK books can be used.

**Do not** change `QBO_ENVIRONMENT` from `sandbox` to `production` yourself. Ask your developer to confirm:

- Production keys and the **same** redirect URI on the Production tab  
- App production status / approval  
- Accounting scope  
- A successful **Connect** to the **live** company (they will ask you to Disconnect, then Connect and pick the real company)

Switching too early can fail, or keep talking to the sandbox by mistake.

---

## 4. WhatsApp Business (Meta Cloud API)

**What it does:** Sends quotes and follow-ups on WhatsApp, and can receive WhatsApp messages into the CRM.

**What you need:** a Facebook/Meta account, a **Meta Business** account, and a phone number you can use for WhatsApp Business (not your personal WhatsApp on the same number).

Meta’s screens change often. Look for **WhatsApp** → **API Setup** inside a developer app.

**Business verification and App Review:** Meta usually asks you to verify the business (Companies House details, address, sometimes a director’s ID). Messages to **real customers** (anyone who is not a listed tester) also need **App Review**. Template approval is often hours to two days; **App Review for public traffic can take days to a few weeks**. Do not panic if day-one tests only work for numbers you added as testers. Until Meta approves public traffic, send only to test phones — do not message customers yet. Your developer can submit App Review with you. Quote PDFs on WhatsApp also need the live CRM address to be public **HTTPS** (not localhost).

### A. Create a Meta developer app

1. Open [https://developers.facebook.com](https://developers.facebook.com) and log in.  
2. **My Apps** → **Create App**.  
3. Use type **Business**.  
4. App name: your company.  
5. Attach / create a **Business portfolio** if asked.

### B. Add WhatsApp

1. In the app dashboard, **Add product** → **WhatsApp** → **Set up**.  
2. Open **WhatsApp** → **API Setup**.  
3. Meta gives a **test number** first. You can send to numbers you add as testers. For customers you later add a real business number.

### C. Copy these IDs and tokens

On **API Setup** you will see:

| Name to send your developer | Where it is |
| --- | --- |
| `WHATSAPP_PHONE_NUMBER_ID` | “Phone number ID” (a long number, **not** the +44 display number) |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | “WhatsApp Business Account ID” (WABA ID) |
| `WHATSAPP_ACCESS_TOKEN` | Prefer a **System user** token (below). The short “temporary access token” on API Setup expires quickly. |

**System user token (recommended):**

1. Open [https://business.facebook.com](https://business.facebook.com) → **Business settings**.  
2. **Users** → **System users** → **Add**.  
3. Generate a token: assign the WhatsApp app, permissions such as `whatsapp_business_messaging` and `whatsapp_business_management`.  
4. Copy the token once. That is `WHATSAPP_ACCESS_TOKEN`.

A system-user token is the right long-term choice, but it is **not** guaranteed forever — Meta can expire or revoke it, and permissions depend on the app. Your developer must confirm token expiry, assigned WhatsApp number / WABA, permissions, app mode (Development vs Live), webhook subscription, and production approval. **Do not** assume public customer messaging works the same day you copy the keys.

### D. App secret and verify token (shared with Facebook)

| Name | How to get it |
| --- | --- |
| `META_APP_SECRET` | Developers app → **App settings** → **Basic** → **App secret** (Show) |
| `META_VERIFY_TOKEN` | Your **developer invents** this (Meta does **not** generate it). You type the **same** string in Meta’s webhook settings if they ask you to paste it. |

### E. Webhook (so incoming WhatsApp reaches the CRM)

Ask your developer for the exact URL and verify token, then (or they do this on a screen-share):

1. WhatsApp → **Configuration** → **Webhook**.  
2. Callback URL (HTTPS, no extra slash):

   `YOUR_CRM_URL/api/webhooks/whatsapp`

3. Verify token: the same `META_VERIFY_TOKEN`.  
4. Verify and save.  
5. Subscribe to **messages**.

### F. Message templates (quotes and follow-ups)

WhatsApp only allows free-form messages inside a short **customer-service window** (typically 24 hours after the customer last messaged you). **Approved templates** are generally required when your business **starts** the conversation or writes after that window — not only for “marketing-style” texts.

1. In **Meta Business Suite** or WhatsApp Manager → **Message templates**.  
2. Create templates whose **names** match this CRM unless your developer maps different names:  
   - `quote_sent` — body with one variable `{{1}}` (first name). Example:  
     `Hi {{1}}, thanks for having us out. Your quotation from Paul Douglas Roofing is attached. Any questions, just reply here.`  
   - `quote_followup` — two variables `{{1}}` (first name) and `{{2}}` (job / quote title). Example:  
     `Hi {{1}}, just checking you received our quotation for {{2}}. How are you getting on with it? Happy to answer any questions.`  
3. Language: **English (UK)** or **English (US)**. This CRM tries both (`en_GB` and `en_US`).  
4. Wait for **Approved**. Approval in Meta does **not** by itself mean the CRM can send it — the **name** and **number of variables** must match.  
5. Tell your developer the exact names (`WHATSAPP_TEMPLATE_QUOTE`, `WHATSAPP_TEMPLATE_FOLLOWUP`) if they differ from `quote_sent` / `quote_followup`.  
6. The Cloud API number must be the one whose Phone number ID you copied.  
7. Test with a **staff phone** first. Never use a customer number until that test succeeds.

Until WhatsApp is connected **and** templates (or a 24-hour customer reply) are in place, sending a quote on WhatsApp from the CRM will fail.

---

## 5. Facebook Page (Messenger + Lead Ads)

**What it does:** Facebook Page messages and Lead Ad form submissions can land in the CRM inbox.

**What you need:** a Facebook **Page** for the company (you must be a Page admin), and usually the **same Meta app** as WhatsApp.

Messenger and Lead Ads are **separate** features. A Page access token alone does **not** mean every public message or every Lead Ad will appear in the CRM. Your developer confirms Page access, webhook subscription on the Page, and the extra permissions / App Review for each feature.

### A. Page ID

1. Open your Facebook Page.  
2. **About** / **Page transparency** / **Settings** — copy **Page ID**.  
   Or: Page **Settings** → **Page info** → Page ID.

That is `FB_PAGE_ID`.

### B. Page access token

1. In [https://developers.facebook.com](https://developers.facebook.com) open your app.  
2. Add products **Messenger** and (for forms) **Webhooks** / **Lead Ads** if not already added.  
3. Messenger → **Settings** → **Access Tokens** → generate a token for your Page.  
4. For a longer-lived token, create a **System user** in Business settings, assign the Page, and generate a token. Typical permissions: `pages_messaging` (and related Page metadata) for Messenger; extra lead permissions such as `leads_retrieval` / `pages_manage_ads` **only if** you use Lead Ads. Your developer confirms the current Meta list — do not grant extra permissions “just in case”. Tokens can still expire or be revoked.

That token is `FB_PAGE_ACCESS_TOKEN`.

`META_APP_SECRET` and `META_VERIFY_TOKEN` are the **same values** as WhatsApp (one app, two products).

### C. Facebook webhook

Ask your developer for the URL and verify token (same `META_VERIFY_TOKEN` as WhatsApp), then:

1. App → **Webhooks**.  
2. Callback URL:

   `YOUR_CRM_URL/api/webhooks/facebook`

3. Verify token: same `META_VERIFY_TOKEN`.  
4. Subscribe the **Page** (not only the app) to **messages**, **messaging_postbacks**, and **leadgen** if you use Lead Ads.

### D. Business verification and App Review

Test users and Page admins can use this immediately. For the **public** (any customer messaging the Page or submitting a Lead Ad), Meta requires **business verification** (company documents) and **App Review**. Your developer or an agency usually submits that.

Approval is **not instant**. It can take from a few days to a few weeks. That is normal — do not assume the CRM is broken. Until Meta approves public traffic, testers and Page admins can try it; real customer messages and Lead Ads may not appear yet.

---

## 6. AI — scheduling assistant

**What it does:** Lets office type or speak a schedule instruction in **Schedule & AI**. Without a key, the CRM still proposes a schedule using its **built-in rules** (skills, drivers, holidays). A key gives fuller natural-language understanding.

Pick **one** provider (Claude **or** the OpenAI API) unless your developer asked for both. You do not need two keys.

**Cost:** An API key is billed **separately** from a ChatGPT website plan. ChatGPT Plus does **not** pay for `OPENAI_API_KEY`. Add a small usage limit / credit with the provider you choose. Without a key, the CRM still builds a schedule from its own rules.

An API key does not turn on every extra. Voice transcription uses OpenAI Whisper **only** if you add an OpenAI key. Typing and the browser microphone still work without it. Your developer confirms which provider this CRM is set to use.

### Option A — Anthropic (Claude)

1. Open [https://console.anthropic.com](https://console.anthropic.com) and create an account.  
2. Add billing if asked.  
3. Go to **API keys** → **Create key**.  
4. Copy it once.

| Name | Value |
| --- | --- |
| `ANTHROPIC_API_KEY` | The key |
| `AI_PROVIDER` | `anthropic` (or `auto`) |

### Option B — OpenAI (ChatGPT)

1. Open [https://platform.openai.com](https://platform.openai.com) and sign up.  
2. Add billing.  
3. **API keys** → **Create new secret key**.  
4. Copy it once.

| Name | Value |
| --- | --- |
| `OPENAI_API_KEY` | The key |
| `AI_PROVIDER` | `openai` (or `auto`) |

Voice-to-text on the schedule page works better with an OpenAI key (Whisper). Without it, the browser microphone or typing still works.

---

## 7. Phone & SMS capture (Twilio) — optional

**What it does:** Calls or SMS to a dedicated number can become leads in the inbox. Until this is connected, staff use **Log enquiry** instead.

### A. Create a Twilio account

1. Open [https://www.twilio.com](https://www.twilio.com) → **Sign up**.  
2. Verify your email and mobile.  
3. Complete the console welcome questions.

### B. Copy account keys

1. Open the Twilio **Console** home.  
2. The first panel shows:

| Name | Where it is |
| --- | --- |
| `TWILIO_ACCOUNT_SID` | Account SID (starts with `AC`) |
| `TWILIO_AUTH_TOKEN` | Auth Token (click to show) |

### C. Buy a UK number (regulatory checks may apply)

Choosing **United Kingdom** and clicking **Buy** is **not** always enough. Twilio often asks for identity, address or **business documents** before a UK number can send or receive. Complete every verification Twilio shows. Allow about a day. Some number types may be unavailable on your account until that bundle is approved.

1. Console → **Phone Numbers** → **Buy a number**.  
2. Country: **United Kingdom**.  
3. Tick **Voice** and **SMS** if you want both.  
4. Finish any **Regulatory** / **Trust Hub** forms Twilio requests.  
5. Copy the number in international form, for example `+441234567890`. That is `TWILIO_NUMBER`.

### D. Point the number at the CRM

Ask your developer to confirm these URLs, then:

1. Open the number → **Configure**.  
2. **A call comes in** (webhook / HTTP POST):

   `YOUR_CRM_URL/api/webhooks/twilio/voice`

3. **A message comes in**:

   `YOUR_CRM_URL/api/webhooks/twilio/sms`

4. Save.

Trial accounts can only call or SMS **verified test numbers** until you upgrade.

Ask your developer to test **inbound voice** and **inbound SMS** as two separate checks. This CRM is set up to **capture** inbound calls and texts as enquiries. If you later send outbound SMS to customers, confirm consent and UK messaging rules with your developer first.

---

## After your developer has saved the keys

1. Restart / redeploy the CRM (they will do this).  
2. Open **Settings → Integrations**.  
3. Each card should move from **Simulated** toward **Live** or “keys present”. Connect buttons appear only when the required keys are on the server.  
4. Click **Connect** only where the card has a Connect button:  
   - **Google Calendar:** each user, on **Profile**  
   - **QuickBooks:** owner, on **Settings → Integrations**  
5. Ask the developer to confirm a test, then you: send a test quote **email**, **Connect** one Google Calendar from Profile, and (if WhatsApp is live) send an approved template to a **staff** phone. Quote PDFs on WhatsApp only attach when `YOUR_CRM_URL` is public HTTPS. Do not use customer numbers or live QuickBooks until they say the test passed.

---

## Copy-and-send checklist

Send this list through a **password manager** (not WhatsApp or ordinary email). Leave a line blank if you are not using that service yet. Names below match this CRM’s server settings.

```
CRM public URL (YOUR_CRM_URL must be https:// for live webhooks):

Google Calendar
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=     (https://…/api/integrations/google/callback)

Email / Mailgun
MAILGUN_API_KEY=
MAILGUN_DOMAIN=
MAILGUN_FROM=
MAILGUN_REGION=          (us or eu — must match the Mailgun dashboard)
EMAIL_INBOUND_SECRET=    (developer generates this; do not invent or paste in chat)

QuickBooks Online UK     (sandbox keys first; production keys are a separate set)
QBO_CLIENT_ID=
QBO_CLIENT_SECRET=
QBO_REDIRECT_URI=        (https://…/api/integrations/quickbooks/callback)
QBO_ENVIRONMENT=         (sandbox until the developer confirms production)

WhatsApp
WHATSAPP_ACCESS_TOKEN=   (system-user token; can still expire or be revoked)
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_TEMPLATE_QUOTE=     (default quote_sent — exact Meta name)
WHATSAPP_TEMPLATE_FOLLOWUP=  (default quote_followup — exact Meta name)

Meta (shared by WhatsApp + Facebook)
META_APP_SECRET=
META_VERIFY_TOKEN=       (developer invents this; Meta does not generate it)

Facebook Page
FB_PAGE_ID=
FB_PAGE_ACCESS_TOKEN=

AI (fill one provider unless the developer asked for both)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=          (API billing is not ChatGPT Plus)
AI_PROVIDER=             (auto, anthropic, or openai)

Twilio (optional)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_NUMBER=
```

Treat every value like a password. Store production credentials only on the server (environment variables or a secrets manager) — never in the CRM screens, a public folder, or frontend code. If a key is leaked, revoke it in that provider’s dashboard and create a new one immediately.