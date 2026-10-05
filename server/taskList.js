'use strict';

const { Op } = require('sequelize');

/** Filters for GET /api/tasks (requirement 12.3). */
function listWhere({ status = 'open', when } = {}, today) {
  if (when === 'done') {
    return { status: { [Op.in]: ['done', 'dismissed'] } };
  }
  const where = {};
  if (status && status !== 'ALL') where.status = status;
  if (when === 'today') where.due_date = today;
  if (when === 'overdue') where.due_date = { [Op.lt]: today };
  if (when === 'due' || when === 'upcoming') where.due_date = { [Op.gt]: today };
  return where;
}

module.exports = { listWhere };
