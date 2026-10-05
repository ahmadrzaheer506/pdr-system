/** Materials tracking + checklist helpers (requirement 7.3). */
export const MATERIAL_STATUSES = ['needed', 'packed', 'used'];

export function materialsNoteVisible(note, lines) {
  return Boolean(note) && !(Array.isArray(lines) && lines.length);
}

/** Qty line under a material name, e.g. "Qty: 2" or "Qty: 20 m²". */
export function materialQtyLabel(line) {
  if (line?.qty == null || line.qty === '') return null;
  const unit = String(line.unit || '').trim();
  return unit ? `Qty: ${line.qty} ${unit}` : `Qty: ${line.qty}`;
}
