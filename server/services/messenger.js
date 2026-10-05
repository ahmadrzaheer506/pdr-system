// ============================================================
// Central message dispatch + inbound ingestion.
// ============================================================
const { Op } = require('sequelize');
const { Customer, Lead, Message, CustomerPhone, CustomerEmail } = require('../models');
const { logActivity } = require('./pipeline');
const whatsapp = require('../integrations/whatsapp');
const email = require('../integrations/email');
const meta = require('../integrations/meta');
const contacts = require('../customerContacts');
const { normalisePhone } = require('../phone');

/**
 * Stop remaining follow-ups for quotes already sent when this inbound arrived.
 * Other quotes (sent later) keep their sequences (requirement 12.1).
 */
async function stopFollowupsFor(customerId, reason = 'customer replied') {
  const { stopFollowupsAfterInbound } = require('./followups');
  return stopFollowupsAfterInbound(customerId, new Date(), reason);
}

/**
 * Send an outbound message to a customer on a channel.
 * kind: 'text' | 'document'. Returns the created message row id + simulated flag.
 */
async function sendToCustomer(customerId, channel, body, { userId = null, docUrl = null, docName = null, template = null, templateParams = [], subject = null, attachments = [], phone: phoneOverride = null, email: emailOverride = null } = {}) {
  const customer = await contacts.loadCustomerWithContacts(customerId);
  if (!customer) throw new Error('Customer not found');
  const destPhone = phoneOverride || customer.phone;
  const destEmail = emailOverride || customer.email;

  let result = { simulated: true };
  let meta_ = {};

  if (channel === 'whatsapp') {
    if (!destPhone) throw new Error('Customer has no phone number on record');
    if (docUrl) {
      result = await whatsapp.sendDocument(destPhone, docUrl, docName || 'document.pdf', body);
    } else if (template && !(await whatsapp.insideServiceWindow(customerId))) {
      result = await whatsapp.sendTemplate(destPhone, template, templateParams, body);
      meta_.template = template;
    } else {
      result = await whatsapp.sendText(destPhone, body);
    }
  } else if (channel === 'email') {
    if (!destEmail) throw new Error('Customer has no email address on record');
    result = await email.send(destEmail, subject || 'Message from Paul Douglas Roofing', body, attachments);
    meta_.subject = subject;
  } else if (channel === 'facebook') {
    const psid = (() => { try { return JSON.parse(customer.notes || '{}').fb_psid || null; } catch { return null; } })();
    const lastFb = await Message.findOne({
      where: { customer_id: customerId, channel: 'facebook', direction: 'in' },
      order: [['id', 'DESC']],
    });
    const lastMeta = lastFb ? (lastFb.meta || {}) : {};
    const senderPsid = lastMeta.psid || psid;
    if (!senderPsid) throw new Error('No Facebook conversation reference for this customer yet');
    result = await meta.sendPageMessage(senderPsid, body);
    meta_.psid = senderPsid;
  } else if (channel === 'note' || channel === 'phone' || channel === 'sms') {
    result = { simulated: false };
  } else {
    throw new Error(`Unknown channel: ${channel}`);
  }

  if (docUrl) meta_.document = docName;
  const status = channel === 'note' || channel === 'phone' ? 'logged' : result.simulated ? 'simulated' : 'sent';
  const created = await Message.create({
    customer_id: customerId,
    direction: 'out',
    channel,
    body,
    meta: meta_,
    status,
    user_id: userId,
  });
  await Customer.update({ updated_at: new Date() }, { where: { id: customerId } });
  return { messageId: created.id, simulated: !!result.simulated, status };
}

/** Digits-only UK form — alias of phone.normalisePhone (requirement 2.5). */
const normPhone = normalisePhone;

/** Dedup: existing customer by normalised phone, then email (requirement 3.4). */
async function matchCustomer({ phone, email: em }) {
  const np = normalisePhone(phone);
  if (np) {
    const row = await CustomerPhone.findOne({
      attributes: ['customer_id'],
      where: { normalised: np },
    });
    if (row) return row.customer_id;
  }
  if (em) {
    const row = await CustomerEmail.findOne({
      attributes: ['customer_id'],
      where: { value: { [Op.iLike]: em.trim() } },
    });
    if (row) return row.customer_id;
  }
  return null;
}

