const express = require('express');
const { Lead, Customer } = require('../models');
const { requireAuth, requireOffice, asyncHandler } = require('../auth');
const { ingestInbound } = require('../services/messenger');
const { logActivity } = require('../services/pipeline');
const { plain } = require('../db');
const contacts = require('../customerContacts');
const { findEnquiryOwner } = require('../customerDuplicates');
const { resolveCustomerType, typeFields } = require('../customerType');
const { buildLeadListWhere, inboxTabCounts } = require('../leadFilters');

const router = express.Router();
router.use(requireAuth, requireOffice);

/** Sources the inbox "Log enquiry" form can pick (requirement 3.3). */
const QUICK_ADD_SOURCES = Object.freeze(['manual', 'phone', 'email', 'sms', 'whatsapp', 'facebook', 'facebook_lead']);

function ingestChannel(source) {
  if (source === 'manual') return 'note';
  if (source === 'facebook_lead') return 'facebook';
  return source;
}

router.get('/', asyncHandler(async (req, res) => {
  const listed = buildLeadListWhere(req.query, Lead.sequelize);
  if (listed.error) return res.status(400).json({ error: listed.error });
  const counted = buildLeadListWhere(req.query, Lead.sequelize, { includeStatus: false });
  if (counted.error) return res.status(400).json({ error: counted.error });

  const rows = await Lead.findAll({
    where: listed.where,
    include: [{
      model: Customer,
      attributes: ['name', 'stage'],
      required: true,
      include: [...contacts.CONTACT_INCLUDE],
    }],
    order: [['created_at', 'DESC']],
    distinct: true,
    limit: 200,
  });
  const leads = rows.map((r) => {
    const o = plain(r);
    const customer = contacts.applyPrimaryContacts(o.Customer || {});
    o.customer_name = customer.name;
    o.phone = customer.phone;
    o.email = customer.email;
    o.stage = o.stage || customer.stage;
    o.address = customer.address;
    o.meta = o.meta || {};
    delete o.Customer;
    return o;
  });
  const countRows = await Lead.findAll({
    attributes: [
      'status',
      'stage',
      [Lead.sequelize.fn('COUNT', Lead.sequelize.col('id')), 'c'],
    ],
    where: counted.where,
    group: ['status', 'stage'],
    raw: true,
  });
  res.json({ leads, counts: inboxTabCounts(countRows) });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { source = 'manual', phone, email, address, message, subject } = req.body || {};
  if (!QUICK_ADD_SOURCES.includes(source)) return res.status(400).json({ error: 'Invalid source' });

  const rawCustomerId = req.body?.customer_id;
  const existingId = rawCustomerId == null || rawCustomerId === '' ? null : Number(rawCustomerId);
  if (existingId != null) {
    if (!Number.isInteger(existingId) || existingId <= 0) {
      return res.status(400).json({ error: 'Pick a customer' });
    }
    const customer = await contacts.loadCustomerWithContacts(existingId);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    const created = await contacts.createMissingContacts(existingId, customer, req.body || {});
    if (created.error) {
      const body = { error: created.error };
      if (created.customer_id != null) {
        body.customer_id = created.customer_id;
        body.name = created.name || null;
      }
      return res.status(created.status || 400).json(body);
    }
    const picked = await contacts.resolveCustomerContactSelection(
      existingId,
      { ...req.body, ...created.value },
      { fallbackPrimary: false },
    );
    if (picked.error) return res.status(400).json({ error: picked.error });
    const result = await ingestInbound({
      source,
      channel: ingestChannel(source),
      name: customer.name,
      phone: picked.phone?.value || null,
      email: picked.email?.value || null,
      address: picked.site?.address || null,
      body: message || '',
      subject: subject || null,
      ownerId: req.user.id,
      customerId: existingId,
      forceNewLead: true,
      meta: {
        site_id: picked.site_id,
        phone_id: picked.phone_id,
        email_id: picked.email_id,
      },
    });
    await logActivity(result.customerId, req.user.id, 'lead_logged', `Enquiry logged manually (${source})`);
    return res.json(result);
  }

  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const type = resolveCustomerType(req.body?.customer_type, 'domestic');
  if (type.error) return res.status(400).json({ error: type.error });
  const typed = typeFields(type.value, req.body || {});
  if (typed.error) return res.status(400).json({ error: typed.error });
  const clash = await findEnquiryOwner(phone, email);
  if (clash) {
    return res.status(clash.status).json({
      error: clash.error,
      customer_id: clash.customer_id,
      name: clash.name,
    });
  }
  const result = await ingestInbound({
    source,
    channel: ingestChannel(source),
    name, phone, email, address,
    phone_type: req.body?.phone_type,
    email_type: req.body?.email_type,
    postcode: req.body?.postcode,
    customer_type: typed.customer_type,
    company_name: typed.company_name,
    vat_number: typed.vat_number,
    body: message || '',
    subject: subject || null,
    ownerId: req.user.id,
    forceNewLead: true,
  });
  await logActivity(result.customerId, req.user.id, 'lead_logged', `Enquiry logged manually (${source})`);
  res.json(result);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const lead = await Lead.findByPk(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  const { status, next_action } = req.body || {};
  const patch = {};
  if (status) patch.status = status;
  if (next_action !== undefined) patch.next_action = next_action;
  if (Object.keys(patch).length) await lead.update(patch);
  res.json({ ok: true });
}));

module.exports = router;
