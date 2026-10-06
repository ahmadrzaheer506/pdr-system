/**
 * Job status order (requirement 7.2). Office may skip ahead, not go back.
 */
const JOB_STATUSES = Object.freeze([
  'PENDING',
  'SCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'INVOICED',
  'PAID',
]);

const JOB_PRIORITIES = Object.freeze(['low', 'normal', 'high', 'urgent']);

/**
 * Jobs default to normal. Office may set low, high, or urgent.
 * @param {unknown} raw
 * @param {{ fallback?: string }} [opts]
 * @returns {{ value?: string, error?: string }}
 */
function parseJobPriority(raw, { fallback } = {}) {
  if (raw == null || String(raw).trim() === '') {
    if (fallback !== undefined) return { value: fallback };
    return { value: undefined };
  }
  const priority = String(raw).trim().toLowerCase();
  if (!JOB_PRIORITIES.includes(priority)) {
    return { error: 'Priority must be low, normal, high, or urgent' };
  }
  return { value: priority };
}

function canAdvanceJobStatus(from, to) {
  const next = JOB_STATUSES.indexOf(to);
  if (next < 0) return false;
  const current = JOB_STATUSES.indexOf(from);
  if (current < 0) return true;
  return next >= current;
}

/** Office may pull a live booking off the calendar — not a general go-back. */
function canUnscheduleJob(status) {
  return status === 'SCHEDULED' || status === 'IN_PROGRESS';
}

module.exports = { JOB_STATUSES, JOB_PRIORITIES, parseJobPriority, canAdvanceJobStatus, canUnscheduleJob };
