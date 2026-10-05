/**
 * Customer list filters (requirement 2.5): text search (including normalised
 * phone), postcode, source, company name, and created-date range.
 */
const { Op, literal } = require('sequelize');
const { resolveCustomerType } = require('./customerType');
const { normalisePhone } = require('./phone');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function invalidDate(value, field) {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  if (!DATE_RE.test(s)) return { error: `Invalid ${field} date` };
  return s;
}

/**
 * @param {object} query
 * @param {{ escape: Function }} sequelize
 * @returns {{ where: object }|{ error: string }}
 */
function buildCustomerListWhere(query = {}, sequelize) {
  const and = [];

  if (query.stage) and.push({ stage: query.stage });

  if (query.customer_type) {
    const type = resolveCustomerType(query.customer_type);
    if (type.error) return type;
    and.push({ customer_type: type.value });
  }

  if (query.source) {
    const source = String(query.source).trim();
    if (source) and.push({ source });
  }

  if (query.company_name) {
    const company = String(query.company_name).trim();
    if (company) and.push({ company_name: { [Op.iLike]: `%${company}%` } });
  }

  if (query.postcode) {
    const postcode = String(query.postcode).trim();
    if (postcode) {
      const esc = sequelize.escape(`%${postcode}%`);
      and.push(literal(
        `EXISTS (SELECT 1 FROM customer_sites s WHERE s.customer_id = "Customer".id AND COALESCE(s.postcode,'') ILIKE ${esc})`,
      ));
    }
  }

  const dates = parseCreatedRange(query);
  if (dates.error) return dates;
  if (dates.range) and.push({ created_at: dates.range });

  const text = customerTextSearchOr(query.q, sequelize);
  if (text.error) return text;
  if (text.clause) and.push(text.clause);

  if (!and.length) return { where: {} };
  return { where: { [Op.and]: and } };
}

/**
 * Inclusive created_at date range from `YYYY-MM-DD` query params.
 * @param {object} query
 * @returns {{ range: object|null }|{ error: string }}
 */
function parseCreatedRange(query = {}) {
  const from = invalidDate(query.created_from, 'created_from');
  if (from && from.error) return from;
  const to = invalidDate(query.created_to, 'created_to');
  if (to && to.error) return to;
  if (from && to && from > to) return { error: 'created_from must be on or before created_to' };
  if (!from && !to) return { range: null };
  const range = {};
  if (from) range[Op.gte] = `${from}T00:00:00.000Z`;
  if (to) range[Op.lte] = `${to}T23:59:59.999Z`;
  return { range };
}

/**
 * Name / company / phone / email / address search used by the customer list
 * and the pipeline board.
 * @param {unknown} value
 * @param {{ escape: Function }} sequelize
 * @returns {{ clause: object|null }|{ error: string }}
 */
function customerTextSearchOr(value, sequelize) {
  const q = value == null ? '' : String(value).trim();
  if (!q) return { clause: null };
  if (!sequelize || typeof sequelize.escape !== 'function') {
    return { error: 'Search is unavailable' };
  }
  const like = `%${q}%`;
  const esc = sequelize.escape(like);
  const or = [
    { name: { [Op.iLike]: like } },
    { company_name: { [Op.iLike]: like } },
    literal(`EXISTS (SELECT 1 FROM customer_phones p WHERE p.customer_id = "Customer".id AND p.value ILIKE ${esc})`),
    literal(`EXISTS (SELECT 1 FROM customer_emails e WHERE e.customer_id = "Customer".id AND e.value ILIKE ${esc})`),
    literal(`EXISTS (SELECT 1 FROM customer_sites s WHERE s.customer_id = "Customer".id AND (s.address ILIKE ${esc} OR COALESCE(s.postcode,'') ILIKE ${esc}))`),
  ];
  const digits = normalisePhone(q);
  if (digits) {
    const exact = sequelize.escape(digits);
    const digitLike = sequelize.escape(`%${digits}%`);
    or.push(literal(
      `EXISTS (SELECT 1 FROM customer_phones p WHERE p.customer_id = "Customer".id AND (p.normalised = ${exact} OR p.normalised ILIKE ${digitLike}))`,
    ));
  }
  return { clause: { [Op.or]: or } };
}

module.exports = { buildCustomerListWhere, parseCreatedRange, customerTextSearchOr };
