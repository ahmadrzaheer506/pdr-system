/**
 * Optional extras on a quote (requirement 6.5).
 * Face-value lines listed after the works total and never included in it.
 * Office ticks which ones were accepted; those amounts are added to the job.
 */

function normaliseExtras(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => ({
      description: String(row?.description || '').trim(),
      amount: Number(row?.amount) || 0,
    }))
    .filter((row) => row.description || row.amount);
}

function extrasTotal(rows) {
  const sum = normaliseExtras(rows).reduce((s, row) => s + row.amount, 0);
  return Math.round(sum * 100) / 100;
}

/**
 * @param {Array} listed extras stored on the quote
 * @param {unknown} indexes body.accepted_extra_indexes
 * @returns {{ extras: Array }|{ error: string }}
 */
function pickAcceptedExtras(listed, indexes) {
  const extras = normaliseExtras(listed);
  if (indexes === undefined || indexes === null) return { extras: [] };
  if (!Array.isArray(indexes)) return { error: 'accepted_extra_indexes must be an array' };
  const picked = [];
  const seen = new Set();
  for (const raw of indexes) {
    const i = Number(raw);
    if (!Number.isInteger(i) || i < 0 || i >= extras.length || seen.has(i)) {
      return { error: 'accepted_extra_indexes must be unique indexes into optional extras' };
    }
    seen.add(i);
    picked.push(extras[i]);
  }
  return { extras: picked };
}

function jobValueFromQuote(quote, acceptedExtras) {
  const works = Number(quote?.total) || 0;
  return Math.round((works + extrasTotal(acceptedExtras)) * 100) / 100;
}

module.exports = {
  normaliseExtras,
  extrasTotal,
  pickAcceptedExtras,
  jobValueFromQuote,
};
