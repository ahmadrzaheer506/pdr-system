# Integration setup guide (for office / owners)

This guide is for a **non-technical owner or office manager**. It explains, one service at a time:

1. What the integration does in your roofing CRM  
2. How to create the account  
3. Where to click to find the keys  
4. What to copy and send to your IT person / developer  

You do **not** paste keys into the CRM screens. After you collect them, your developer puts them on the server. Then you click **Connect** in the CRM where this guide says so.

You can download this same guide as a **PDF** from **Settings → Integrations → Download PDF**.

**Before you start, ask your developer for:**

- Your live CRM website address, for example `https://crm.yourcompany.co.uk`  
  In this guide that is written as **YOUR_CRM_URL**.  
- A password manager or a secure email thread (never WhatsApp a screenshot of a secret key).

Until a service is fully connected, the CRM still works. That service just stays in **Simulated** mode (it logs what would have been sent, but does not send for real).

---

## How to use this guide

For each service below:

1. Create the account (or log in if you already have one).  
2. Follow the numbered clicks.  
3. Copy each value into a note with the **exact name** shown (for example `GOOGLE_CLIENT_ID`).  
4. Send the completed list to your developer.  
5. When they confirm it is on the server, complete any **Connect** step in the CRM.

If a screen name at Google, Intuit, Meta, Mailgun or Twilio has changed slightly, look for the same words (API keys, Redirect URI, Webhooks, Phone numbers). The idea stays the same.

---

## 1. Google Calendar

**What it does:** Site visits, jobs, holidays and tasks from the CRM can appear on each office user’s Google Calendar. Each person connects **their own** Google account from **Profile** after the company keys are in place.

**What you need:** a Google account (Workspace or personal Gmail).

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

1. Go to **APIs & Services** → **OAuth consent screen**.  
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

1. Go to **APIs & Services** → **Credentials**.  
2. Click **Create credentials** → **OAuth client ID**.  
3. Application type: **Web application**.  
4. Name: `CRM Google Calendar`.  
5. Under **Authorised redirect URIs**, click **Add URI** and enter **exactly**:

   `YOUR_CRM_URL/api/integrations/google/callback`

   Example: `https://crm.yourcompany.co.uk/api/integrations/google/callback`

   No extra slash at the end. It must match what your developer puts on the server.

6. Click **Create**.  
7. Copy:

| Name to send your developer | Where it is |
| --- | --- |
| `GOOGLE_CLIENT_ID` | “Client ID” |
| `GOOGLE_CLIENT_SECRET` | “Client secret” (click to reveal) |
| `GOOGLE_REDIRECT_URI` | The same redirect URI you just added |

### E. After keys are on the server

1. In the CRM open **Settings → Integrations**. Google Calendar should show keys present, not missing.  
2. Each office user: **Profile → Google Calendar → Connect**.  
3. Sign in with Google and allow Calendar access.  
4. Nothing is pushed until that person has connected.

---

## 2. Email (Mailgun + inbound parse)

**What it does:** Sends real emails from the CRM (quotes, follow-ups, login emails). Optional inbound parse puts emails that customers send back into the CRM.

**What you need:** a Mailgun account and a domain you control (for example `pauldouglasroofing.co.uk` or a subdomain like `mg.pauldouglasroofing.co.uk`).

### A. Create a Mailgun account

