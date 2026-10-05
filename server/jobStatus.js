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

function canAdvanceJobStatus(from, to) {
  const next = JOB_STATUSES.indexOf(to);
  if (next < 0) return false;
  const current = JOB_STATUSES.indexOf(from);
  if (current < 0) return true;
  return next >= current;
}

module.exports = { JOB_STATUSES, canAdvanceJobStatus };
