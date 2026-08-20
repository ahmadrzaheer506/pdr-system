// ============================================================
// Inbound webhooks — WhatsApp, Facebook/Meta, email, Twilio.
// No auth (external callers) — Meta endpoints verify signature;
// email/Twilio use a shared-secret query param.
// PRD §9.1, §10.1.
// ============================================================
const express = require('express');
const { db, j } = require('../db');
const { ingestInbound } = require('../services/messenger');
const meta = require('../integrations/meta');
const whatsapp = require('../integrations/whatsapp');

const router = express.Router();

function logEvent(provider, event, payload, status = 'ok') {
  db.prepare('INSERT INTO integration_events (provider, direction, event, payload, status) VALUES (?,?,?,?,?)')
    .run(provider, 'in', event, JSON.stringify(payload).slice(0, 4000), status);
}

// ---------- Meta webhook verification (shared GET handshake for WhatsApp + Facebook) ----------
function verifyHandshake(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === (process.env.META_VERIFY_TOKEN || 'pdr-verify-2026')) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
}

router.get('/whatsapp', verifyHandshake);
router.get('/facebook', verifyHandshake);

// ---------- WhatsApp inbound messages ----------
router.post('/whatsapp', express.json(), async (req, res) => {
  res.sendStatus(200); // ack immediately per Meta's requirement
  try {
    const entry = req.body?.entry?.[0]?.changes?.[0]?.value;
    if (!entry?.messages) {
      if (entry?.statuses) logEvent('whatsapp', 'status_update', entry.statuses[0]);
      return;
    }
    const msg = entry.messages[0];
    const contact = entry.contacts?.[0];
    const phone = msg.from;
    const name = contact?.profile?.name || phone;
    let body = '';
    if (msg.type === 'text') body = msg.text.body;
    else if (msg.type === 'button') body = msg.button.text;
    else if (msg.type === 'interactive') body = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '[interactive reply]';
    else body = `[${msg.type} message]`;

    ingestInbound({ source: 'whatsapp', channel: 'whatsapp', name, phone: `+${phone}`, body });
    logEvent('whatsapp', 'message.received', { phone, type: msg.type });
  } catch (err) {
    logEvent('whatsapp', 'webhook.error', { error: String(err.message) }, 'error');
  }
});

// ---------- Facebook Page messages + Lead Ads ----------
router.post('/facebook', express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }), async (req, res) => {
  res.sendStatus(200);
  try {
    for (const entry of req.body?.entry || []) {
      for (const messaging of entry.messaging || []) {
        if (messaging.message && !messaging.message.is_echo) {
          const psid = messaging.sender.id;
          const name = (await meta.fetchProfileName(psid)) || 'Facebook contact';
          ingestInbound({ source: 'facebook', channel: 'facebook', name, body: messaging.message.text || '[attachment]', meta: { psid } });
          logEvent('facebook', 'message.received', { psid });
        }
      }
      for (const change of entry.changes || []) {
        if (change.field === 'leadgen') {
          const leadgenId = change.value.leadgen_id;
          const fields = await meta.fetchLeadgen(leadgenId);
          if (fields) {
            ingestInbound({
              source: 'facebook_lead', channel: 'facebook',
              name: fields.full_name || fields.name || 'Facebook lead',
              phone: fields.phone_number || null,
              email: fields.email || null,
              body: `Facebook Lead Ad submission (form ${change.value.form_id || ''})`,
              meta: fields,
            });
          }
          logEvent('facebook', 'leadgen.received', { leadgenId });
        }
      }
    }
  } catch (err) {
    logEvent('facebook', 'webhook.error', { error: String(err.message) }, 'error');
  }
});

// ---------- Inbound email (SendGrid Inbound Parse / Mailgun Routes style) ----------
router.post('/email', express.urlencoded({ extended: true, limit: '10mb' }), express.json({ limit: '10mb' }), (req, res) => {
  if (req.query.secret !== (process.env.EMAIL_INBOUND_SECRET || 'change-me')) return res.sendStatus(403);
  res.sendStatus(200);
  try {
    const b = req.body || {};
    const from = b.from || b.sender || b.From || '';
    const emailMatch = from.match(/<([^>]+)>/);
    const emailAddr = emailMatch ? emailMatch[1] : from.split(' ')[0];
    const name = from.replace(/<[^>]+>/, '').trim() || emailAddr;
    const subject = b.subject || b.Subject || '(no subject)';
    const text = b.text || b['body-plain'] || b.TextBody || '';
    ingestInbound({ source: 'email', channel: 'email', name, email: emailAddr, subject, body: text });
    logEvent('email', 'message.received', { from: emailAddr, subject });
  } catch (err) {
    logEvent('email', 'webhook.error', { error: String(err.message) }, 'error');
  }
});

// ---------- Twilio voice/SMS (optional telephony) ----------
router.post('/twilio/sms', express.urlencoded({ extended: false }), (req, res) => {
  res.set('Content-Type', 'text/xml').send('<Response></Response>');
  try {
    const { From, Body } = req.body || {};
    ingestInbound({ source: 'sms', channel: 'sms', name: From, phone: From, body: Body || '' });
    logEvent('telephony', 'sms.received', { from: From });
  } catch (err) {
    logEvent('telephony', 'webhook.error', { error: String(err.message) }, 'error');
  }
});

router.post('/twilio/voice', express.urlencoded({ extended: false }), (req, res) => {
  res.set('Content-Type', 'text/xml').send(
    '<Response><Say voice="woman">Thanks for calling Paul Douglas Roofing. Please leave a message after the tone and we will call you back.</Say><Record maxLength="120" /></Response>'
  );
  try {
    const { From } = req.body || {};
    ingestInbound({ source: 'phone', channel: 'phone', name: From, phone: From, body: 'Missed/inbound call — voicemail recording pending' });
    logEvent('telephony', 'call.received', { from: From });
  } catch (err) {
    logEvent('telephony', 'webhook.error', { error: String(err.message) }, 'error');
  }
});

module.exports = router;
