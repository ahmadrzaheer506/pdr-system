/**
 * Multiple site addresses, phones, and emails per customer (requirement 2.2).
 * Lists live in child tables. When a list is non-empty, exactly one row is primary.
 */
const { Op } = require('sequelize');
const {
  sequelize,
  Customer,
  CustomerSite,
  CustomerPhone,
  CustomerEmail,
  Job,
  Appointment,
} = require('./models');
const { plain } = require('./db');
const { normalisePhone } = require('./phone');
const { findPhoneOwner, findEmailOwner } = require('./customerDuplicates');

const PHONE_TYPES = Object.freeze(['mobile', 'landline', 'work']);
const EMAIL_TYPES = Object.freeze(['personal', 'work']);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CONTACT_INCLUDE = Object.freeze([
  { model: CustomerSite, as: 'sites', required: false },
  { model: CustomerPhone, as: 'phones', required: false },
  { model: CustomerEmail, as: 'emails', required: false },
]);

const CONTACT_ORDER = [
  [{ model: CustomerSite, as: 'sites' }, 'is_primary', 'DESC'],
  [{ model: CustomerSite, as: 'sites' }, 'id', 'ASC'],
  [{ model: CustomerPhone, as: 'phones' }, 'is_primary', 'DESC'],
  [{ model: CustomerPhone, as: 'phones' }, 'id', 'ASC'],
  [{ model: CustomerEmail, as: 'emails' }, 'is_primary', 'DESC'],
  [{ model: CustomerEmail, as: 'emails' }, 'id', 'ASC'],
];

/**
 * @param {{ address?: string, postcode?: string }|null} site
 * @returns {string|null}
 */
function formatSite(site) {
  if (!site) return null;
  const address = String(site.address || '').trim();
  const postcode = String(site.postcode || '').trim();
  if (!address && !postcode) return null;
  return [address, postcode].filter(Boolean).join(', ');
}

function pickPrimary(list) {
  if (!Array.isArray(list) || !list.length) return null;
  return list.find((row) => row.is_primary) || list[0];
}

/**
 * Copy primary site / phone / email onto the scalar fields existing callers expect.
 * @param {object|null} obj plain customer (mutated)
 * @returns {object|null}
 */
function applyPrimaryContacts(obj) {
  if (!obj) return obj;
  if (Array.isArray(obj.phones)) {
    const phone = pickPrimary(obj.phones);
    obj.phone = phone ? phone.value : null;
  }
  if (Array.isArray(obj.emails)) {
    const email = pickPrimary(obj.emails);
    obj.email = email ? email.value : null;
  }
  if (Array.isArray(obj.sites)) {
    const site = pickPrimary(obj.sites);
    obj.address = site ? site.address : null;
    obj.postcode = site ? site.postcode : null;
  }
  return obj;
}

/**
 * Overlay a quote/job/visit's chosen contacts onto a customer for PDFs and sends.
 * @param {object} customer hydrated customer with sites/phones/emails
 * @param {{ site_id?: number|null, phone_id?: number|null, email_id?: number|null }} selection
 */
function applySelectedContacts(customer, selection = {}) {
  const c = applyPrimaryContacts({ ...customer, sites: customer.sites, phones: customer.phones, emails: customer.emails });
  const site = (customer.sites || []).find((s) => s.id === selection.site_id);
  const phone = (customer.phones || []).find((p) => p.id === selection.phone_id);
  const email = (customer.emails || []).find((e) => e.id === selection.email_id);
  if (site) {
    c.address = site.address;
    c.postcode = site.postcode;
  }
  if (phone) c.phone = phone.value;
  if (email) c.email = email.value;
  return c;
}

/**
 * @param {Array<{ is_primary?: boolean }>} items
 * @param {string} label
 * @returns {Array| { error: string }}
 */
function enforceOnePrimary(items, label) {
  if (!items.length) return items;
  const marked = items.filter((i) => i.is_primary);
  if (marked.length > 1) {
    return { error: `Exactly one primary ${label} is required` };
  }
  if (marked.length === 0) {
    items[0].is_primary = true;
  }
  return items;
}

