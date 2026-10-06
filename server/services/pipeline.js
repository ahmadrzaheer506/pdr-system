// ============================================================
// Pipeline stages (PRD §13.2) + audited stage transitions.
// Stage is stored on the lead (enquiry). Customer.stage is a
// denormalised copy of the last move, used by reports/lists.
// ============================================================
const { Op } = require('sequelize');
const { Customer, Lead, Activity, StageHistory } = require('../models');

/**
 * Kanban columns (requirement 4.1). Spec text says 11 stages; the board keeps
 * every current column, including Paid as the twelfth.
 */
const STAGES = [
  'ENQUIRY',
  'SITE_VISIT_BOOKED',
  'QUOTE_PENDING',
  'QUOTED',
  'FOLLOW_UP',
  'WON',
  'LOST',
  'SCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'INVOICED',
  'PAID',
];

const STAGE_LABELS = {
  ENQUIRY: 'Enquiry',
  SITE_VISIT_BOOKED: 'Site Visit Booked',
  QUOTE_PENDING: 'Quote Pending',
  QUOTED: 'Quoted',
  FOLLOW_UP: 'Follow-Up',
  WON: 'Won',
  LOST: 'Lost',
  SCHEDULED: 'Scheduled',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  INVOICED: 'Invoiced',
  PAID: 'Paid',
};

const ACTIVE_PIPELINE_STAGES = ['ENQUIRY', 'SITE_VISIT_BOOKED', 'QUOTE_PENDING', 'QUOTED', 'FOLLOW_UP'];

/**
 * Board + per-column pipeline value (requirement 4.5): latest sent/draft quote
 * per enquiry, Enquiry → Follow-up. Matches the card figure and the 14.1 report.
 * @param {Record<string, object[]>} board
 * @returns {{ board: number, byStage: Record<string, number|null> }}
 */
function sumPipelineBoardTotals(board) {
  const byStage = {};
  let total = 0;
  for (const stage of STAGES) {
    const sum = (board[stage] || []).reduce((acc, row) => acc + Number(row.pipeline_value || 0), 0);
    if (ACTIVE_PIPELINE_STAGES.includes(stage)) {
      byStage[stage] = sum;
      total += sum;
    } else {
      byStage[stage] = null;
    }
  }
  return { board: total, byStage };
}

async function logActivity(customerId, userId, kind, detail, entityType = null, entityId = null) {
  await Activity.create({
    customer_id: customerId,
    user_id: userId,
    kind,
    detail,
    entity_type: entityType,
    entity_id: entityId,
  });
}

/**
 * The enquiry this event belongs to. Explicit lead_id wins; otherwise the
 * customer's latest lead. Null only when the customer has no leads yet.
 * @param {number} customerId
 * @param {number|string|null|undefined} leadId
 */
async function resolveLeadForCustomer(customerId, leadId) {
  if (leadId != null && leadId !== '') {
    const id = Number(leadId);
    if (!Number.isInteger(id) || id <= 0) {
      const err = new Error('Invalid lead_id');
      err.status = 400;
      throw err;
    }
    const lead = await Lead.findOne({ where: { id, customer_id: customerId } });
    if (!lead) {
      const err = new Error('Lead not found');
      err.status = 404;
      throw err;
    }
    return lead;
  }
  return Lead.findOne({
    where: { customer_id: customerId },
    order: [['created_at', 'DESC'], ['id', 'DESC']],
  });
}

/**
 * Re-index cards in a stage. `beforeId` inserts before that lead;
 * omit/null appends at the end (requirement 4.2).
 * @param {number} leadId
 * @param {string} stage
 * @param {number|null|undefined} beforeId
 */
async function applyBoardOrder(leadId, stage, beforeId) {
  const siblings = await Lead.findAll({
    where: { stage, id: { [Op.ne]: leadId } },
    attributes: ['id'],
    order: [['board_order', 'ASC'], ['id', 'ASC']],
  });
  const ids = siblings.map((row) => row.id);
  let insertAt = ids.length;
  if (beforeId != null && beforeId !== '') {
    const idx = ids.indexOf(Number(beforeId));
    if (idx >= 0) insertAt = idx;
  }
  ids.splice(insertAt, 0, Number(leadId));
  await Promise.all(ids.map((id, i) => Lead.update({ board_order: i }, { where: { id } })));
}

/**
 * Move one enquiry to a stage. Customer.stage is updated as a denormalised
 * last-write copy so customer lists/reports still have a single column.
 *
 * @param {number} customerId
 * @param {string} toStage
 * @param {number|null} [userId]
 * @param {string|null} [note]
 * @param {{ beforeId?: number|null, leadId?: number|null }} [opts]
 */
async function setStage(customerId, toStage, userId = null, note = null, opts = {}) {
  if (!STAGES.includes(toStage)) throw new Error(`Unknown stage: ${toStage}`);
  const customer = await Customer.findByPk(customerId, { attributes: ['id', 'stage'] });
  if (!customer) throw new Error('Customer not found');

  const lead = await resolveLeadForCustomer(customerId, opts.leadId);
  const fromStage = lead ? lead.stage : customer.stage;
  if (fromStage !== toStage) {
    if (lead) {
      lead.stage = toStage;
      if (toStage === 'WON') lead.status = 'CONVERTED';
      if (toStage === 'LOST') lead.status = 'CLOSED';
      await lead.save();
    }
    customer.stage = toStage;
    await customer.save();
    await StageHistory.create({
      customer_id: customerId,
      lead_id: lead ? lead.id : null,
      from_stage: fromStage,
      to_stage: toStage,
      user_id: userId,
    });
    await logActivity(
      customerId,
      userId,
      'stage_change',
      note || `Stage: ${STAGE_LABELS[fromStage] || fromStage} → ${STAGE_LABELS[toStage]}`
    );
  }

  if (lead) await applyBoardOrder(lead.id, toStage, opts.beforeId);
  return toStage;
}

module.exports = {
  STAGES,
  STAGE_LABELS,
  ACTIVE_PIPELINE_STAGES,
  sumPipelineBoardTotals,
  setStage,
  logActivity,
  applyBoardOrder,
  resolveLeadForCustomer,
};