1. Open [https://www.mailgun.com](https://www.mailgun.com) → **Sign up**.  
2. Use the office email and a strong password.  
3. Confirm the email Mailgun sends you.  
4. Choose a plan (the free / trial plan is enough to test; you will need a paid plan for ongoing sending).

### B. Add and verify your sending domain

1. In Mailgun open **Sending** → **Domains** → **Add new domain**.  
2. Enter the domain (ask your IT person if you should use the main website domain or a subdomain such as `mg.…`).  
3. Mailgun shows DNS records (usually **SPF**, **DKIM**, and sometimes **CNAME** / tracking).  
4. Log in to where you buy the domain (GoDaddy, Cloudflare, 123-Reg, etc.) and add those records **exactly**.  
5. Back in Mailgun, click **Verify DNS settings**. Wait until the domain is **Active** / verified. This can take from minutes to a few hours.

Do not skip DNS. Unverified domains often cannot send to real customers.

### C. Copy the sending keys

1. **API key:** Mailgun → **Settings** (or your profile) → **API keys** → **Private API key** (sometimes labelled “Mailgun API key”). Copy it once; it may not be shown again.  
2. **Domain:** the verified domain name, for example `mg.pauldouglasroofing.co.uk`.  
3. **From address:** the name customers will see, for example  
   `Paul Douglas Roofing <office@pauldouglasroofing.co.uk>`  
   The email part should be allowed on that Mailgun domain.  
4. **Region:** if you signed up on Mailgun **EU** (app.eu.mailgun.com), this is `eu`. The US dashboard is `us`.

| Name to send your developer | What to copy |
| --- | --- |
| `MAILGUN_API_KEY` | Private API key |
| `MAILGUN_DOMAIN` | Verified domain |
| `MAILGUN_FROM` | Display name + from address |
| `MAILGUN_REGION` | `us` or `eu` |
| `EMAIL_INBOUND_SECRET` | Invent a long random password (letters and numbers). You will type the **same** value in Mailgun in the next step. |

### D. Inbound email (optional but recommended)

This lets replies and inbound messages hit the CRM.

1. Invent `EMAIL_INBOUND_SECRET` (example style: a long random string, not a real password you reuse).  
2. Ask your developer for the inbound webhook URL. It looks like:

   `YOUR_CRM_URL/api/webhooks/email?secret=YOUR_SECRET`

3. In Mailgun go to **Receiving** → **Create route** (or **Inbound**).  
4. Match incoming mail to the address you want (for example a catch-all on the Mailgun domain, or `quotes@…`).  
5. Action: **Forward** / **Store and notify** / webhook — point it at that URL (POST).  
6. Save.

Until Mailgun is live, the CRM still records “email sent” in simulated mode; customers do not receive it.

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
| `QBO_ENVIRONMENT` | Type `sandbox` for testing, later `production` |

### D. Redirect URI (must match exactly)

1. In the same Keys screen, find **Redirect URIs**.  
2. Add:

   `YOUR_CRM_URL/api/integrations/quickbooks/callback`

   Example: `https://crm.yourcompany.co.uk/api/integrations/quickbooks/callback`

3. Save. Copy that exact URI as `QBO_REDIRECT_URI`.

### E. Connect in the CRM

1. After the developer has saved the keys, open **Settings → Integrations**.  
2. On **QuickBooks Online (UK)** click **Connect**.  
3. Sign in to Intuit and allow access to the company (sandbox company while `QBO_ENVIRONMENT=sandbox`).  
4. When you are ready for real books: get **Production** Client ID and Secret, set `QBO_ENVIRONMENT` to `production`, add the **same** redirect URI on the Production keys tab, then **Disconnect** and **Connect** again and pick the live company.

Sandbox invoices go to Intuit’s test company, not your real accounts.

---

## 4. WhatsApp Business (Meta Cloud API)

**What it does:** Sends quotes and follow-ups on WhatsApp, and can receive WhatsApp messages into the CRM.

**What you need:** a Facebook/Meta account, a **Meta Business** account, and a phone number you can use for WhatsApp Business (not your personal WhatsApp on the same number).

Meta’s screens change often. Look for **WhatsApp** → **API Setup** inside a developer app.

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
| `WHATSAPP_ACCESS_TOKEN` | Temporary access token on that page, **or** a permanent token (see below) |

**Permanent token (recommended):**

1. Open [https://business.facebook.com](https://business.facebook.com) → **Business settings**.  
2. **Users** → **System users** → **Add**.  
3. Generate a token: assign the WhatsApp app, permissions such as `whatsapp_business_messaging` and `whatsapp_business_management`.  
4. Copy the token once. That is `WHATSAPP_ACCESS_TOKEN`. Temporary tokens on API Setup expire.

### D. App secret and verify token (shared with Facebook)

| Name | How to get it |
| --- | --- |
| `META_APP_SECRET` | Developers app → **App settings** → **Basic** → **App secret** (Show) |
| `META_VERIFY_TOKEN` | **You invent this** — any long random string. You will type the **same** string in Meta’s webhook settings. |

### E. Webhook (so incoming WhatsApp reaches the CRM)

1. WhatsApp → **Configuration** → **Webhook**.  
2. Callback URL:

   `YOUR_CRM_URL/api/webhooks/whatsapp`

3. Verify token: the same `META_VERIFY_TOKEN`.  
4. Verify and save.  
5. Subscribe to **messages** (and any other message fields Meta lists for Cloud API).

### F. Message templates (quotes and follow-ups)

WhatsApp will not send marketing-style messages to customers until templates are **approved**.

1. In **Meta Business Suite** or WhatsApp Manager → **Message templates**.  
2. Create templates your developer will name in the server, by default:  
   - `quote_sent`  
   - `quote_followup`  
3. Language: English (UK) if that is what you send.  
4. Wait for **Approved**.  
5. Tell your developer the **exact template names** if they differ.

Until WhatsApp is connected, sending a quote on WhatsApp from the CRM will fail.

---

## 5. Facebook Page (Messenger + Lead Ads)

**What it does:** Facebook Page messages and Lead Ad form submissions can land in the CRM inbox.

**What you need:** a Facebook **Page** for the company, and usually the **same Meta app** as WhatsApp.

### A. Page ID

1. Open your Facebook Page.  
2. **About** / **Page transparency** / **Settings** — copy **Page ID**.  
   Or: Page **Settings** → **Page info** → Page ID.

That is `FB_PAGE_ID`.

### B. Page access token

1. In [https://developers.facebook.com](https://developers.facebook.com) open your app.  
2. Add products **Messenger** and (for forms) **Webhooks** / **Lead Ads** if not already added.  
3. Messenger → **Settings** → **Access Tokens** → generate a token for your Page.  
4. For a token that does not expire quickly, create a **System user** in Business settings, assign the Page, and generate a token with `pages_messaging`, `pages_manage_metadata`, and for Lead Ads `leads_retrieval` / `pages_manage_ads` as Meta currently requires.

That token is `FB_PAGE_ACCESS_TOKEN`.

`META_APP_SECRET` and `META_VERIFY_TOKEN` are the **same values** as WhatsApp (one app, two products).

### C. Facebook webhook

1. App → **Webhooks**.  
2. Callback URL:

   `YOUR_CRM_URL/api/webhooks/facebook`

3. Verify token: same `META_VERIFY_TOKEN`.  
4. Subscribe the **Page** to fields: **messages**, **messaging_postbacks**, and **leadgen**.

### D. App Review

Test users and Page admins can use this immediately. For the **public** (any customer messaging the Page or submitting a Lead Ad), Meta requires **App Review**. Your developer or an agency usually submits that. Until then, the CRM can stay in Simulated mode or only work for testers.

---

## 6. AI — scheduling assistant

**What it does:** Lets office type or speak a schedule instruction in **Schedule & AI**. Without a key, the CRM still proposes a schedule using its **built-in rules** (skills, drivers, holidays). A key gives fuller natural-language understanding.

Pick **one** provider (Claude **or** ChatGPT). You do not need both.

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

### C. Buy a UK number

1. Console → **Phone Numbers** → **Buy a number**.  
2. Country: **United Kingdom**.  
3. Tick **Voice** and **SMS** if you want both.  
4. Buy it. Copy the number in international form, for example `+441234567890`. That is `TWILIO_NUMBER`.

### D. Point the number at the CRM

Ask your developer to confirm these URLs, then:

1. Open the number → **Configure**.  
2. **A call comes in** (webhook / HTTP POST):

   `YOUR_CRM_URL/api/webhooks/twilio/voice`

3. **A message comes in**:

   `YOUR_CRM_URL/api/webhooks/twilio/sms`

4. Save.

Trial accounts can only call/SMS verified test numbers until you upgrade.

---

## After your developer has saved the keys

1. Restart / redeploy the CRM (they will do this).  
2. Open **Settings → Integrations**.  
3. Each card should move from **Simulated** toward **Live** or “keys present”.  
4. Click **Connect** only where the card has a Connect button:  
   - **Google Calendar:** each user, on **Profile**  
   - **QuickBooks:** owner, on **Settings → Integrations**  
5. Send a test quote email, a test calendar connect, and (if live) a WhatsApp template to a staff phone before using it with customers.

---

## Copy-and-send checklist

Send this list to your developer. Leave a line blank if you are not using that service yet.

```
CRM public URL (YOUR_CRM_URL):

Google Calendar
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=

Email / Mailgun
MAILGUN_API_KEY=
MAILGUN_DOMAIN=
MAILGUN_FROM=
MAILGUN_REGION=          (us or eu)
EMAIL_INBOUND_SECRET=

QuickBooks Online UK
QBO_CLIENT_ID=
QBO_CLIENT_SECRET=
QBO_REDIRECT_URI=
QBO_ENVIRONMENT=         (sandbox or production)

WhatsApp
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_TEMPLATE_QUOTE=
WHATSAPP_TEMPLATE_FOLLOWUP=

Meta (shared by WhatsApp + Facebook)
META_APP_SECRET=
META_VERIFY_TOKEN=

Facebook Page
FB_PAGE_ID=
FB_PAGE_ACCESS_TOKEN=

AI (pick one)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
AI_PROVIDER=             (auto, anthropic, or openai)

Twilio (optional)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_NUMBER=
```

Treat every value like a password. If a key is leaked, revoke it in that provider’s dashboard and create a new one.