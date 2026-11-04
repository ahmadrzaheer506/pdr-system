/**
 * Dated internal notes on the customer record (requirement 2.4).
 * These are office-only, never WhatsApp/email, and not enquiry messages.
 * `source` marks typed memos vs task/visit remarks vs the customer's website form.
 */
const { CustomerNote, User, Lead, Job, Quote, Invoice } = require('./models');
const { plain } = require('./db');

const NOTE_SOURCES = ['general', 'task', 'visit', 'customer', 'clock'];

function normalizeSource(raw) {
  const source = String(raw || 'general').trim().toLowerCase();
  return NOTE_SOURCES.includes(source) ? source : 'general';
}

function parseLeadId(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

function mapNote(row) {
  const o = plain(row);
  o.user_name = o.User?.name || null;
  o.source = normalizeSource(o.source);
  o.lead_id = o.lead_id || null;
  delete o.User;
  return o;
}

/**
 * @param {number} customerId
 */
async function listNotes(customerId) {
  const rows = await CustomerNote.findAll({
    where: { customer_id: customerId },
    include: [{ model: User, attributes: ['name'] }],
    order: [['created_at', 'DESC'], ['id', 'DESC']],
  });
  return rows.map(mapNote);
}

/**
 * @param {number} customerId
 * @param {number|null} userId
 * @param {unknown} body
 * @param {{ source?: string, leadId?: unknown }} [extras]
 */
async function addNote(customerId, userId, body, extras = {}) {
  const text = String(body || '').trim();
  if (!text) return { error: 'Note is required', status: 400 };
  const created = await CustomerNote.create({
    customer_id: customerId,
    body: text,
    user_id: userId || null,
    source: normalizeSource(extras.source),
    lead_id: parseLeadId(extras.leadId),
  });
  const row = await CustomerNote.findByPk(created.id, {
    include: [{ model: User, attributes: ['name'] }],
  });
  return { note: mapNote(row) };
}

/**
 * Copy a remark onto internal notes without failing the parent action.
 */
async function copyRemark(customerId, userId, body, extras = {}) {
  const text = String(body || '').trim();
  if (!customerId || !text) return { skipped: true };
  try {
    return await addNote(customerId, userId, text, extras);
  } catch (err) {
    console.error('[notes] could not copy remark', err.message);
    return { error: err.message };
  }
}

/**
 * Resolve the customer (and enquiry) a task belongs to.
 */
async function customerContextForTask(task) {
  const type = task?.entity_type;
  const id = Number(task?.entity_id);
  if (!Number.isInteger(id) || id < 1) return {};
  if (type === 'lead') {
    const lead = await Lead.findByPk(id, { attributes: ['id', 'customer_id'] });
    if (!lead) return {};
    return { customerId: lead.customer_id, leadId: lead.id };
  }
  if (type === 'customer') return { customerId: id, leadId: parseLeadId(task.lead_id) };
  if (type === 'job') {
    const job = await Job.findByPk(id, { attributes: ['customer_id', 'lead_id'] });
    if (!job) return {};
    return { customerId: job.customer_id, leadId: job.lead_id };
  }
  if (type === 'quote') {
    const quote = await Quote.findByPk(id, { attributes: ['customer_id', 'lead_id'] });
    if (!quote) return {};
    return { customerId: quote.customer_id, leadId: quote.lead_id };
  }
  if (type === 'invoice') {
    const invoice = await Invoice.findByPk(id, { attributes: ['customer_id'] });
    if (!invoice) return {};
    return { customerId: invoice.customer_id, leadId: null };
  }
  return {};
}

async function copyTaskRemark(task, userId, body) {
  const ctx = await customerContextForTask(task);
  return copyRemark(ctx.customerId, userId, body, { source: 'task', leadId: ctx.leadId });
}

/**
 * Copy clock-out handover notes and the site photo onto the job's customer/lead.
 * Yard/travel shifts (no job) are skipped. Failures never block clock-out.
 */
async function copyClockOutHandover(userId, shift, extras = {}) {
  const jobId = Number(shift?.job_id);
  if (!Number.isInteger(jobId) || jobId < 1) return { skipped: true };
  try {
    const job = await Job.findByPk(jobId, { attributes: ['customer_id', 'lead_id'] });
    if (!job?.customer_id) return { skipped: true };
    const tagged = { source: 'clock', leadId: job.lead_id };
    const note = await copyRemark(job.customer_id, userId, extras.notes, tagged);
    let file = { skipped: true };
    const buf = extras.photoBuffer;
    if (buf && Buffer.isBuffer(buf) && buf.length) {
      try {
        file = await require('./customerFiles').addFile(job.customer_id, userId, {
          buffer: buf,
          mimetype: extras.mime || 'image/jpeg',
          originalname: extras.originalName || 'Clock-out site photo.jpg',
          size: buf.length,
        }, tagged);
      } catch (err) {
        console.error('[notes] could not copy clock-out photo', err.message);
        file = { error: err.message };
      }
    }
    return { note, file };
  } catch (err) {
    console.error('[notes] could not copy clock-out handover', err.message);
    return { error: err.message };
  }
}

/**
 * @param {number} customerId
 * @param {number} noteId
 */
async function removeNote(customerId, noteId) {
  const row = await CustomerNote.findOne({ where: { id: noteId, customer_id: customerId } });
  if (!row) return { error: 'Note not found', status: 404 };
  await row.destroy();
  return { ok: true };
}

module.exports = {
  NOTE_SOURCES,
  listNotes,
  addNote,
  copyRemark,
  copyTaskRemark,
  copyClockOutHandover,
  customerContextForTask,
  removeNote,
};
