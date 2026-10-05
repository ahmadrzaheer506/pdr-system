/**
 * Inbox list filters: status, source, created-date range, and text search
 * across the enquiry and the matched customer.
 */
const { Op, literal } = require('sequelize');
const { parseCreatedRange } = require('./customerSearch');
const { normalisePhone } = require('./phone');

/**
 * @param {object} query
 * @param {{ escape: Function }} sequelize
 * @param {{ includeStatus?: boolean }} [opts]
 * @returns {{ where: object }|{ error: string }}
 */
function buildLeadListWhere(query = {}, sequelize, opts = {}) {
  const includeStatus = opts.includeStatus !== false;
  const and = [];

  if (includeStatus) {
    const status = query.status == null ? 'NEW' : String(query.status);
    if (status && status !== 'ALL') and.push({ status });
  }

  if (query.source) {
    const source = String(query.source).trim();
    if (source && source !== 'ALL') and.push({ source });
  }

  const dates = parseCreatedRange(query);
  if (dates.error) return dates;
  if (dates.range) and.push({ created_at: dates.range });

  const text = leadTextSearchOr(query.q, sequelize);
  if (text.error) return text;
  if (text.clause) and.push(text.clause);

  if (!and.length) return { where: {} };
  if (and.length === 1) return { where: and[0] };
  return { where: { [Op.and]: and } };
}

/**
 * Matches enquiry text plus the linked customer's name, company, phone, and email.
 * @param {unknown} value
 * @param {{ escape: Function }} sequelize
 * @returns {{ clause: object|null }|{ error: string }}
 */
function leadTextSearchOr(value, sequelize) {
  const q = value == null ? '' : String(value).trim();
  if (!q) return { clause: null };
  if (!sequelize || typeof sequelize.escape !== 'function') {
    return { error: 'Search is unavailable' };
  }
  const like = `%${q}%`;
  const esc = sequelize.escape(like);
  const or = [
    { message: { [Op.iLike]: like } },
    { subject: { [Op.iLike]: like } },
    literal(`EXISTS (SELECT 1 FROM customers c WHERE c.id = "Lead".customer_id AND (c.name ILIKE ${esc} OR COALESCE(c.company_name,'') ILIKE ${esc}))`),
    literal(`EXISTS (SELECT 1 FROM customer_phones p WHERE p.customer_id = "Lead".customer_id AND p.value ILIKE ${esc})`),
    literal(`EXISTS (SELECT 1 FROM customer_emails e WHERE e.customer_id = "Lead".customer_id AND e.value ILIKE ${esc})`),
  ];
  const digits = normalisePhone(q);
  if (digits) {
    const exact = sequelize.escape(digits);
    const digitLike = sequelize.escape(`%${digits}%`);
    or.push(literal(
      `EXISTS (SELECT 1 FROM customer_phones p WHERE p.customer_id = "Lead".customer_id AND (p.normalised = ${exact} OR p.normalised ILIKE ${digitLike}))`,
    ));
  }
  return { clause: { [Op.or]: or } };
}

module.exports = { buildLeadListWhere, leadTextSearchOr };
