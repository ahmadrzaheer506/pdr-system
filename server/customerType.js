/**
 * Customer master type (requirement 2.1).
 * Stored values stay `domestic` / `commercial` (no rename).
 */
const CUSTOMER_TYPES = Object.freeze(['domestic', 'commercial']);

/**
 * @param {unknown} value
 * @param {string} [fallback='domestic'] used when the field is omitted
 * @returns {{ value: string }|{ error: string }}
 */
function resolveCustomerType(value, fallback = 'domestic') {
  if (value === undefined || value === null || value === '') {
    return { value: fallback };
  }
  if (!CUSTOMER_TYPES.includes(value)) {
    return { error: 'Invalid customer type' };
  }
  return { value };
}

/**
 * Company / VAT rules for a resolved type.
 * Domestic always clears company_name and vat_number.
 * Commercial requires a non-empty company name; VAT is optional.
 *
 * @param {'domestic'|'commercial'} type
 * @param {{ company_name?: unknown, vat_number?: unknown }} body
 * @param {{ company_name?: string|null, vat_number?: string|null }} [existing]
 * @returns {{ customer_type: string, company_name: string|null, vat_number: string|null }|{ error: string }}
 */
function typeFields(type, body = {}, existing = {}) {
  if (type === 'domestic') {
    return { customer_type: 'domestic', company_name: null, vat_number: null };
  }

  const company = body.company_name !== undefined
    ? String(body.company_name || '').trim()
    : String(existing.company_name || '').trim();
  if (!company) {
    return { error: 'Company name is required for commercial customers' };
  }

  let vat = existing.vat_number || null;
  if (body.vat_number !== undefined) {
    vat = body.vat_number == null || body.vat_number === ''
      ? null
      : (String(body.vat_number).trim() || null);
  }

  return { customer_type: 'commercial', company_name: company, vat_number: vat };
}

module.exports = { CUSTOMER_TYPES, resolveCustomerType, typeFields };
