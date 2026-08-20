// ============================================================
// Pipeline stages (PRD §13.2) + audited stage transitions.
// ============================================================
const { db } = require('../db');

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

// Stages counted as "active pipeline" for pipeline-value reporting
const ACTIVE_PIPELINE_STAGES = ['ENQUIRY', 'SITE_VISIT_BOOKED', 'QUOTE_PENDING', 'QUOTED', 'FOLLOW_UP'];

function logActivity(customerId, userId, kind, detail, entityType = null, entityId = null) {
  db.prepare(
    'INSERT INTO activity (customer_id, user_id, kind, detail, entity_type, entity_id) VALUES (?,?,?,?,?,?)'
  ).run(customerId, userId, kind, detail, entityType, entityId);
}

/**
 * Move a customer to a new stage with full audit trail (PRD §9.2).
 * userId = null means the system moved it (automation).
 */
function setStage(customerId, toStage, userId = null, note = null) {
  if (!STAGES.includes(toStage)) throw new Error(`Unknown stage: ${toStage}`);
  const customer = db.prepare('SELECT id, stage FROM customers WHERE id = ?').get(customerId);
  if (!customer) throw new Error('Customer not found');
  if (customer.stage === toStage) return customer.stage;

  db.prepare("UPDATE customers SET stage = ?, updated_at = datetime('now') WHERE id = ?").run(toStage, customerId);
  db.prepare('INSERT INTO stage_history (customer_id, from_stage, to_stage, user_id) VALUES (?,?,?,?)').run(
    customerId, customer.stage, toStage, userId
  );
  logActivity(
    customerId,
    userId,
    'stage_change',
    note || `Stage: ${STAGE_LABELS[customer.stage] || customer.stage} → ${STAGE_LABELS[toStage]}`
  );
  return toStage;
}

module.exports = { STAGES, STAGE_LABELS, ACTIVE_PIPELINE_STAGES, setStage, logActivity };
