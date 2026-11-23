/**
 * Filter catalogue rows as the office types a quote line (requirement 6.1).
 */
export function matchCatalogueItems(items, query, limit = 20) {
  const list = Array.isArray(items) ? items : [];
  const q = String(query || '').trim().toLowerCase();
  const matched = q
    ? list.filter((row) => String(row.description || '').toLowerCase().includes(q))
    : list;
  return matched.slice(0, limit);
}

/** SKU-style id from a typed description (same rules as the server slug). */
export function suggestCatalogueId(description) {
  return String(description || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
}

export function catalogueHint(row) {
  const price = Number(row?.unit_price);
  const unit = String(row?.unit || '').trim();
  const amount = Number.isFinite(price) ? `£${price.toFixed(2)}` : '';
  if (amount && unit) return `${amount} / ${unit}`;
  return amount || unit;
}