function parseSiteItem(row) {
  if (!row || typeof row !== 'object') return { error: 'Invalid site entry' };
  const address = String(row.address || '').trim();
  if (!address) return { error: 'Site address is required' };
  const postcode = row.postcode == null || row.postcode === ''
    ? null
    : (String(row.postcode).trim() || null);
  return {
    address,
    postcode,
    is_primary: !!row.is_primary,
  };
}

function parsePhoneItem(row) {
  if (!row || typeof row !== 'object') return { error: 'Invalid phone entry' };
  const value = String(row.value == null ? row.phone || '' : row.value).trim();
  if (!value) return { error: 'Phone number is required' };
  const normalised = normalisePhone(value);
  if (!normalised) return { error: 'Enter a valid phone number' };
  const type = row.type == null || row.type === '' ? 'mobile' : row.type;
  if (!PHONE_TYPES.includes(type)) return { error: 'Invalid phone type' };
  return { value, normalised, type, is_primary: !!row.is_primary };
}

function publicPhone(row) {
  const o = plain(row);
  if (o) delete o.normalised;
  return o;
}

function parseEmailItem(row) {
  if (!row || typeof row !== 'object') return { error: 'Invalid email entry' };
  const value = String(row.value == null ? row.email || '' : row.value).trim();
  if (!value) return { error: 'Email address is required' };
  if (!EMAIL_RE.test(value)) return { error: 'Invalid email address' };
  const type = row.type == null || row.type === '' ? 'personal' : row.type;
  if (!EMAIL_TYPES.includes(type)) return { error: 'Invalid email type' };
  return { value, type, is_primary: !!row.is_primary };
}

function parseList(raw, parseItem, label) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return { error: `${label} must be an array` };
  const items = [];
  for (const row of raw) {
    const parsed = parseItem(row);
    if (parsed.error) return parsed;
    items.push(parsed);
  }
  return enforceOnePrimary(items, label);
}

/**
 * Arrays on the body win. Otherwise a single phone / email / site may be sent
 * as the first (and therefore primary) of each list.
 *
 * @param {object} body
 * @returns {{ sites: object[], phones: object[], emails: object[] }|{ error: string }}
 */
function parseContactInput(body = {}) {
  const sites = body.sites !== undefined
    ? parseList(body.sites, parseSiteItem, 'site')
    : parseList(
      (body.address && String(body.address).trim())
        ? [{ address: body.address, postcode: body.postcode, is_primary: true }]
        : [],
      parseSiteItem,
      'site',
    );
  if (sites.error) return sites;

  const phones = body.phones !== undefined
    ? parseList(body.phones, parsePhoneItem, 'phone')
    : parseList(
      (body.phone && String(body.phone).trim())
        ? [{ value: body.phone, type: body.phone_type || 'mobile', is_primary: true }]
        : [],
      parsePhoneItem,
      'phone',
    );
  if (phones.error) return phones;

  const emails = body.emails !== undefined
    ? parseList(body.emails, parseEmailItem, 'email')
    : parseList(
      (body.email && String(body.email).trim())
        ? [{ value: body.email, type: body.email_type || 'personal', is_primary: true }]
        : [],
      parseEmailItem,
      'email',
    );
  if (emails.error) return emails;

  return { sites, phones, emails };
}

async function demoteOthers(model, customerId, exceptId, transaction) {
  const where = { customer_id: customerId, is_primary: true };
  if (exceptId) where.id = { [Op.ne]: exceptId };
  await model.update({ is_primary: false }, { where, transaction });
}

async function insertWithPrimary(model, customerId, attrs, isPrimary, transaction) {
  const run = async (t) => {
    const count = await model.count({ where: { customer_id: customerId }, transaction: t });
    const primary = count === 0 ? true : !!isPrimary;
    if (primary) await demoteOthers(model, customerId, null, t);
    return model.create({ customer_id: customerId, ...attrs, is_primary: primary }, { transaction: t });
  };
  if (transaction) return run(transaction);
  return sequelize.transaction(run);
}

async function updateWithPrimary(model, row, attrs, isPrimary) {
  return sequelize.transaction(async (t) => {
    const patch = { ...attrs };
    if (isPrimary === true) {
      await demoteOthers(model, row.customer_id, row.id, t);
      patch.is_primary = true;
    } else if (isPrimary === false && row.is_primary) {
      const siblings = await model.count({
        where: { customer_id: row.customer_id, id: { [Op.ne]: row.id } },
        transaction: t,
      });
      if (siblings > 0) {
        return { error: 'Exactly one primary is required — set another as primary first' };
      }
      return { error: 'Exactly one primary is required' };
    }
    await row.update(patch, { transaction: t });
    return row;
  });
}

