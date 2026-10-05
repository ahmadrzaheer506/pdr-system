/**
 * Job checklist templates (requirement 7.3 / 17.2).
 * Four seeds ship by default. Settings can add, edit, and delete lists.
 * Applying a template copies items onto the job; existing job checklists stay as copied.
 */
const SEED_TEMPLATE_IDS = Object.freeze(['generic', 're_roof', 'felt', 'guttering']);
const MAX_TEMPLATES = 50;
const MAX_ID = 40;

const CHECKLIST_TEMPLATES = Object.freeze([
  {
    id: 'generic',
    label: 'Generic',
    items: Object.freeze([
      'Confirm site access and parking',
      'PPE on before work starts',
      'Take before photos',
      'Protect garden / driveway',
      'Tidy site and take waste',
      'Take after photos',
    ]),
  },
  {
    id: 're_roof',
    label: 'Re-roof',
    items: Object.freeze([
      'Strip existing covering',
      'Inspect and repair timber as needed',
      'Fit membrane and battens',
      'Lay tiles / slates',
      'Fit ridge, hip and verge',
      'Flashings and leadwork',
      'Clear waste and leave tidy',
    ]),
  },
  {
    id: 'felt',
    label: 'Felt / flat roof',
    items: Object.freeze([
      'Check and prep deck',
      'Prime as specified',
      'Fit covering (felt / EPDM)',
      'Dress details and outlets',
      'Fit edge trims',
      'Clear waste and leave tidy',
    ]),
  },
  {
    id: 'guttering',
    label: 'Guttering',
    items: Object.freeze([
      'Remove old guttering',
      'Fit brackets at centres',
      'Run new guttering',
      'Fit outlets and downpipes',
      'Water-test the run',
      'Clear waste and leave tidy',
    ]),
  },
]);

function publicTemplates() {
  return CHECKLIST_TEMPLATES.map((row) => ({
    id: row.id,
    label: row.label,
    items: [...row.items],
  }));
}

function findInList(id, list) {
  if (!id) return null;
  return (list || []).find((row) => row.id === String(id)) || null;
}

function findChecklistTemplate(id) {
  return findInList(id, CHECKLIST_TEMPLATES);
}

/**
 * Stored list from Settings, or the four seeded templates.
 * An empty array means every seed was deleted (requirement 17.2).
 */
async function listTemplates() {
  const { getSetting } = require('./db');
  const stored = await getSetting('checklist_templates');
  if (Array.isArray(stored)) {
    return stored.map((row) => ({
      id: row.id,
      label: row.label,
      items: Array.isArray(row.items) ? [...row.items] : [],
    }));
  }
  return publicTemplates();
}

async function findStoredTemplate(id) {
  return findInList(id, await listTemplates());
}

function parseChecklistId(raw) {
  const id = String(raw || '').trim().toLowerCase();
  if (!id) return { error: 'Checklist template id is required' };
  if (id.length > MAX_ID) return { error: 'Checklist template id is too long' };
  if (!/^[a-z0-9][a-z0-9_]{0,39}$/.test(id)) {
    return { error: 'Checklist template id must use letters, numbers, and underscores' };
  }
  return { value: id };
}

/**
 * ADMIN may add, edit, and omit templates. Ids are slugs; seeds may still be deleted.
 * @returns {{ value: object[] }|{ error: string }}
 */
function parseChecklistTemplates(raw) {
  if (!Array.isArray(raw)) return { error: 'Checklist templates must be a list' };
  if (raw.length > MAX_TEMPLATES) return { error: 'Too many checklist templates' };
  const seen = new Set();
  const out = [];
  for (const row of raw) {
    const parsedId = parseChecklistId(row?.id);
    if (parsedId.error) return parsedId;
    const id = parsedId.value;
    if (seen.has(id)) return { error: `Duplicate checklist template ${id}` };
    seen.add(id);
    const label = String(row?.label || '').trim();
    if (!label) return { error: `Label is required for ${id}` };
    if (label.length > 80) return { error: `Label is too long for ${id}` };
    if (!Array.isArray(row.items)) return { error: `${id} items must be a list` };
    const items = row.items.map((s) => String(s || '').trim()).filter(Boolean);
    if (!items.length) return { error: `${id} needs at least one item` };
    if (items.length > 40) return { error: `${id} has too many items` };
    if (items.some((s) => s.length > 200)) return { error: `${id} has an item that is too long` };
    out.push({ id, label, items });
  }
  return { value: out };
}

module.exports = {
  CHECKLIST_TEMPLATES,
  SEED_TEMPLATE_IDS,
  MAX_TEMPLATES,
  publicTemplates,
  findChecklistTemplate,
  findStoredTemplate,
  listTemplates,
  parseChecklistId,
  parseChecklistTemplates,
};
