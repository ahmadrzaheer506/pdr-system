/**
 * Required lost-reason list when a customer is moved to LOST (requirement 2.6).
 * Stored as display text on customers.lost_reason. Note is only used for Other.
 */
const LOST_REASONS = Object.freeze([
  { value: 'cheaper_quote', label: 'Cheaper quote' },
  { value: 'no_response', label: 'No response' },
  { value: 'out_of_area', label: 'Out of area' },
  { value: 'other', label: 'Other' },
]);

const LOST_REASON_VALUES = Object.freeze(LOST_REASONS.map((r) => r.value));

/**
 * @param {{ lost_reason_code?: unknown, lost_reason_note?: unknown }} body
 * @returns {{ lost_reason: string, code: string }|{ error: string }}
 */
function parseLostReason(body = {}) {
  const code = String(body.lost_reason_code || '').trim();
  if (!LOST_REASON_VALUES.includes(code)) {
    return { error: 'Select a lost reason' };
  }
  const item = LOST_REASONS.find((r) => r.value === code);
  const note = code === 'other' ? String(body.lost_reason_note || '').trim() : '';
  return {
    code,
    lost_reason: note ? `${item.label} — ${note}` : item.label,
  };
}

module.exports = { LOST_REASONS, LOST_REASON_VALUES, parseLostReason };