async function destroyKeepingPrimary(model, row) {
  try {
    await sequelize.transaction(async (t) => {
      const wasPrimary = row.is_primary;
      const customerId = row.customer_id;
      await row.destroy({ transaction: t });
      if (!wasPrimary) return;
      const next = await model.findOne({
        where: { customer_id: customerId },
        order: [['id', 'ASC']],
        transaction: t,
      });
      if (next) await next.update({ is_primary: true }, { transaction: t });
    });
    return { ok: true };
  } catch (err) {
    if (err.name === 'SequelizeForeignKeyConstraintError' || /foreign key/i.test(err.message || '')) {
      return { error: 'This record is used on a quote, job, or site visit and cannot be deleted' };
    }
    throw err;
  }
}

async function saveContactLists(customerId, lists) {
  if (lists.phones.length) {
    await sequelize.transaction(async (t) => {
      for (const phone of lists.phones) {
        await CustomerPhone.create(
          {
            customer_id: customerId,
            value: phone.value,
            normalised: phone.normalised || normalisePhone(phone.value),
            type: phone.type,
            is_primary: phone.is_primary,
          },
          { transaction: t },
        );
      }
    });
  }
  if (lists.emails.length) {
    await sequelize.transaction(async (t) => {
      for (const email of lists.emails) {
        await CustomerEmail.create(
          { customer_id: customerId, value: email.value, type: email.type, is_primary: email.is_primary },
          { transaction: t },
        );
      }
    });
  }
  if (lists.sites.length) {
    await sequelize.transaction(async (t) => {
      for (const site of lists.sites) {
        await CustomerSite.create(
          { customer_id: customerId, address: site.address, postcode: site.postcode, is_primary: site.is_primary },
          { transaction: t },
        );
      }
    });
  }
}

async function listContacts(customerId) {
  const [sites, phones, emails] = await Promise.all([
    CustomerSite.findAll({ where: { customer_id: customerId }, order: [['is_primary', 'DESC'], ['id', 'ASC']] }),
    CustomerPhone.findAll({ where: { customer_id: customerId }, order: [['is_primary', 'DESC'], ['id', 'ASC']] }),
    CustomerEmail.findAll({ where: { customer_id: customerId }, order: [['is_primary', 'DESC'], ['id', 'ASC']] }),
  ]);
  return { sites: plain(sites), phones: phones.map(publicPhone), emails: plain(emails) };
}

async function loadCustomerWithContacts(id) {
  const row = await Customer.findByPk(id, { include: [...CONTACT_INCLUDE] });
  if (!row) return null;
  const obj = applyPrimaryContacts(plain(row));
  obj.sites = (obj.sites || []).slice().sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.id - b.id);
  obj.phones = (obj.phones || []).slice().sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.id - b.id)
    .map((p) => {
      const copy = { ...p };
      delete copy.normalised;
      return copy;
    });
  obj.emails = (obj.emails || []).slice().sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.id - b.id);
  return obj;
}

function hydrateCustomers(rows) {
  return rows.map((row) => applyPrimaryContacts(plain(row)));
}

/**
 * Resolve optional site/phone/email ids against a customer. Omitted ids fall
 * back to that list's primary unless `fallbackPrimary` is false (Log enquiry
 * existing-customer: leave unselected contacts as null).
 *
 * @param {number} customerId
 * @param {{ site_id?: unknown, phone_id?: unknown, email_id?: unknown }} body
 * @param {{ fallbackPrimary?: boolean }} [opts]
 * @returns {Promise<{ site_id: number|null, phone_id: number|null, email_id: number|null, site: object|null, phone: object|null, email: object|null }|{ error: string }>}
 */
