/**
 * Text-field parsers for money/qty so a leading 0 can be cleared
 * (HTML type=number + Number('') snaps back to 0).
 */

/**
 * @param {string} raw
 * @param {{ maxDecimals?: number }} [opts]
 * @returns {number|''}
 */
export function parseDecimalInput(raw, { maxDecimals = 2 } = {}) {
  const str = String(raw);
  if (str.trim() === '') return '';
  let s = str.replace(/[^\d.]/g, '');
  if (s === '') return '';
  if (s === '.') return '0.';
  const firstDot = s.indexOf('.');
  const hasDot = firstDot !== -1;
  let whole = hasDot ? s.slice(0, firstDot) : s;
  let frac = hasDot ? s.slice(firstDot + 1).replace(/\./g, '') : '';
  whole = whole.replace(/^0+(?=\d)/, '');
  if (hasDot) {
    frac = frac.slice(0, maxDecimals);
    const wholeDisp = whole === '' ? '0' : whole;
    if (frac === '') return `${wholeDisp}.`;
    const n = Number(`${wholeDisp}.${frac}`);
    return Number.isFinite(n) ? n : '';
  }
  if (whole === '') return '';
  const n = Number(whole);
  return Number.isFinite(n) ? n : '';
}

/** Controlled input value; keeps an in-progress trailing decimal point. */
export function decimalFieldValue(value) {
  if (value === '' || value == null) return '';
  return String(value);
}

export function coerceDecimal(value) {
  if (value === '' || value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
