/**
 * Settings message templates and extra named bodies (requirement 17.2).
 * Core keys drive quote/invoice send. Extra `{ key, body }` pairs are for
 * pickers elsewhere (customer conversation composer).
 */
const MAX_BODY = 4000;
const MAX_KEY = 40;

const CORE_TEMPLATE_FIELDS = Object.freeze([
  { key: 'quote_sent_whatsapp', label: 'Quote sent (WhatsApp)' },
  { key: 'quote_email_subject', label: 'Quote email subject' },
  { key: 'quote_email_body', label: 'Quote email body' },
  { key: 'invoice_email_subject', label: 'Invoice email subject' },
  { key: 'invoice_email_body', label: 'Invoice email body' },
]);

const CORE_TEMPLATE_KEYS = Object.freeze(CORE_TEMPLATE_FIELDS.map((f) => f.key));

/** Old Templates follow-up keys. Follow-ups now live on Settings → Company (12.1). */
const RETIRED_TEMPLATE_KEYS = Object.freeze([
  'quote_followup_1',
  'quote_followup_2',
  'followup_email_subject',
]);

function stripRetiredTemplateKeys(templates) {
  if (!templates || typeof templates !== 'object' || Array.isArray(templates)) return templates;
  const next = { ...templates };
  for (const key of RETIRED_TEMPLATE_KEYS) delete next[key];
  return next;
}

function slugKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_|_$/g, '');
}

function parseCustomTemplates(raw) {
  if (!Array.isArray(raw)) return { error: 'Custom templates must be a list' };
  if (raw.length > 50) return { error: 'Too many custom templates' };
  const seen = new Set();
  const out = [];
  for (const row of raw) {
    const key = slugKey(row?.key);
    if (!key) return { error: 'Custom template key is required' };
    if (key.length > MAX_KEY) return { error: 'Custom template key is too long' };
    if (CORE_TEMPLATE_KEYS.includes(key) || RETIRED_TEMPLATE_KEYS.includes(key) || key === 'custom') {
      return { error: `Key "${key}" is reserved` };
    }
    if (seen.has(key)) return { error: `Duplicate custom template ${key}` };
    seen.add(key);
    const body = String(row?.body == null ? '' : row.body);
    if (!body.trim()) return { error: `Body is required for ${key}` };
    if (body.length > MAX_BODY) return { error: `Body is too long for ${key}` };
    out.push({ key, body });
  }
  return { value: out };
}

/**
 * @returns {{ value: object }|{ error: string }}
 */
function parseTemplates(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: 'Invalid templates' };
  }
  const next = stripRetiredTemplateKeys({ ...raw });
  for (const key of CORE_TEMPLATE_KEYS) {
    if (raw[key] !== undefined) {
      const text = String(raw[key]);
      if (text.length > MAX_BODY) return { error: `${key} is too long` };
      next[key] = text;
    }
  }
  if (raw.custom !== undefined) {
    const parsed = parseCustomTemplates(raw.custom);
    if (parsed.error) return parsed;
    next.custom = parsed.value;
  } else if (!Array.isArray(next.custom)) {
    next.custom = [];
  }
  return { value: next };
}

module.exports = {
  CORE_TEMPLATE_FIELDS,
  CORE_TEMPLATE_KEYS,
  RETIRED_TEMPLATE_KEYS,
  stripRetiredTemplateKeys,
  parseTemplates,
  parseCustomTemplates,
};