async function resolveCustomerContactSelection(customerId, body = {}, { fallbackPrimary = true } = {}) {
  const contacts = await listContacts(customerId);

  async function pick(kind, idRaw, list) {
    if (idRaw === undefined || idRaw === null || idRaw === '') {
      if (!fallbackPrimary) return { id: null, row: null };
      const primary = pickPrimary(list);
      return { id: primary ? primary.id : null, row: primary || null };
    }
    const id = Number(idRaw);
    if (!Number.isInteger(id) || id < 1) return { error: `Invalid ${kind}` };
    const row = list.find((item) => item.id === id);
    if (!row) return { error: `Selected ${kind} does not belong to this customer` };
    return { id, row };
  }

  const site = await pick('site', body.site_id, contacts.sites);
  if (site.error) return site;
  const phone = await pick('phone', body.phone_id, contacts.phones);
  if (phone.error) return phone;
  const email = await pick('email', body.email_id, contacts.emails);
  if (email.error) return email;

  return {
    site_id: site.id,
    phone_id: phone.id,
    email_id: email.id,
    site: site.row,
    phone: phone.row,
    email: email.row,
  };
}

async function syncSiteSnapshots(site) {
  const address = formatSite(site);
  await Job.update({ address }, { where: { site_id: site.id } });
  await Appointment.update({ address }, { where: { site_id: site.id } });
}

async function addSite(customerId, body) {
  const parsed = parseSiteItem(body);
  if (parsed.error) return parsed;
  const row = await insertWithPrimary(
    CustomerSite,
    customerId,
    { address: parsed.address, postcode: parsed.postcode },
    parsed.is_primary,
  );
  return { site: plain(row) };
}

async function updateSite(customerId, siteId, body) {
  const row = await CustomerSite.findOne({ where: { id: siteId, customer_id: customerId } });
  if (!row) return { error: 'Site not found', status: 404 };
  const attrs = {};
  if (body.address !== undefined) {
    const address = String(body.address || '').trim();
    if (!address) return { error: 'Site address is required' };
    attrs.address = address;
  }
  if (body.postcode !== undefined) {
    attrs.postcode = body.postcode == null || body.postcode === ''
      ? null
      : (String(body.postcode).trim() || null);
  }
  const isPrimary = body.is_primary === undefined ? undefined : !!body.is_primary;
  const updated = await updateWithPrimary(CustomerSite, row, attrs, isPrimary);
  if (updated.error) return updated;
  await syncSiteSnapshots(updated);
  return { site: plain(updated) };
}

async function removeSite(customerId, siteId) {
  const row = await CustomerSite.findOne({ where: { id: siteId, customer_id: customerId } });
  if (!row) return { error: 'Site not found', status: 404 };
  return destroyKeepingPrimary(CustomerSite, row);
}

async function addPhone(customerId, body, opts = {}) {
  const parsed = parsePhoneItem(body);
  if (parsed.error) return parsed;
  if (!opts.skipDuplicateCheck) {
    const hit = await findPhoneOwner(parsed.normalised);
    if (hit) return hit;
  }
  const row = await insertWithPrimary(
    CustomerPhone,
    customerId,
    { value: parsed.value, normalised: parsed.normalised, type: parsed.type },
    parsed.is_primary,
  );
  return { phone: publicPhone(row) };
}

async function updatePhone(customerId, phoneId, body, opts = {}) {
  const row = await CustomerPhone.findOne({ where: { id: phoneId, customer_id: customerId } });
  if (!row) return { error: 'Phone not found', status: 404 };
  const attrs = {};
  if (body.value !== undefined || body.phone !== undefined) {
    const value = String(body.value == null ? body.phone || '' : body.value).trim();
    if (!value) return { error: 'Phone number is required' };
    const normalised = normalisePhone(value);
    if (!normalised) return { error: 'Enter a valid phone number' };
    if (!opts.skipDuplicateCheck) {
      const hit = await findPhoneOwner(normalised, { exceptPhoneId: row.id });
      if (hit) return hit;
    }
    attrs.value = value;
    attrs.normalised = normalised;
  }
  if (body.type !== undefined) {
    if (!PHONE_TYPES.includes(body.type)) return { error: 'Invalid phone type' };
    attrs.type = body.type;
  }
  const isPrimary = body.is_primary === undefined ? undefined : !!body.is_primary;
  const updated = await updateWithPrimary(CustomerPhone, row, attrs, isPrimary);
  if (updated.error) return updated;
  return { phone: publicPhone(updated) };
}

