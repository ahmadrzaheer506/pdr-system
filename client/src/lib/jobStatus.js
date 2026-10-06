/**
 * Job status order (requirement 7.2). Office may skip ahead, not go back.
 */
export const JOB_STATUSES = Object.freeze([
  'PENDING',
  'SCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'INVOICED',
  'PAID',
]);

export const JOB_PRIORITIES = Object.freeze(['low', 'normal', 'high', 'urgent']);

export const JOB_PRIORITY_OPTIONS = Object.freeze([
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
]);

export function canAdvanceJobStatus(from, to) {
  const next = JOB_STATUSES.indexOf(to);
  if (next < 0) return false;
  const current = JOB_STATUSES.indexOf(from);
  if (current < 0) return true;
  return next >= current;
}

/** Office may pull a live booking off the calendar — not a general go-back. */
export function canUnscheduleJob(status) {
  return status === 'SCHEDULED' || status === 'IN_PROGRESS';
}
