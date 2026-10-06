/**
 * Structural financial exclusion for operatives (requirement 1.5).
 * Query allowlists never select money columns. Pay rates (hourly_cost, cis_status) are director-set (1.8) and never returned to operatives.
 */
const STAFF_JOB_ATTRS = [
  'id', 'title', 'description', 'address',
  'start_date', 'end_date', 'start_time', 'end_time',
  'status', 'priority', 'materials', 'notes',
  'phone_id',
];

const STAFF_JOB_RESPONSE_KEYS = [
  ...STAFF_JOB_ATTRS,
  'customer_name', 'customer_phone', 'crew', 'work_dates',
  'material_lines', 'checklist_items', 'files',
  'invoice_paid',
];

/** Money / quote / invoice fields that must never appear on operative payloads. */
const FINANCIAL_KEYS = new Set([
  'value', 'price', 'unit_price', 'total', 'subtotal',
  'vat_amount', 'vat_rate', 'cost_rate', 'labour_cost', 'actual_labour_cost',
  'hourly_cost', 'cis_status',
  'quote_id', 'invoice_id', 'qbo_id', 'pdf_file',
  'variations',
]);

/**
 * @param {Record<string, unknown>} job
 * @returns {Record<string, unknown>}
 */
function toPublicStaffJob(job) {
  const out = {};
  for (const key of STAFF_JOB_RESPONSE_KEYS) {
    if (job[key] !== undefined) out[key] = job[key];
  }
  return out;
}

/**
 * @param {Record<string, unknown>|null|undefined} row
 * @returns {Record<string, unknown>|null}
 */
function omitFinancial(row) {
  if (!row) return null;
  const out = { ...row };
  for (const key of FINANCIAL_KEYS) delete out[key];
  return out;
}

module.exports = {
  STAFF_JOB_ATTRS,
  STAFF_JOB_RESPONSE_KEYS,
  FINANCIAL_KEYS,
  toPublicStaffJob,
  omitFinancial,
};
