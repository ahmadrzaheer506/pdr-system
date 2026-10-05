/**
 * Block create/add of a phone or email that already belongs to a customer
 * (requirement 2.5). Webhook ingest still attaches via matchCustomer (3.4);
 * office Log enquiry uses findEnquiryOwner and returns 409 instead.
 */
const { Op } = require('sequelize');
const { Customer, CustomerPhone, CustomerEmail } = require('./models');
const { normalisePhone } = require('./phone');

function conflict(kind, customerId, name) {
  const label = kind === 'phone' ? 'phone number' : 'email address';
  return {
    error: `This ${label} is already on ${name || 'another customer'}. Open that customer instead.`,
    status: 409,
    customer_id: customerId,
    name: name || null,
  };
}

/**
 * @param {string} normalised
 * @param {{ exceptPhoneId?: number }} [opts]
 */
async function findPhoneOwner(normalised, opts = {}) {
  if (!normalised) return null;
  const where = { normalised };
  if (opts.exceptPhoneId) where.id = { [Op.ne]: opts.exceptPhoneId };
  const row = await CustomerPhone.findOne({
    where,
    include: [{ model: Customer, attributes: ['id', 'name'] }],
  });
  if (!row) return null;
  return conflict('phone', row.customer_id, row.Customer?.name);
}

/**
 * @param {string} value
 * @param {{ exceptEmailId?: number }} [opts]
 */
async function findEmailOwner(value, opts = {}) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  const where = { value: { [Op.iLike]: trimmed } };
  if (opts.exceptEmailId) where.id = { [Op.ne]: opts.exceptEmailId };
  const row = await CustomerEmail.findOne({
    where,
    include: [{ model: Customer, attributes: ['id', 'name'] }],
  });
  if (!row) return null;
  return conflict('email', row.customer_id, row.Customer?.name);
}

/**
 * Reject a create payload whose phones/emails collide with each other or with
 * an existing customer.
 *
 * @param {{ phones?: object[], emails?: object[] }} lists
 */
async function findContactConflicts(lists = {}) {
  const phones = lists.phones || [];
  const emails = lists.emails || [];
  const seenPhones = new Set();
  for (const phone of phones) {
    const normalised = phone.normalised || normalisePhone(phone.value);
    if (!normalised) continue;
    if (seenPhones.has(normalised)) {
      return { error: 'This phone number is listed twice', status: 400 };
    }
    seenPhones.add(normalised);
    const hit = await findPhoneOwner(normalised);
    if (hit) return hit;
  }
  const seenEmails = new Set();
  for (const email of emails) {
    const key = String(email.value || '').trim().toLowerCase();
    if (!key) continue;
    if (seenEmails.has(key)) {
      return { error: 'This email address is listed twice', status: 400 };
    }
    seenEmails.add(key);
    const hit = await findEmailOwner(email.value);
    if (hit) return hit;
  }
  return null;
}

/**
 * Phone first, then email — same keys as ingest matchCustomer (requirement 3.4).
 * Used by POST /api/leads so office sees a 409 notice instead of a second customer.
 * @param {unknown} phone
 * @param {unknown} email
 */
async function findEnquiryOwner(phone, email) {
  const np = normalisePhone(phone);
  if (np) {
    const hit = await findPhoneOwner(np);
    if (hit) return hit;
  }
  return findEmailOwner(email);
}

module.exports = {
  conflict,
  findPhoneOwner,
  findEmailOwner,
  findContactConflicts,
  findEnquiryOwner,
};
