/**
 * Unified customer activity timeline (requirement 2.3).
 * Merges messages (as message / call / note) with quote, job, and invoice
 * activity rows into one chronological feed.
 */

/** Timeline types named in requirement 2.3. */
const TIMELINE_TYPES = Object.freeze(['message', 'call', 'note', 'quote', 'job', 'invoice']);

/** Map stored message channels to timeline types. */
const CHANNEL_TYPE = Object.freeze({
  phone: 'call',
  sms: 'call',
  note: 'note',
});

/**
 * @param {string} channel
 * @returns {'message'|'call'|'note'}
 */
function messageType(channel) {
  return CHANNEL_TYPE[channel] || 'message';
}

/**
 * Map an activity row to a timeline type, or null when out of 2.3 scope.
 * @param {{ kind?: string, entity_type?: string|null }} row
 * @returns {'quote'|'job'|'invoice'|null}
 */
function activityType(row) {
  const kind = row.kind || '';
  if (kind.startsWith('quote_')) return 'quote';
  if (kind.startsWith('job_')) return 'job';
  if (kind.startsWith('invoice_')) return 'invoice';
  if (row.entity_type === 'quote') return 'quote';
  if (row.entity_type === 'job') return 'job';
  if (row.entity_type === 'invoice') return 'invoice';
  return null;
}

/**
 * @param {Array<Record<string, unknown>>} messages plain message rows
 * @param {Array<Record<string, unknown>>} activities plain activity rows
 * @returns {Array<{ id: string, type: string, at: string, summary: string, user_name: string|null, entity_type: string|null, entity_id: number|null, meta: object }>}
 */
/**
 * Conversation feed excludes internal notes (requirement 2.4).
 * Notes live on customer_notes, not in the message composer.
 * @param {Array<Record<string, unknown>>} messages
 */
function conversationMessages(messages) {
  return (messages || []).filter((m) => m.channel !== 'note');
}

function buildCustomerTimeline(messages, activities) {
  const items = [];

  for (const m of messages || []) {
    items.push({
      id: `message-${m.id}`,
      type: messageType(m.channel),
      at: m.created_at,
      summary: m.body,
      user_name: m.user_name || null,
      entity_type: 'message',
      entity_id: m.id,
      meta: {
        channel: m.channel,
        direction: m.direction,
        status: m.status,
      },
    });
  }

  for (const a of activities || []) {
    const type = activityType(a);
    if (!type) continue;
    items.push({
      id: `activity-${a.id}`,
      type,
      at: a.created_at,
      summary: a.detail,
      user_name: a.user_name || null,
      entity_type: a.entity_type || null,
      entity_id: a.entity_id ?? null,
      meta: { kind: a.kind },
    });
  }

  items.sort((x, y) => new Date(x.at) - new Date(y.at));
  return items;
}

module.exports = {
  TIMELINE_TYPES,
  messageType,
  activityType,
  conversationMessages,
  buildCustomerTimeline,
};
