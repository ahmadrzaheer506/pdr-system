/**
 * Dated internal notes on the customer record (requirement 2.4).
 * These are office-only, never WhatsApp/email, and not enquiry messages.
 */
const { CustomerNote, User } = require('./models');
const { plain } = require('./db');

function mapNote(row) {
  const o = plain(row);
  o.user_name = o.User?.name || null;
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
 * @param {number} userId
 * @param {unknown} body
 */
async function addNote(customerId, userId, body) {
  const text = String(body || '').trim();
  if (!text) return { error: 'Note is required', status: 400 };
  const created = await CustomerNote.create({
    customer_id: customerId,
    body: text,
    user_id: userId || null,
  });
  const row = await CustomerNote.findByPk(created.id, {
    include: [{ model: User, attributes: ['name'] }],
  });
  return { note: mapNote(row) };
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

module.exports = { listNotes, addNote, removeNote };
