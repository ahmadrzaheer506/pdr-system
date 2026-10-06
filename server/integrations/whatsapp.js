// ============================================================
// WhatsApp Business Platform (Meta Cloud API) adapter.
// Live when WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID are set.
// Outbound send fails with a clear error until those keys are present.
// PRD §9.1 (inbound), §9.4 (quotes), §10.2 (follow-ups).
// ============================================================
const { Op } = require('sequelize');
const { logIntegrationEvent, Message } = require('../models');

const GRAPH = 'https://graph.facebook.com/v21.0';

function isConfigured() {
  return !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

const NOT_CONNECTED_ERROR = 'WhatsApp is not connected. Add WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID in .env, then restart the server.';
const LOCALHOST_PDF_WARNING = 'WhatsApp accepted the message but cannot download a PDF from localhost. The text was sent without the quote file. Set APP_URL to a public HTTPS address to attach PDFs.';
const MEDIA_FETCH_ERROR = 'WhatsApp could not download the quote PDF from APP_URL (free ngrok warning pages often block Meta). The quote text can still be sent without the file.';
const FATAL_GRAPH_CODES = new Set([190, 131026, 131030, 131047]);

/**
 * Meta fetches document links from its own servers. localhost / private IPs fail with 131053.
 */
function canMetaFetchMedia(url) {
  try {
    const parsed = new URL(String(url));
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local')) {
      return false;
    }
    if (/^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function requireLive() {
  if (!isConfigured()) throw new Error(NOT_CONNECTED_ERROR);
}

async function logEvent(direction, event, payload, status = 'ok') {
  await logIntegrationEvent('whatsapp', direction, event, payload, status);
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
  if (!res.ok) {
    const graphErr = data.error || data;
    const err = new Error(friendlyGraphError(res.status, graphErr));
    err.graphCode = graphErr && graphErr.code;
    throw err;
  }
  return data;
}

/**
 * Map Meta Graph errors to a message the office can act on.
 */
function friendlyGraphError(httpStatus, err) {
  const code = err && err.code;
  if (code === 131030) {
    return 'This WhatsApp test number can only message numbers you add in Meta. Open WhatsApp → API Setup → Recipient, add the customer mobile (with country code), then try again.';
  }
  if (code === 190) {
    return 'WhatsApp access token is invalid or expired. Copy the full token from Meta (use the copy button), put it in .env, and restart the server.';
  }
  if (code === 131053) {
    return MEDIA_FETCH_ERROR;
  }
  if (code === 131047) {
    return 'WhatsApp blocked this send because the customer has not messaged your business number in the last 24 hours. On that phone, open WhatsApp, send any message to the test number +1 555 640 3520, wait a moment, then send the quote again. To skip that step, approve a template in Meta (e.g. quote_sent) and set WHATSAPP_TEMPLATE_QUOTE to its exact name.';
  }
  if (code === 132001 || code === 132000) {
    return 'That WhatsApp template is not approved or the name does not match .env (WHATSAPP_TEMPLATE_QUOTE). Approve quote_sent in WhatsApp Manager, or use a template name this app already has.';
  }
  return `WhatsApp API ${httpStatus}: ${JSON.stringify(err)}`;
}

/**
 * Send a free-form text (valid inside the 24h customer-service window).
 * Returns { simulated, wa_id? }.
 */
async function sendText(toPhone, body) {
  const to = waNumber(toPhone);
  requireLive();
  try {
    const data = await graphPost({ messaging_product: 'whatsapp', to, type: 'text', text: { body } });
    await logEvent('out', 'text.sent', { to, id: data.messages?.[0]?.id });
    return { simulated: false, wa_id: data.messages?.[0]?.id };
  } catch (err) {
    await logEvent('out', 'text.error', { to, error: String(err.message) }, 'error');
    throw err;
  }
}

/** Send a document (e.g. quote PDF) by public URL. */
async function sendDocument(toPhone, docUrl, filename, caption = '') {
  const to = waNumber(toPhone);
  requireLive();
  try {
    const data = await graphPost({
      messaging_product: 'whatsapp',
      to,
      type: 'document',
      document: { link: docUrl, filename, caption },
    });
    await logEvent('out', 'document.sent', { to, id: data.messages?.[0]?.id });
    return { simulated: false, wa_id: data.messages?.[0]?.id };
  } catch (err) {
    await logEvent('out', 'document.error', { to, error: String(err.message) }, 'error');
    throw err;
  }
}

/**
 * Send a pre-approved template (required for business-initiated messages
 * outside the 24h window — Meta policy, see INTEGRATIONS.md §3).
 * params = array of strings substituted into {{1}}, {{2}}...
 */
function templateLanguages() {
  const preferred = String(process.env.WHATSAPP_TEMPLATE_LANG || '').trim();
  const langs = [];
  if (preferred) langs.push(preferred);
  for (const code of ['en_US', 'en_GB']) {
    if (!langs.includes(code)) langs.push(code);
  }
  return langs;
}

async function sendTemplate(toPhone, templateName, params = []) {
  const to = waNumber(toPhone);
  requireLive();
  const components = params.length
    ? [{ type: 'body', parameters: params.map((t) => ({ type: 'text', text: String(t) })) }]
    : [];
  let lastError = null;
  for (const lang of templateLanguages()) {
    try {
      const data = await graphPost({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: lang },
          components,
        },
      });
      await logEvent('out', 'template.sent', { to, templateName, lang, id: data.messages?.[0]?.id });
      return { simulated: false, wa_id: data.messages?.[0]?.id };
    } catch (err) {
      lastError = err;
      await logEvent('out', 'template.error', { to, templateName, lang, error: String(err.message) }, 'error');
      if (FATAL_GRAPH_CODES.has(err.graphCode)) break;
    }
  }
  throw lastError || new Error('WhatsApp template send failed');
}

function isFatalGraphError(err) {
  return FATAL_GRAPH_CODES.has(err && err.graphCode);
}

/**
 * True if the customer messaged us on WhatsApp within the last 24h —
 * inside Meta's customer-service window, so free-form text is allowed.
 */
async function insideServiceWindow(customerId) {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const row = await Message.findOne({
    where: {
      customer_id: customerId,
      channel: 'whatsapp',
      direction: 'in',
      created_at: { [Op.gt]: since },
    },
  });
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
      : 'Not connected — quote and message send will fail until keys are added in .env.',
  };
}

module.exports = {
  isConfigured,
  NOT_CONNECTED_ERROR,
  LOCALHOST_PDF_WARNING,
  MEDIA_FETCH_ERROR,
  canMetaFetchMedia,
  friendlyGraphError,
  isFatalGraphError,
  sendText,
  sendDocument,
  sendTemplate,
  insideServiceWindow,
  waNumber,
  status,
};
