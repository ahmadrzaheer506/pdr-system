/**
 * Kanban board filters (requirement 4.4): text search, source (multi), owner,
 * customer, created_at, and latest-quote value. The board is one card per
 * enquiry (lead). Dimensions combine with AND; sources within a multi-select
 * combine with OR (IN).
 */
const { Op, literal } = require('sequelize');
const { parseCreatedRange, customerTextSearchOr } = require('./customerSearch');

/**
 * Latest draft or sent quote for this customer (requirement 4.5). Used by
 * reports that still snapshot Customer.stage.
 */
const LATEST_QUOTE_SQL = `(SELECT q.total FROM quotes q WHERE q.customer_id = "Customer".id AND q.status IN ('sent','draft') ORDER BY q.id DESC LIMIT 1)`;
const PIPELINE_VALUE_SQL = `COALESCE(${LATEST_QUOTE_SQL}, 0)`;

/** Latest open quote on this enquiry — board cards and column totals. */
const LEAD_LATEST_QUOTE_SQL = `(SELECT q.total FROM quotes q WHERE q.lead_id = "Lead".id AND q.status IN ('sent','draft') ORDER BY q.id DESC LIMIT 1)`;
const LEAD_PIPELINE_VALUE_SQL = `COALESCE(${LEAD_LATEST_QUOTE_SQL}, 0)`;
const OPEN_TASKS_SQL = `(SELECT COUNT(*) FROM tasks t WHERE t.entity_type='customer' AND t.entity_id="Lead".customer_id AND t.status='open')`;

/**
 * @param {unknown} value query.source (string, comma list, or repeated param)
 * @returns {string[]}
 */
function parseSourceList(value) {
  const raw = value == null ? [] : Array.isArray(value) ? value : [value];
  const seen = [];
  for (const part of raw) {
    for (const token of String(part).split(',')) {
      const source = token.trim();
      if (source && !seen.includes(source)) seen.push(source);
    }
  }
  return seen;
}

/**
 * @param {unknown} value
 * @returns {{ skip: true }|{ owner_id: number|null }|{ error: string }}
 */
function parseOwnerFilter(value) {
  if (value == null || value === '' || value === 'all') return { skip: true };
  if (value === 'unassigned' || value === 'none') return { owner_id: null };
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return { error: 'Invalid owner_id' };
  return { owner_id: n };
}

/**
 * @param {unknown} value
 * @returns {{ skip: true }|{ customer_id: number }|{ error: string }}
 */
function parseCustomerFilter(value) {
  if (value == null || value === '' || value === 'all') return { skip: true };
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return { error: 'Invalid customer_id' };
  return { customer_id: n };
}
/**
 * @param {unknown} value
 * @param {string} field
 * @returns {{ value: number|null }|{ error: string }}
 */
function parseMoneyBound(value, field) {
  if (value == null || value === '') return { value: null };
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return { error: `Invalid ${field}` };
  return { value: n };
}

function leadTextSearchOr(value, sequelize) {
  const q = value == null ? '' : String(value).trim();
  if (!q) return { clause: null };
  const customer = customerTextSearchOr(q, sequelize);
  if (customer.error) return customer;
  if (!customer.clause) return { clause: null };
  const like = `%${q}%`;
  const esc = sequelize.escape(like);
  const or = [
    literal(`EXISTS (SELECT 1 FROM customers c WHERE c.id = "Lead".customer_id AND (c.name ILIKE ${esc} OR COALESCE(c.company_name,'') ILIKE ${esc}))`),
    literal(`EXISTS (SELECT 1 FROM customer_phones p WHERE p.customer_id = "Lead".customer_id AND p.value ILIKE ${esc})`),
    literal(`EXISTS (SELECT 1 FROM customer_emails e WHERE e.customer_id = "Lead".customer_id AND e.value ILIKE ${esc})`),
    literal(`EXISTS (SELECT 1 FROM customer_sites s WHERE s.customer_id = "Lead".customer_id AND (s.address ILIKE ${esc} OR COALESCE(s.postcode,'') ILIKE ${esc}))`),
  ];
  const { normalisePhone } = require('./phone');
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

/**
 * @param {object} query
 * @param {{ escape: Function }|null} [sequelize]
 * @returns {{ where: object, customerWhere: object }|{ error: string }}
 */
function buildPipelineBoardWhere(query = {}, sequelize = null) {
  const leadAnd = [];
  const customerAnd = [];

  const sources = parseSourceList(query.source);
  if (sources.length === 1) leadAnd.push({ source: sources[0] });
  else if (sources.length > 1) leadAnd.push({ source: { [Op.in]: sources } });

  const owner = parseOwnerFilter(query.owner_id);
  if (owner.error) return owner;
  if (!owner.skip) customerAnd.push({ owner_id: owner.owner_id });

  const customer = parseCustomerFilter(query.customer_id);
  if (customer.error) return customer;
  if (!customer.skip) leadAnd.push({ customer_id: customer.customer_id });

  const dates = parseCreatedRange(query);
  if (dates.error) return dates;
  if (dates.range) leadAnd.push({ created_at: dates.range });

  const min = parseMoneyBound(query.value_min, 'value_min');
  if (min.error) return min;
  const max = parseMoneyBound(query.value_max, 'value_max');
  if (max.error) return max;
  if (min.value != null && max.value != null && min.value > max.value) {
    return { error: 'value_min must be on or below value_max' };
  }
  if (min.value != null) leadAnd.push(literal(`${LEAD_LATEST_QUOTE_SQL} >= ${min.value}`));
  if (max.value != null) leadAnd.push(literal(`COALESCE(${LEAD_LATEST_QUOTE_SQL}, 0) <= ${max.value}`));

  const text = leadTextSearchOr(query.q, sequelize);
  if (text.error) return text;
  if (text.clause) leadAnd.push(text.clause);

  return {
    where: leadAnd.length ? { [Op.and]: leadAnd } : {},
    customerWhere: customerAnd.length ? { [Op.and]: customerAnd } : {},
  };
}

module.exports = {
  LATEST_QUOTE_SQL,
  OPEN_TASKS_SQL,
  PIPELINE_VALUE_SQL,
  LEAD_LATEST_QUOTE_SQL,
  LEAD_PIPELINE_VALUE_SQL,
  parseSourceList,
  parseOwnerFilter,
  parseCustomerFilter,
  parseMoneyBound,
  buildPipelineBoardWhere,
};
