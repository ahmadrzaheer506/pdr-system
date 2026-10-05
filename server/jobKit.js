/**
 * Structured materials + per-job checklists (requirement 7.3).
 * Not stock/inventory: qty is what the job needs; status is needed / packed / used.
 */
const { Job, JobMaterialLine, JobChecklistItem } = require('./models');
const { plain } = require('./db');
const { findStoredTemplate, publicTemplates, listTemplates } = require('./jobChecklists');

const MATERIAL_STATUSES = Object.freeze(['needed', 'packed', 'used']);
const DESC_MAX = 500;
const UNIT_MAX = 20;

function mapLine(row) {
  const o = plain(row);
  return {
    id: o.id,
    job_id: o.job_id,
    description: o.description,
    qty: o.qty,
    unit: o.unit || '',
    status: o.status,
    sort_order: o.sort_order,
  };
}

function mapItem(row) {
  const o = plain(row);
  return {
    id: o.id,
    job_id: o.job_id,
    body: o.body,
    done: !!o.done,
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
 * @returns {{ qty: number }|{ error: string, status: number }}
 */
function parseQty(raw) {
  if (raw === undefined || raw === null || raw === '') return { qty: 1 };
  const qty = Number(raw);
  if (!Number.isFinite(qty) || qty <= 0) return { error: 'Quantity must be greater than 0', status: 400 };
  return { qty };
}

/**
 * @param {unknown} raw
 * @returns {{ status: string }|{ error: string, status: number }}
 */
function parseMaterialStatus(raw) {
  const status = String(raw || '').trim();
  if (!MATERIAL_STATUSES.includes(status)) {
    return { error: 'Status must be needed, packed, or used', status: 400 };
  }
  return { status };
}

async function nextOrder(Model, jobId) {
  const last = await Model.max('sort_order', { where: { job_id: jobId } });
  return (Number.isFinite(last) ? last : -1) + 1;
}

async function listMaterials(jobId) {
  const rows = await JobMaterialLine.findAll({
    where: { job_id: jobId },
    order: [['sort_order', 'ASC'], ['id', 'ASC']],
  });
  return rows.map(mapLine);
}

async function listChecklist(jobId) {
  const rows = await JobChecklistItem.findAll({
    where: { job_id: jobId },
    order: [['sort_order', 'ASC'], ['id', 'ASC']],
  });
  return rows.map(mapItem);
}

/**
 * Attach kit fields onto a job JSON payload.
 * @param {Record<string, unknown>} jobJson
 */
async function attachJobKit(jobJson) {
  const [material_lines, checklist_items] = await Promise.all([
    listMaterials(jobJson.id),
    listChecklist(jobJson.id),
  ]);
  return { ...jobJson, material_lines, checklist_items };
}

async function addMaterial(jobId, body) {
  const description = trimText(body?.description, DESC_MAX);
  if (!description) return { error: 'Description is required', status: 400 };
  const parsedQty = parseQty(body?.qty);
  if (parsedQty.error) return parsedQty;
  const unit = trimText(body?.unit, UNIT_MAX) || null;
  const created = await JobMaterialLine.create({
    job_id: jobId,
    description,
    qty: parsedQty.qty,
    unit,
    status: 'needed',
    sort_order: await nextOrder(JobMaterialLine, jobId),
  });
  return { line: mapLine(created) };
}

async function updateMaterial(jobId, lineId, body) {
  const row = await JobMaterialLine.findOne({ where: { id: lineId, job_id: jobId } });
  if (!row) return { error: 'Materials line not found', status: 404 };
  const updates = {};
  if (body?.description !== undefined) {
    const description = trimText(body.description, DESC_MAX);
    if (!description) return { error: 'Description is required', status: 400 };
    updates.description = description;
  }
  if (body?.qty !== undefined) {
    const parsedQty = parseQty(body.qty);
    if (parsedQty.error) return parsedQty;
    updates.qty = parsedQty.qty;
  }
  if (body?.unit !== undefined) updates.unit = trimText(body.unit, UNIT_MAX) || null;
  if (body?.status !== undefined) {
    const parsed = parseMaterialStatus(body.status);
    if (parsed.error) return parsed;
    updates.status = parsed.status;
  }
  if (Object.keys(updates).length) await row.update(updates);
  return { line: mapLine(row) };
}

async function removeMaterial(jobId, lineId) {
  const row = await JobMaterialLine.findOne({ where: { id: lineId, job_id: jobId } });
  if (!row) return { error: 'Materials line not found', status: 404 };
  await row.destroy();
  return { ok: true };
}

async function addChecklistItem(jobId, body) {
  const text = trimText(body?.body, DESC_MAX);
  if (!text) return { error: 'Checklist item is required', status: 400 };
  const created = await JobChecklistItem.create({
    job_id: jobId,
    body: text,
    done: false,
    sort_order: await nextOrder(JobChecklistItem, jobId),
  });
  return { item: mapItem(created) };
}

async function updateChecklistItem(jobId, itemId, body) {
  const row = await JobChecklistItem.findOne({ where: { id: itemId, job_id: jobId } });
  if (!row) return { error: 'Checklist item not found', status: 404 };
  const updates = {};
  if (body?.body !== undefined) {
    const text = trimText(body.body, DESC_MAX);
    if (!text) return { error: 'Checklist item is required', status: 400 };
    updates.body = text;
  }
  if (body?.done !== undefined) updates.done = !!body.done;
  if (Object.keys(updates).length) await row.update(updates);
  return { item: mapItem(row) };
}

async function removeChecklistItem(jobId, itemId) {
  const row = await JobChecklistItem.findOne({ where: { id: itemId, job_id: jobId } });
  if (!row) return { error: 'Checklist item not found', status: 404 };
  await row.destroy();
  return { ok: true };
}

/**
 * Copy a Settings checklist template onto the job, replacing any existing items.
 * @param {number} jobId
 * @param {unknown} templateId
 */
async function applyChecklistTemplate(jobId, templateId) {
  const template = await findStoredTemplate(templateId);
  if (!template) return { error: 'Unknown checklist template', status: 400 };
  const jb = await Job.findByPk(jobId);
  if (!jb) return { error: 'Job not found', status: 404 };
  await JobChecklistItem.destroy({ where: { job_id: jobId } });
  await JobChecklistItem.bulkCreate(template.items.map((body, i) => ({
    job_id: jobId,
    body,
    done: false,
    sort_order: i,
  })));
  await jb.update({ checklist_template: template.id });
  return {
    checklist_template: template.id,
    checklist_items: await listChecklist(jobId),
  };
}

function sendKitResult(res, result) {
  if (result.error) return res.status(result.status || 400).json({ error: result.error });
  return res.json(result);
}

module.exports = {
  MATERIAL_STATUSES,
  publicTemplates,
  listTemplates,
  sendKitResult,
  attachJobKit,
  listMaterials,
  listChecklist,
  addMaterial,
  updateMaterial,
  removeMaterial,
  addChecklistItem,
  updateChecklistItem,
  removeChecklistItem,
  applyChecklistTemplate,
};
