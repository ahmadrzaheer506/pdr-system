// ============================================================
// WhatsApp Business Platform (Meta Cloud API) adapter.
// Live when WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID set;
// otherwise every send is recorded as 'simulated' so the whole
// workflow still functions for demo/testing.
// PRD §9.1 (inbound), §9.4 (quotes), §10.2 (follow-ups).
// ============================================================
const { db } = require('../db');

const GRAPH = 'https://graph.facebook.com/v21.0';

function isConfigured() {
  return !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

function logEvent(direction, event, payload, status = 'ok') {
  db.prepare('INSERT INTO integration_events (provider, direction, event, payload, status) VALUES (?,?,?,?,?)')
    .run('whatsapp', direction, event, JSON.stringify(payload).slice(0, 4000), status);
}

/** Normalise a UK phone number to wa format (447... no plus). Best effort. */
function waNumber(phone) {
  if (!phone) return null;
  let p = String(phone).replace(/[^\d+]/g, '');
  if (p.startsWith('+')) p = p.slice(1);
  if (p.startsWith('07')) p = '44' + p.slice(1);
  if (p.startsWith('0044')) p = p.slice(2);
  return p;
}

async function graphPost(body) {
  const res = await fetch(`${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`WhatsApp API ${res.status}: ${JSON.stringify(data.error || data)}`);
  return data;
}

/**
 * Send a free-form text (valid inside the 24h customer-service window).
 * Returns { simulated, wa_id? }.
 */
async function sendText(toPhone, body) {
  const to = waNumber(toPhone);
  if (!isConfigured()) {
    logEvent('out', 'text.simulated', { to, body }, 'simulated');
    return { simulated: true };
  }
  try {
    const data = await graphPost({ messaging_product: 'whatsapp', to, type: 'text', text: { body } });
    logEvent('out', 'text.sent', { to, id: data.messages?.[0]?.id });
    return { simulated: false, wa_id: data.messages?.[0]?.id };
  } catch (err) {
    logEvent('out', 'text.error', { to, error: String(err.message) }, 'error');
    throw err;
  }
}

/** Send a document (e.g. quote PDF) by public URL. */
async function sendDocument(toPhone, docUrl, filename, caption = '') {
  const to = waNumber(toPhone);
  if (!isConfigured()) {
    logEvent('out', 'document.simulated', { to, docUrl, filename }, 'simulated');
    return { simulated: true };
  }
  try {
    const data = await graphPost({
      messaging_product: 'whatsapp',
      to,
      type: 'document',
      document: { link: docUrl, filename, caption },
    });
    logEvent('out', 'document.sent', { to, id: data.messages?.[0]?.id });
    return { simulated: false, wa_id: data.messages?.[0]?.id };
  } catch (err) {
    logEvent('out', 'document.error', { to, error: String(err.message) }, 'error');
    throw err;
  }
}

/**
 * Send a pre-approved template (required for business-initiated messages
 * outside the 24h window — Meta policy, see INTEGRATIONS.md §3).
 * params = array of strings substituted into {{1}}, {{2}}...
 */
async function sendTemplate(toPhone, templateName, params = [], renderedFallbackText = '') {
  const to = waNumber(toPhone);
  if (!isConfigured()) {
    logEvent('out', 'template.simulated', { to, templateName, params }, 'simulated');
    return { simulated: true };
  }
  try {
    const data = await graphPost({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'en_GB' },
        components: params.length
          ? [{ type: 'body', parameters: params.map((t) => ({ type: 'text', text: String(t) })) }]
          : [],
      },
    });
    logEvent('out', 'template.sent', { to, templateName, id: data.messages?.[0]?.id });
    return { simulated: false, wa_id: data.messages?.[0]?.id };
  } catch (err) {
    logEvent('out', 'template.error', { to, templateName, error: String(err.message) }, 'error');
    // Fallback: try free-form text (works if inside 24h window)
    if (renderedFallbackText) return sendText(toPhone, renderedFallbackText);
    throw err;
  }
}

/**
 * True if the customer messaged us on WhatsApp within the last 24h —
 * inside Meta's customer-service window, so free-form text is allowed.
 */
function insideServiceWindow(customerId) {
  const row = db
    .prepare(
      `SELECT 1 FROM messages WHERE customer_id = ? AND channel = 'whatsapp' AND direction = 'in'
       AND datetime(created_at) > datetime('now', '-24 hours') LIMIT 1`
    )
    .get(customerId);
  return !!row;
}

function status() {
  return {
    id: 'whatsapp',
    name: 'WhatsApp Business (Meta Cloud API)',
    configured: isConfigured(),
    connected: isConfigured(),
    mode: isConfigured() ? 'live' : 'simulated',
    env_needed: ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_BUSINESS_ACCOUNT_ID', 'META_APP_SECRET', 'META_VERIFY_TOKEN'],
    webhook_url: `${process.env.APP_URL || 'http://localhost:4000'}/api/webhooks/whatsapp`,
    detail: isConfigured()
      ? 'Live — sending via Meta Cloud API'
      : 'Simulated — messages are recorded in the CRM but not delivered. Add keys in .env to go live.',
  };
}

module.exports = { isConfigured, sendText, sendDocument, sendTemplate, insideServiceWindow, waNumber, status };