async function removePhone(customerId, phoneId) {
  const row = await CustomerPhone.findOne({ where: { id: phoneId, customer_id: customerId } });
  if (!row) return { error: 'Phone not found', status: 404 };
  return destroyKeepingPrimary(CustomerPhone, row);
}

async function addEmail(customerId, body, opts = {}) {
  const parsed = parseEmailItem(body);
  if (parsed.error) return parsed;
  if (!opts.skipDuplicateCheck) {
    const hit = await findEmailOwner(parsed.value);
    if (hit) return hit;
  }
  const row = await insertWithPrimary(
    CustomerEmail,
    customerId,
    { value: parsed.value, type: parsed.type },
    parsed.is_primary,
  );
  return { email: plain(row) };
}

async function updateEmail(customerId, emailId, body, opts = {}) {
  const row = await CustomerEmail.findOne({ where: { id: emailId, customer_id: customerId } });
  if (!row) return { error: 'Email not found', status: 404 };
  const attrs = {};
  if (body.value !== undefined || body.email !== undefined) {
    const value = String(body.value == null ? body.email || '' : body.value).trim();
    if (!value) return { error: 'Email address is required' };
    if (!EMAIL_RE.test(value)) return { error: 'Invalid email address' };
    if (!opts.skipDuplicateCheck) {
      const hit = await findEmailOwner(value, { exceptEmailId: row.id });
      if (hit) return hit;
    }
    attrs.value = value;
  }
  if (body.type !== undefined) {
    if (!EMAIL_TYPES.includes(body.type)) return { error: 'Invalid email type' };
    attrs.type = body.type;
  }
  const isPrimary = body.is_primary === undefined ? undefined : !!body.is_primary;
  const updated = await updateWithPrimary(CustomerEmail, row, attrs, isPrimary);
  if (updated.error) return updated;
  return { email: plain(updated) };
}

async function removeEmail(customerId, emailId) {
  const row = await CustomerEmail.findOne({ where: { id: emailId, customer_id: customerId } });
  if (!row) return { error: 'Email not found', status: 404 };
  return destroyKeepingPrimary(CustomerEmail, row);
}

/**
 * When logging an enquiry on an existing customer, create site / phone / email
 * only for types that customer does not already have.
 *
 * @param {number} customerId
 * @param {{ sites?: object[], phones?: object[], emails?: object[] }} customer
 * @param {object} body
 * @returns {Promise<{ value: { site_id?: unknown, phone_id?: unknown, email_id?: unknown } }|{ error: string, status?: number, customer_id?: number, name?: string }>}
 */
async function createMissingContacts(customerId, customer, body = {}) {
  const next = {
    site_id: body.site_id,
    phone_id: body.phone_id,
    email_id: body.email_id,
  };
  if (!(customer.sites || []).length && String(body.address || '').trim()) {
    const added = await addSite(customerId, {
      address: body.address,
      postcode: body.postcode,
      is_primary: true,
    });
    if (added.error) return added;
    next.site_id = added.site.id;
  }
  if (!(customer.phones || []).length && String(body.phone || '').trim()) {
    const added = await addPhone(customerId, {
      value: body.phone,
      type: body.phone_type || 'mobile',
      is_primary: true,
    });
    if (added.error) return added;
    next.phone_id = added.phone.id;
  }
  if (!(customer.emails || []).length && String(body.email || '').trim()) {
    const added = await addEmail(customerId, {
      value: body.email,
      type: body.email_type || 'personal',
      is_primary: true,
    });
    if (added.error) return added;
    next.email_id = added.email.id;
  }
  return { value: next };
}

module.exports = {
  PHONE_TYPES,
  EMAIL_TYPES,
  CONTACT_INCLUDE,
  CONTACT_ORDER,
  formatSite,
  applyPrimaryContacts,
  applySelectedContacts,
  enforceOnePrimary,
  parseSiteItem,
  parsePhoneItem,
  parseEmailItem,
  parseContactInput,
  saveContactLists,
  listContacts,
  loadCustomerWithContacts,
  hydrateCustomers,
  resolveCustomerContactSelection,
  createMissingContacts,
  addSite,
  updateSite,
  removeSite,
  addPhone,
  updatePhone,
  removePhone,
  addEmail,
  updateEmail,
  removeEmail,
};
