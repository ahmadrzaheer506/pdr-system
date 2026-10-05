/**
 * Pipeline board value + stall (requirement 4.5).
 * Value is the latest sent/draft quote per card, Enquiry → Follow-up only.
 * Stall uses updated_at; Lost and Paid are never stalled.
 */
export const VALUE_STAGES = Object.freeze([
  'ENQUIRY', 'SITE_VISIT_BOOKED', 'QUOTE_PENDING', 'QUOTED', 'FOLLOW_UP',
]);

export const STALL_EXCLUDED_STAGES = Object.freeze(['LOST', 'PAID']);
export const STALL_AMBER_DAYS = 7;
export const STALL_RED_DAYS = 14;

const MS_DAY = 86400000;

/**
 * @param {string|Date|null|undefined} updatedAt
 * @param {string} stage
 * @param {Date} [now]
 * @returns {'amber'|'red'|null}
 */
export function stallLevel(updatedAt, stage, now = new Date()) {
  if (!updatedAt || STALL_EXCLUDED_STAGES.includes(stage)) return null;
  const then = new Date(updatedAt);
  const ms = now.getTime() - then.getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const days = ms / MS_DAY;
  if (days >= STALL_RED_DAYS) return 'red';
  if (days >= STALL_AMBER_DAYS) return 'amber';
  return null;
}

/**
 * @param {Record<string, object[]>} board
 * @param {string[]} stages
 * @returns {{ board: number, byStage: Record<string, number|null> }}
 */
export function sumPipelineTotals(board, stages) {
  const valueSet = new Set(VALUE_STAGES);
  const byStage = {};
  let total = 0;
  for (const stage of stages || []) {
    const sum = (board[stage] || []).reduce((acc, row) => acc + Number(row.pipeline_value || 0), 0);
    if (valueSet.has(stage)) {
      byStage[stage] = sum;
      total += sum;
    } else {
      byStage[stage] = null;
    }
  }
  return { board: total, byStage };
}
