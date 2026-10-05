/**
 * Phone normalisation for match and search only (requirement 2.5).
 * The typed display value on customer_phones.value is left unchanged.
 *
 * Digits-only UK form: spaces/dashes stripped, +44 or leading 44 → 0
 * so 07700 900100 and +447700900100 compare equal.
 *
 * @param {unknown} raw
 * @returns {string|null}
 */
function normalisePhone(raw) {
  if (raw == null || raw === '') return null;
  let s = String(raw).replace(/[^\d+]/g, '');
  if (!s || s === '+') return null;
  if (s.startsWith('+44')) s = `0${s.slice(3)}`;
  if (s.startsWith('44') && s.length >= 11) s = `0${s.slice(2)}`;
  s = s.replace(/\D/g, '');
  return s || null;
}

module.exports = { normalisePhone };
