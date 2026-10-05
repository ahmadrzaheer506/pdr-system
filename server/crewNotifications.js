/**
 * Crew change rows for assigned staff (requirement 8.3).
 * In-app and staff email both honour 13.2 opt-in (email is crew add/remove only).
 */
const { parseUserIds } = require('./jobDays');
const { createNotifications, safeNotify } = require('./notifications');

function diffUserIds(previousIds, nextIds) {
  const prev = parseUserIds(previousIds);
  const next = parseUserIds(nextIds);
  const prevSet = new Set(prev);
  const nextSet = new Set(next);
  return {
    added: next.filter((id) => !prevSet.has(id)),
    removed: prev.filter((id) => !nextSet.has(id)),
  };
}

/**
 * @param {{ id: number, title?: string }} job
 * @param {string} workDate
 * @param {number[]} previousIds
 * @param {number[]} nextIds
 * @param {import('sequelize').Transaction} [transaction]
 */
async function notifyCrewChange({ job, workDate, previousIds, nextIds, transaction }) {
  const { added, removed } = diffUserIds(previousIds, nextIds);
  const title = job?.title || 'a job';
  const rows = [
    ...added.map((user_id) => ({
      user_id,
      kind: 'crew_added',
      message: `You've been assigned to "${title}" on ${workDate}`,
      job_id: job.id,
      work_date: workDate,
      entity_type: 'job',
      entity_id: job.id,
    })),
    ...removed.map((user_id) => ({
      user_id,
      kind: 'crew_removed',
      message: `You've been taken off "${title}" on ${workDate}`,
      job_id: job.id,
      work_date: workDate,
      entity_type: 'job',
      entity_id: job.id,
    })),
  ];
  if (!rows.length) return [];
  await safeNotify(() => createNotifications(rows, { transaction }));
  return rows;
}

module.exports = { diffUserIds, notifyCrewChange };
