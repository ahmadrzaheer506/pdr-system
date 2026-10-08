const express = require('express');
const { requireAuth, requireOffice, requireAdmin, asyncHandler } = require('../auth');
const gcal = require('../integrations/gcal');
const calendarSync = require('../calendarSync');
const quickbooks = require('../integrations/quickbooks');
const { ingestInbound } = require('../services/messenger');
const { spaOrigin } = require('../passwordReset');

const router = express.Router();

/**
 * Self-contained result page for OAuth redirect callbacks (Google, QuickBooks).
 * No build step runs here, so styling is inlined — kept in sync with the
 * app's look (Inter font, brand red, rounded cards) by hand.
 */
function renderOauthResultPage({ ok, heading, body, settingsPath = '/settings' }) {
  const settingsUrl = `${spaOrigin()}${settingsPath}`;
  const accent = ok ? '#059669' : '#dc1114';
  const accentSoft = ok ? '#ecfdf5' : '#fef2f2';
  const accentRing = ok ? '#a7f3d0' : '#fecaca';
  const icon = ok
    ? '<path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'
    : '<path d="M12 9v4m0 4h.01M10.29 3.86l-8.18 14.18A1.5 1.5 0 0 0 3.34 20.5h17.32a1.5 1.5 0 0 0 1.23-2.46L13.71 3.86a1.5 1.5 0 0 0-2.42 0Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${heading} — Paul Douglas Roofing</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: radial-gradient(circle at 50% -10%, #fef2f2 0%, #f8fafc 45%, #f1f5f9 100%);
    color: #0f172a;
  }
  .card {
    width: 100%;
    max-width: 420px;
    background: #ffffff;
    border-radius: 20px;
    padding: 36px 32px 32px;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 20px 48px -16px rgba(15, 23, 42, 0.18);
    border: 1px solid rgba(15, 23, 42, 0.06);
    text-align: center;
  }
  .icon {
    width: 56px;
    height: 56px;
    margin: 0 auto 20px;
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: ${accentSoft};
    color: ${accent};
    box-shadow: 0 0 0 6px ${accentRing}55;
  }
  h1 {
    margin: 0 0 8px;
    font-size: 19px;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: #0f172a;
  }
  p {
    margin: 0;
    font-size: 14px;
    line-height: 1.55;
    color: #64748b;
  }
  .brand {
    margin-top: 28px;
    padding-top: 18px;
    border-top: 1px solid #f1f5f9;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #cbd5e1;
  }
  .brand strong { color: #94a3b8; }
  .cta {
    appearance: none;
    display: inline-block;
    border: none;
    margin-top: 22px;
    padding: 10px 18px;
    border-radius: 10px;
    background: #0f172a;
    color: #fff;
    font: inherit;
    font-weight: 600;
    font-size: 13px;
    text-decoration: none;
    cursor: pointer;
    transition: background-color 0.15s ease;
  }
  .cta:hover { background: #1e293b; }
</style>
</head>
<body>
  <div class="card">
    <div class="icon">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none">${icon}</svg>
    </div>
    <h1>${heading}</h1>
    <p>${body}</p>
    <a class="cta" href="${settingsUrl}">Go to Settings</a>
    <div class="brand">Paul Douglas Roofing <strong>&middot; Business OS</strong></div>
  </div>
</body>
</html>`;
}

router.get('/google/status', requireAuth, asyncHandler(async (req, res) => {
  res.json(await gcal.status(req.user.id));
}));
router.get('/google/connect', requireAuth, (req, res) => {
  if (!gcal.isConfigured()) return res.status(400).json({ error: 'GOOGLE_CLIENT_ID/SECRET not set in .env yet' });
  res.json({ url: gcal.authUrl(gcal.signOauthState(req.user.id)) });
});
router.post('/google/disconnect', requireAuth, asyncHandler(async (req, res) => {
  const ok = await gcal.disconnect(req.user.id);
  res.json({ ok, connected: false });
}));
router.get('/google/callback', async (req, res) => {
  try {
    const userId = gcal.parseOauthState(req.query.state);
    await gcal.exchangeCode(req.query.code, userId);
    try {
      await calendarSync.backfillUser(userId);
    } catch { /* connect still succeeded */ }
    res.send(renderOauthResultPage({
      ok: true,
      heading: 'Google Calendar connected',
      body: 'Your site visits, jobs, holidays and tasks are now synced to Google Calendar. Head back to Settings to see the connection.',
    }));
  } catch (err) {
    res.status(400).send(renderOauthResultPage({
      ok: false,
      heading: 'Connection failed',
      body: err.message || 'Something went wrong connecting Google Calendar. Please try again from Settings.',
    }));
  }
});

router.get('/quickbooks/connect', requireAuth, requireAdmin, (req, res) => {
  if (!quickbooks.isConfigured()) return res.status(400).json({ error: 'QBO_CLIENT_ID/SECRET not set in .env yet' });
  res.json({ url: quickbooks.authUrl(quickbooks.signOauthState(req.user.id)) });
});
router.post('/quickbooks/disconnect', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const ok = await quickbooks.disconnect();
  res.json({ ok, connected: false });
}));
router.get('/quickbooks/callback', async (req, res) => {
  try {
    const userId = quickbooks.parseOauthState(req.query.state);
    await quickbooks.exchangeCode(req.query.code, req.query.realmId, userId);
    res.send(renderOauthResultPage({
      ok: true,
      heading: 'QuickBooks connected',
      body: 'Invoices you send from the CRM will now be created in QuickBooks, and payments will sync both ways. You can close this tab and return to Settings.',
    }));
  } catch (err) {
    res.status(400).send(renderOauthResultPage({
      ok: false,
      heading: 'Connection failed',
      body: err.message || 'Something went wrong connecting QuickBooks. Please try again from Settings.',
    }));
  }
});

const SIM_NAMES = ['Dave Whitfield', 'Sandra Cole', 'Marcus Reid', 'Priya Nair', 'Tom Ellery', 'Grace Bowman'];
const SIM_JOBS = ['leaking flat roof', 'full re-roof quote', 'guttering repair', 'chimney flashing', 'storm damage survey', 'roof moss removal'];
router.post('/simulate/enquiry', requireAuth, requireOffice, asyncHandler(async (req, res) => {
  const { source = 'whatsapp' } = req.body || {};
  const name = SIM_NAMES[Math.floor(Math.random() * SIM_NAMES.length)];
  const jobDesc = SIM_JOBS[Math.floor(Math.random() * SIM_JOBS.length)];
  const phone = `+447${Math.floor(100000000 + Math.random() * 899999999)}`;
  const bodies = {
    whatsapp: `Hi, could someone come and look at a ${jobDesc}? Address is a house in the local area, whenever's convenient.`,
    facebook: `Hi! Saw your page — need a quote for ${jobDesc}. Can you help?`,
    facebook_lead: `Lead form submitted — interested in a ${jobDesc}. Please call back.`,
    email: `Hello, I'm enquiring about a ${jobDesc}. Please could you get back to me with availability. Thanks.`,
    phone: `Missed call — voicemail: "Hi, calling about a ${jobDesc}, please call back."`,
  };
  const simEmail = `${name.split(' ')[0].toLowerCase()}@example.co.uk`;
  const result = await ingestInbound({
    source,
    channel: source === 'facebook_lead' ? 'facebook' : source,
    name,
    phone: source === 'email' ? null : phone,
    email: source === 'email' || source === 'facebook_lead' ? simEmail : null,
    body: bodies[source] || bodies.whatsapp,
    subject: source === 'email' || source === 'facebook_lead' ? `Enquiry — ${jobDesc}` : null,
  });
  res.json({ ok: true, ...result, simulated_source: source, name });
}));

module.exports = router;
