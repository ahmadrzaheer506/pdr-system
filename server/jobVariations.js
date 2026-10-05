/**
 * Office-only job variations (requirement 7.5).
 * Description + amount. Hidden from staff. Does not change jobs.value.
 * Invoice-from-job appends these as extra lines (requirement 11.1).
 */
const { JobVariation } = require('./models');
const { plain } = require('./db');

const DESC_MAX = 500;

function mapLine(row) {
  const o = plain(row);
  return {
    id: o.id,
    job_id: o.job_id,
    description: o.description,
    amount: o.amount,
    sort_order: o.sort_order,
  };
}

function trimText(value, max) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.slice(0, max);
}

/**
 * @param {unknown} raw
 * @returns {{ amount: number }|{ error: string, status: number }}
 */
function parseAmount(raw) {
  if (raw === undefined || raw === null || raw === '') {
    return { error: 'Amount is required', status: 400 };
  }
  const amount = Number(raw);
  if (!Number.isFinite(amount)) return { error: 'Amount must be a number', status: 400 };
  return { amount };
}

async function nextOrder(jobId) {
  const last = await JobVariation.max('sort_order', { where: { job_id: jobId } });
  return (Number.isFinite(last) ? last : -1) + 1;
}

async function listVariations(jobId) {
  const rows = await JobVariation.findAll({
    where: { job_id: jobId },
    order: [['sort_order', 'ASC'], ['id', 'ASC']],
  });
  return rows.map(mapLine);
}

/**
 * Attach variation lines onto an office job JSON payload.
 * @param {Record<string, unknown>} jobJson
 */
async function attachJobVariations(jobJson) {
  return { ...jobJson, variations: await listVariations(jobJson.id) };
}

async function addVariation(jobId, body) {
  const description = trimText(body?.description, DESC_MAX);
  if (!description) return { error: 'Description is required', status: 400 };
  const parsed = parseAmount(body?.amount);
  if (parsed.error) return parsed;
  const created = await JobVariation.create({
    job_id: jobId,
    description,
    amount: parsed.amount,
    sort_order: await nextOrder(jobId),
  });
  return { line: mapLine(created) };
}

async function updateVariation(jobId, lineId, body) {
  const row = await JobVariation.findOne({ where: { id: lineId, job_id: jobId } });
  if (!row) return { error: 'Variation not found', status: 404 };
  const updates = {};
  if (body?.description !== undefined) {
    const description = trimText(body.description, DESC_MAX);
    if (!description) return { error: 'Description is required', status: 400 };
    updates.description = description;
  }
  if (body?.amount !== undefined) {
    const parsed = parseAmount(body.amount);
    if (parsed.error) return parsed;
    updates.amount = parsed.amount;
  }
  if (Object.keys(updates).length) await row.update(updates);
  return { line: mapLine(row) };
}

async function removeVariation(jobId, lineId) {
  const row = await JobVariation.findOne({ where: { id: lineId, job_id: jobId } });
  if (!row) return { error: 'Variation not found', status: 404 };
  await row.destroy();
  return { ok: true };
}

function sendResult(res, result) {
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  return res.json(result);
}

module.exports = {
  parseAmount,
  listVariations,
  attachJobVariations,
  addVariation,
  updateVariation,
  removeVariation,
  sendResult,
};
