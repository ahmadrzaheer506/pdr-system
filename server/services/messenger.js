// ============================================================
// Central message dispatch + inbound ingestion.
//  - sendToCustomer(): one entry point for every outbound
//    customer message (WhatsApp / email / FB), records it on
//    the customer's conversation thread with live/simulated flag.
//  - ingestInbound(): one entry point for every inbound enquiry
//    (webhooks + simulator) — dedupes against existing customers
//    (PRD §9.1), creates Lead + Message, STOPS pending follow-ups
//    the moment a customer replies (PRD §10.2).
// ============================================================
const { db, j } = require('../db');
const { logActivity } = require('./pipeline');
const whatsapp = require('../integrations/whatsapp');
const email = require('../integrations/email');
const meta = require('../integrations/meta');

/** Stop all pending follow-ups for a customer (they replied). */
function stopFollowupsFor(customerId, reason = 'customer replied') {
  const r = db
    .prepare("UPDATE followups SET status = 'stopped', stop_reason = ? WHERE customer_id = ? AND status = 'pending'")
    .run(reason, customerId);
  if (r.changes > 0) {
    logActivity(customerId, null, 'followups_stopped', `Automatic follow-ups stopped — ${reason}`);
  }
  return r.changes;
}

/**
 * Send an outbound message to a customer on a channel.
 * kind: 'text' | 'document'. Returns the created message row id + simulated flag.
 */
async function sendToCustomer(customerId, channel, body, { userId = null, docUrl = null, docName = null, template = null, templateParams = [], subject = null, attachments = [] } = {}) {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
  if (!customer) throw new Error('Customer not found');

  let result = { simulated: true };
  let meta_ = {};

  if (channel === 'whatsapp') {
    if (!customer.phone) throw new Error('Customer has no phone number on record');
    if (docUrl) {
      result = await whatsapp.sendDocument(customer.phone, docUrl, docName || 'document.pdf', body);
    } else if (template && !whatsapp.insideServiceWindow(customerId)) {
      result = await whatsapp.sendTemplate(customer.phone, template, templateParams, body);
      meta_.template = template;
    } else {
      result = await whatsapp.sendText(customer.phone, body);
    }
  } else if (channel === 'email') {
    if (!customer.email) throw new Error('Customer has no email address on record');
    result = await email.send(customer.email, subject || 'Message from Paul Douglas Roofing', body, attachments);
    meta_.subject = subject;
  } else if (channel === 'facebook') {
    const psid = JSON.parse(customer.notes || '{}').fb_psid || null; // fallback
    const metaRow = db
      .prepare("SELECT meta FROM messages WHERE customer_id = ? AND channel = 'facebook' AND direction = 'in' ORDER BY id DESC LIMIT 1")
      .get(customerId);
    const senderPsid = metaRow ? (JSON.parse(metaRow.meta || '{}').psid || psid) : psid;
    if (!senderPsid) throw new Error('No Facebook conversation reference for this customer yet');
    result = await meta.sendPageMessage(senderPsid, body);
    meta_.psid = senderPsid;
  } else if (channel === 'note' || channel === 'phone' || channel === 'sms') {
    result = { simulated: false }; // internal log entry
  } else {
    throw new Error(`Unknown channel: ${channel}`);
  }

  if (docUrl) meta_.document = docName;
  const status = channel === 'note' || channel === 'phone' ? 'logged' : result.simulated ? 'simulated' : 'sent';
  const r = db
    .prepare('INSERT INTO messages (customer_id, direction, channel, body, meta, status, user_id) VALUES (?,?,?,?,?,?,?)')
    .run(customerId, 'out', channel, body, j(meta_), status, userId);
  db.prepare("UPDATE customers SET updated_at = datetime('now') WHERE id = ?").run(customerId);
  return { messageId: r.lastInsertRowid, simulated: !!result.simulated, status };
}

/** Normalise phone for matching (strip spaces, +44 → 0). */
function normPhone(p) {
  if (!p) return null;
  let s = String(p).replace(/[^\d+]/g, '');
  if (s.startsWith('+44')) s = '0' + s.slice(3);
  if (s.startsWith('44') && s.length >= 11) s = '0' + s.slice(2);
  return s;
}

/** Dedup: find existing customer by phone or email (PRD §9.1 acceptance criteria). */
function matchCustomer({ phone, email: em }) {
  const np = normPhone(phone);
  if (np) {
    const rows = db.prepare("SELECT id, phone FROM customers WHERE phone IS NOT NULL AND phone != ''").all();
    for (const row of rows) if (normPhone(row.phone) === np) return row.id;
  }
  if (em) {
    const row = db.prepare('SELECT id FROM customers WHERE lower(email) = lower(?)').get(em.trim());
    if (row) return row.id;
  }
  return null;
}

/**
 * Ingest an inbound enquiry/message from any channel.
 * Creates/updates Customer, creates a Lead (if newish enquiry), records the
 * Message, stops follow-ups. Returns { customerId, leadId, messageId, matched }.
 */
function ingestInbound({ source, channel = null, name = null, phone = null, email: em = null, address = null, body = '', subject = null, meta: meta_ = {}, createLead = true }) {
  channel = channel || (source === 'facebook_lead' ? 'facebook' : source);
  let matched = true;
  let customerId = matchCustomer({ phone, email: em });

  if (!customerId) {
    matched = false;
    const r = db
      .prepare('INSERT INTO customers (name, phone, email, address, stage, source) VALUES (?,?,?,?,?,?)')
      .run(name || phone || em || 'Unknown enquirer', phone || null, em || null, address || null, 'ENQUIRY', source);
    customerId = r.lastInsertRowid;
    logActivity(customerId, null, 'customer_created', `New customer created from ${source} enquiry`);
  } else {
    // enrich blanks on the existing record
    const c = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
    if (!c.email && em) db.prepare('UPDATE customers SET email = ? WHERE id = ?').run(em, customerId);
    if (!c.phone && phone) db.prepare('UPDATE customers SET phone = ? WHERE id = ?').run(phone, customerId);
    if (!c.address && address) db.prepare('UPDATE customers SET address = ? WHERE id = ?').run(address, customerId);
  }

  let leadId = null;
  if (createLead) {
    // Only open a new Lead if there's no NEW lead already sitting for this customer
    const openLead = db
      .prepare("SELECT id FROM leads WHERE customer_id = ? AND status = 'NEW'")
      .get(customerId);
    if (!openLead) {
      const r = db
        .prepare('INSERT INTO leads (customer_id, source, subject, message, status, next_action, meta) VALUES (?,?,?,?,?,?,?)')
        .run(customerId, source, subject, (body || '').slice(0, 2000), 'NEW', 'Review & respond', j(meta_));
      leadId = r.lastInsertRowid;
    } else {
      leadId = openLead.id;
    }
  }

  let messageId = null;
  if (body) {
    const r = db
      .prepare('INSERT INTO messages (customer_id, direction, channel, body, meta, status) VALUES (?,?,?,?,?,?)')
      .run(customerId, 'in', channel, body, j(meta_), 'received');
    messageId = r.lastInsertRowid;
  }

  // Customer replied → stop automatic chasing (PRD §10.2 hard requirement)
  stopFollowupsFor(customerId);
  logActivity(customerId, null, 'inbound', `Inbound ${channel} ${subject ? `— ${subject}` : 'message'}`);
  db.prepare("UPDATE customers SET updated_at = datetime('now') WHERE id = ?").run(customerId);

  return { customerId, leadId, messageId, matched };
}

module.exports = { sendToCustomer, ingestInbound, stopFollowupsFor, matchCustomer, normPhone };