/**
 * Ingest an inbound enquiry/message from any channel.
 * Webhooks attach to a matched customer; office Log enquiry 409s first (3.4).
 * Creates/updates Customer, creates a Lead (if newish enquiry), records the
 * Message, stops follow-ups. Returns { customerId, leadId, messageId, matched }.
 * `ownerId` is applied only when a new customer is created (office Log enquiry).
 * `customerId` attaches the enquiry to an existing customer without creating or merging contacts.
 * `forceNewLead` always opens a new inbox row (office Log enquiry). Webhooks omit it
 * so further messages on an open NEW enquiry stay on the same lead.
 */
async function ingestInbound({ source, channel = null, name = null, phone = null, email: em = null, address = null, body = '', subject = null, meta: meta_ = {}, createLead = true, forceNewLead = false, ownerId = null, customerId: knownId = null, phone_type = null, email_type = null, postcode = null, customer_type = null, company_name = null, vat_number = null }) {
  channel = channel || (source === 'facebook_lead' ? 'facebook' : source);
  let matched = true;
  let customerId = knownId == null || knownId === '' ? null : Number(knownId);

  if (customerId) {
    if (!Number.isInteger(customerId) || customerId <= 0) throw new Error('Customer not found');
    const existingRow = await Customer.findByPk(customerId, { attributes: ['id'] });
    if (!existingRow) throw new Error('Customer not found');
  } else {
    customerId = await matchCustomer({ phone, email: em });
    if (!customerId) {
      matched = false;
      const created = await Customer.create({
        name: name || phone || em || 'Unknown enquirer',
        stage: 'ENQUIRY',
        source,
        owner_id: ownerId || null,
        customer_type: customer_type || 'domestic',
        company_name: company_name || null,
        vat_number: vat_number || null,
      });
      customerId = created.id;
      const lists = contacts.parseContactInput({ phone, email: em, address, phone_type, email_type, postcode });
      if (!lists.error) await contacts.saveContactLists(customerId, lists);
      await logActivity(customerId, null, 'customer_created', `New customer created from ${source} enquiry`);
    } else {
      const existing = await contacts.listContacts(customerId);
      if (phone && !existing.phones.length) {
        await contacts.addPhone(customerId, { value: phone, type: 'mobile', is_primary: true }, { skipDuplicateCheck: true });
      }
      if (em && !existing.emails.length) {
        await contacts.addEmail(customerId, { value: em, type: 'personal', is_primary: true }, { skipDuplicateCheck: true });
      }
      if (address && !existing.sites.length) {
        await contacts.addSite(customerId, { address, is_primary: true });
      }
    }
  }

  let leadId = null;
  let createdNewLead = false;
  if (createLead) {
    const openLead = forceNewLead
      ? null
      : await Lead.findOne({ where: { customer_id: customerId, status: 'NEW' } });
    if (!openLead) {
      const created = await Lead.create({
        customer_id: customerId,
        source,
        subject,
        message: (body || '').slice(0, 2000),
        status: 'NEW',
        next_action: 'Review & respond',
        meta: meta_,
        stage: 'ENQUIRY',
      });
      leadId = created.id;
      createdNewLead = true;
    } else {
      leadId = openLead.id;
    }
  }

  let messageId = null;
  if (body) {
    const created = await Message.create({
      customer_id: customerId,
      direction: 'in',
      channel,
      body,
      meta: meta_,
      status: 'received',
    });
    messageId = created.id;
  }

  await stopFollowupsFor(customerId);
  await logActivity(customerId, null, 'inbound', `Inbound ${channel} ${subject ? `— ${subject}` : 'message'}`);
  if (createdNewLead) {
    const { safeNotify, notifyOffice } = require('../notifications');
    const who = name || phone || em || 'Unknown enquirer';
    const snippet = (body || subject || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    await safeNotify(() => notifyOffice({
      kind: 'new_enquiry',
      message: snippet ? `${who} (${source}): ${snippet}` : `${who} — new ${source} enquiry`,
      entity_type: 'lead',
      entity_id: leadId,
    }, { excludeId: ownerId || undefined }));
  }
  await Customer.update({ updated_at: new Date() }, { where: { id: customerId } });

  return { customerId, leadId, messageId, matched };
}

module.exports = { sendToCustomer, ingestInbound, stopFollowupsFor, matchCustomer, normPhone };
