/**
 * Appointment types (requirement 5.3). Labels only — they do not change
 * pipeline stage or the produce-quote task.
 */
const VISIT_TYPES = Object.freeze([
  { value: 'site_visit', label: 'Site visit' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'measure', label: 'Measure' },
  { value: 'other', label: 'Other' },
]);

const VISIT_TYPE_VALUES = Object.freeze(VISIT_TYPES.map((t) => t.value));

function visitTypeLabel(value) {
  return VISIT_TYPES.find((t) => t.value === value)?.label || 'Site visit';
}

function visitTitle(visitType, customerName) {
  return `${visitTypeLabel(visitType)} — ${customerName}`;
}

/**
 * @param {unknown} value
 * @param {{ required?: boolean }} [opts]
 * @returns {{ value: string }|{ error: string }|{ skip: true }}
 */
function parseVisitType(value, opts = {}) {
  if (value === undefined || value === null || value === '') {
    if (opts.required) return { error: 'Select a visit type' };
    return { skip: true };
  }
  const code = String(value).trim();
  if (!VISIT_TYPE_VALUES.includes(code)) return { error: 'Invalid visit type' };
  return { value: code };
}

/**
 * Reschedule/cancel only for a booked visit that has not ended yet.
 * @param {{ status?: string, end?: Date|string }} appointment
 * @param {Date} [now]
 * @returns {{ error: string }|null}
 */
function visitChangeBlock(appointment, now = new Date()) {
  if (!appointment) return { error: 'Appointment not found' };
  if (appointment.status !== 'booked') return { error: 'Only a booked visit can be changed' };
  const end = new Date(appointment.end);
  if (Number.isNaN(end.getTime()) || end.getTime() <= now.getTime()) {
    return { error: 'This visit has already ended' };
  }
  return null;
}

module.exports = {
  VISIT_TYPES,
  VISIT_TYPE_VALUES,
  visitTypeLabel,
  visitTitle,
  parseVisitType,
  visitChangeBlock,
};
