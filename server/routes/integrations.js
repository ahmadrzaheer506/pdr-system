// OAuth connect/callback flows for Google Calendar & QuickBooks (PRD §14),
// plus the demo simulator so the full workflow can be shown with zero API keys.
const express = require('express');
const { requireAuth, requireOffice, requireAdmin } = require('../auth');
const gcal = require('../integrations/gcal');
const quickbooks = require('../integrations/quickbooks');
const { ingestInbound } = require('../services/messenger');

const router = express.Router();

router.get('/google/connect', requireAuth, requireAdmin, (req, res) => {
  if (!gcal.isConfigured()) return res.status(400).json({ error: 'GOOGLE_CLIENT_ID/SECRET not set in .env yet' });
  res.json({ url: gcal.authUrl('pdr') });
});
router.get('/google/callback', async (req, res) => {
  try {
    await gcal.exchangeCode(req.query.code);
    res.send('<html><body style="font-family:sans-serif;padding:40px"><h2>Google Calendar connected ✅</h2><p>You can close this tab and return to the app.</p></body></html>');
  } catch (err) {
    res.status(400).send(`<html><body style="font-family:sans-serif;padding:40px"><h2>Connection failed</h2><p>${err.message}</p></body></html>`);
  }
});

router.get('/quickbooks/connect', requireAuth, requireAdmin, (req, res) => {
  if (!quickbooks.isConfigured()) return res.status(400).json({ error: 'QBO_CLIENT_ID/SECRET not set in .env yet' });
  res.json({ url: quickbooks.authUrl('pdr') });
});
router.get('/quickbooks/callback', async (req, res) => {
  try {
    await quickbooks.exchangeCode(req.query.code, req.query.realmId);
    res.send('<html><body style="font-family:sans-serif;padding:40px"><h2>QuickBooks connected ✅</h2><p>You can close this tab and return to the app.</p></body></html>');
  } catch (err) {
    res.status(400).send(`<html><body style="font-family:sans-serif;padding:40px"><h2>Connection failed</h2><p>${err.message}</p></body></html>`);
  }
});

// ---------------- Demo simulator (PRD ask: show the workflow before keys arrive) ----------------
const SIM_NAMES = ['Dave Whitfield', 'Sandra Cole', 'Marcus Reid', 'Priya Nair', 'Tom Ellery', 'Grace Bowman'];
const SIM_JOBS = ['leaking flat roof', 'full re-roof quote', 'guttering repair', 'chimney flashing', 'storm damage survey', 'roof moss removal'];
router.post('/simulate/enquiry', requireAuth, requireOffice, (req, res) => {
  const { source = 'whatsapp' } = req.body || {};
  const name = SIM_NAMES[Math.floor(Math.random() * SIM_NAMES.length)];
  const jobDesc = SIM_JOBS[Math.floor(Math.random() * SIM_JOBS.length)];
  const phone = `+447${Math.floor(100000000 + Math.random() * 899999999)}`;
  const bodies = {
    whatsapp: `Hi, could someone come and look at a ${jobDesc}? Address is a house in the local area, whenever's convenient.`,
    facebook: `Hi! Saw your page — need a quote for ${jobDesc}. Can you help?`,
    email: `Hello, I'm enquiring about a ${jobDesc}. Please could you get back to me with availability. Thanks.`,
    phone: `Missed call — voicemail: "Hi, calling about a ${jobDesc}, please call back."`,
  };
  const result = ingestInbound({
    source,
    channel: source,
    name,
    phone: source !== 'email' ? phone : null,
    email: source === 'email' ? `${name.split(' ')[0].toLowerCase()}@example.co.uk` : null,
    body: bodies[source] || bodies.whatsapp,
    subject: source === 'email' ? `Enquiry — ${jobDesc}` : null,
  });
  res.json({ ok: true, ...result, simulated_source: source, name });
});

module.exports = router;
