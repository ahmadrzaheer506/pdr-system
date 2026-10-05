/** Appointment types (requirement 5.3). Labels only — no stage/task effect. */
export const VISIT_TYPES = [
  { value: 'site_visit', label: 'Site visit' },
  { value: 'follow_up', label: 'Follow-up' },
  { value: 'measure', label: 'Measure' },
  { value: 'other', label: 'Other' },
];

export function visitTypeLabel(value) {
  return VISIT_TYPES.find((t) => t.value === value)?.label || 'Site visit';
}

export function visitTitle(visitType, customerName) {
  return `${visitTypeLabel(visitType)} — ${customerName}`;
}

/** Booked visits that have not ended yet can be rescheduled or cancelled. */
export function canChangeVisit(appointment, now = new Date()) {
  if (!appointment || appointment.status !== 'booked' || !appointment.end) return false;
  const end = new Date(appointment.end);
  return !Number.isNaN(end.getTime()) && end.getTime() > now.getTime();
}

/** Staff or office can tick a booked visit complete at any time. */
export function canCompleteVisit(appointment) {
  return appointment?.status === 'booked';
}

export const STAFF_VISIT_VIEWS = [
  { id: 'uncompleted', label: 'Uncompleted' },
  { id: 'completed', label: 'Completed' },
  { id: 'all', label: 'All' },
];

export function normalizeStaffVisitView(raw) {
  if (raw === 'completed' || raw === 'done') return 'completed';
  if (raw === 'all') return 'all';
  return 'uncompleted';
}

export function visitMatchesView(visit, view) {
  const status = visit?.status;
  if (view === 'uncompleted') return status === 'booked';
  if (view === 'completed') return status === 'done';
  return status === 'booked' || status === 'done';
}

export function staffVisitCounts(visits) {
  const rows = Array.isArray(visits) ? visits : [];
  const uncompleted = rows.filter((v) => v.status === 'booked').length;
  const completed = rows.filter((v) => v.status === 'done').length;
  return { uncompleted, completed, all: uncompleted + completed };
}
