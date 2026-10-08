const express = require('express');
const { logIntegrationEvent } = require('../models');
const { ingestInbound } = require('../services/messenger');
const meta = require('../integrations/meta');

const router = express.Router();

const metaJson = express.json({
  verify: (req, res, buf) => { req.rawBody = buf; },
});

async function logEvent(provider, event, payload, status = 'ok') {
  await logIntegrationEvent(provider, 'in', event, payload, status);
}

function verifyHandshake(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === (process.env.META_VERIFY_TOKEN || 'pdr-verify-2026')) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
}

function requireMetaSignature(req, res, next) {
  if (!meta.verifySignature(req.rawBody || Buffer.alloc(0), req.get('x-hub-signature-256'))) {
    return res.sendStatus(403);
  }
  next();
}

/**
 * Lead Ad ingest fields. Graph field_data wins when present; otherwise the
 * webhook value is used so a leadgen POST still creates a customer + NEW lead
 * when the page token is not configured (requirement 3.2).
 * @param {object} value
 * @param {object|null} graphFields
 */
function leadAdIntake(value = {}, graphFields = null) {
  const fields = graphFields && typeof graphFields === 'object' ? graphFields : {};
  return {
    source: 'facebook_lead',
    channel: 'facebook',
    name: fields.full_name || fields.name || value.full_name || value.name || 'Facebook lead',
    phone: fields.phone_number || value.phone_number || null,
    email: fields.email || value.email || null,
    body: `Facebook Lead Ad submission (form ${value.form_id || fields.form_id || ''})`,
    meta: { ...value, ...fields },
  };
}

router.get('/whatsapp', verifyHandshake);
router.get('/facebook', verifyHandshake);

router.post('/whatsapp', metaJson, requireMetaSignature, async (req, res) => {
  try {
    const entry = req.body?.entry?.[0]?.changes?.[0]?.value;
    if (!entry?.messages) {
      if (entry?.statuses) await logEvent('whatsapp', 'status_update', entry.statuses[0]);
    } else {
      const msg = entry.messages[0];
      const contact = entry.contacts?.[0];
      const phone = msg.from;
      const name = contact?.profile?.name || phone;
      let body = '';
      if (msg.type === 'text') body = msg.text.body;
      else if (msg.type === 'button') body = msg.button.text;
      else if (msg.type === 'interactive') body = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '[interactive reply]';
      else body = `[${msg.type} message]`;

      await ingestInbound({ source: 'whatsapp', channel: 'whatsapp', name, phone: `+${phone}`, body });
      await logEvent('whatsapp', 'message.received', { phone, type: msg.type });
    }
  } catch (err) {
    await logEvent('whatsapp', 'webhook.error', { error: String(err.message) }, 'error');
  }
  res.sendStatus(200);
});

router.post('/facebook', metaJson, requireMetaSignature, async (req, res) => {
  try {
    for (const entry of req.body?.entry || []) {
      for (const messaging of entry.messaging || []) {
        if (messaging.message && !messaging.message.is_echo) {
          const psid = messaging.sender.id;
          const name = (await meta.fetchProfileName(psid)) || 'Facebook contact';
          await ingestInbound({ source: 'facebook', channel: 'facebook', name, body: messaging.message.text || '[attachment]', meta: { psid } });
          await logEvent('facebook', 'message.received', { psid });
        }
      }
      for (const change of entry.changes || []) {
        if (change.field === 'leadgen') {
          const value = change.value || {};
          const fields = value.leadgen_id ? await meta.fetchLeadgen(value.leadgen_id) : null;
          await ingestInbound(leadAdIntake(value, fields));
          await logEvent('facebook', 'leadgen.received', { leadgenId: value.leadgen_id || null });
        }
      }
    }
  } catch (err) {
    await logEvent('facebook', 'webhook.error', { error: String(err.message) }, 'error');
  }
  res.sendStatus(200);
});

router.post('/email', express.urlencoded({ extended: true, limit: '10mb' }), express.json({ limit: '10mb' }), async (req, res) => {
  if (req.query.secret !== (process.env.EMAIL_INBOUND_SECRET || 'change-me')) return res.sendStatus(403);
  try {
    const b = req.body || {};
    const from = b.from || b.sender || b.From || '';
    const emailMatch = from.match(/<([^>]+)>/);
    const emailAddr = emailMatch ? emailMatch[1] : from.split(' ')[0];
    const name = from.replace(/<[^>]+>/, '').trim() || emailAddr;
    const subject = b.subject || b.Subject || '(no subject)';
    const text = b['stripped-text'] || b.text || b['body-plain'] || b.TextBody || '';
    await ingestInbound({ source: 'email', channel: 'email', name, email: emailAddr, subject, body: text });
    await logEvent('email', 'message.received', { from: emailAddr, subject });
  } catch (err) {
    await logEvent('email', 'webhook.error', { error: String(err.message) }, 'error');
  }
  res.sendStatus(200);
});

router.post('/twilio/sms', express.urlencoded({ extended: false }), async (req, res) => {
  res.set('Content-Type', 'text/xml').send('<Response></Response>');
  try {
    const { From, Body } = req.body || {};
    await ingestInbound({ source: 'sms', channel: 'sms', name: From, phone: From, body: Body || '' });
    await logEvent('telephony', 'sms.received', { from: From });
  } catch (err) {
    await logEvent('telephony', 'webhook.error', { error: String(err.message) }, 'error');
  }
});

router.post('/twilio/voice', express.urlencoded({ extended: false }), async (req, res) => {
  res.set('Content-Type', 'text/xml').send(
    '<Response><Say voice="woman">Thanks for calling Paul Douglas Roofing. Please leave a message after the tone and we will call you back.</Say><Record maxLength="120" /></Response>'
  );
  try {
    const { From } = req.body || {};
    await ingestInbound({ source: 'phone', channel: 'phone', name: From, phone: From, body: 'Missed/inbound call — voicemail recording pending' });
    await logEvent('telephony', 'call.received', { from: From });
  } catch (err) {
    await logEvent('telephony', 'webhook.error', { error: String(err.message) }, 'error');
  }
});

module.exports = Object.assign(router, { leadAdIntake });
