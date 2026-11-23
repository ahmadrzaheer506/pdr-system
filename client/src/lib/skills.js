/** Staff / job skills with trainee / competent / advanced (requirement 1.8 / 7.2). */

export const SKILL_LEVELS = [
  { id: 'trainee', label: 'Trainee' },
  { id: 'competent', label: 'Competent' },
  { id: 'advanced', label: 'Advanced' },
];

export const LEVEL_RANK = { trainee: 1, competent: 2, advanced: 3 };

export const DEFAULT_SKILLS = [
  { slug: 'roofing', name: 'Roofing' },
  { slug: 'flat_roofing', name: 'Flat Roofing' },
  { slug: 'lead_work', name: 'Lead Work' },
  { slug: 'guttering_plastics', name: 'Guttering & Plastics' },
  { slug: 'brickwork_masonry', name: 'Brickwork & Masonry' },
  { slug: 'general_building', name: 'General Building' },
  { slug: 'joinery_carpentry', name: 'Joinery & Carpentry' },
  { slug: 'plastering', name: 'Plastering' },
  { slug: 'groundworks', name: 'Groundworks' },
  { slug: 'plumbing', name: 'Plumbing' },
  { slug: 'electrical', name: 'Electrical' },
  { slug: 'kitchen_fitting', name: 'Kitchen Fitting' },
  { slug: 'tiling', name: 'Tiling' },
  { slug: 'windows_doors', name: 'Windows & Doors' },
  { slug: 'general_labouring', name: 'General Labouring' },
  { slug: 'trailer_towing', name: 'Trailer Towing' },
  { slug: 'digger_plant', name: 'Digger Driving & Plant' },
  { slug: 'site_supervision', name: 'Site Supervision' },
];

/** @deprecated Use the Settings catalogue. Kept as fallback labels. */
export const SKILL_OPTIONS = DEFAULT_SKILLS.map((s) => s.slug);

const LEGACY_SKILL_SLUG = {
  roofer: 'roofing',
  labourer: 'general_labouring',
  slate: 'roofing',
  flat_roof: 'flat_roofing',
  felt: 'flat_roofing',
  lead_work: 'lead_work',
  guttering: 'guttering_plastics',
  chimney: 'roofing',
};

const LEVEL_LABELS = Object.fromEntries(SKILL_LEVELS.map((l) => [l.id, l.label]));
const RANK_TO_LEVEL = { 1: 'trainee', 2: 'competent', 3: 'advanced' };

let liveCatalogue = [];

export function rememberSkillCatalogue(rows) {
  if (Array.isArray(rows)) liveCatalogue = rows;
}

function catalogueOr(catalogue) {
  return Array.isArray(catalogue) && catalogue.length ? catalogue : liveCatalogue;
}

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60);
}

export function parseLevel(value, fallback = 'competent') {
  if (value && typeof value === 'object') {
    return parseLevel(value.id || value.level || value.name, fallback);
  }
  const key = String(value || '').toLowerCase().trim();
  if (LEVEL_RANK[key]) return key;
  if (RANK_TO_LEVEL[key]) return RANK_TO_LEVEL[key];
  return fallback;
}

function numericSkillId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function addSlugToken(tokens, raw) {
  const key = String(raw || '').toLowerCase().trim();
  if (!key || /^\d+$/.test(key)) return;
  tokens.add(key);
  if (LEGACY_SKILL_SLUG[key]) tokens.add(LEGACY_SKILL_SLUG[key]);
}

function stripLevelFromKey(key) {
  return String(key || '')
    .replace(/^(trainee|competent|advanced)_/, '')
    .replace(/_(trainee|competent|advanced)$/, '')
    .replace(/\b(trainee|competent|advanced)\b/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function impliedLevelFromText(text) {
  const t = String(text || '').toLowerCase();
  if (/\badvanced\b/.test(t)) return 'advanced';
  if (/\btrainee\b/.test(t)) return 'trainee';
  if (/\bcompetent\b/.test(t)) return 'competent';
  return null;
}

function skillTokens(raw, catalogue = []) {
  const tokens = new Set();
  const list = catalogueOr(catalogue);
  if (raw == null || raw === '') return tokens;
  if (typeof raw === 'string' || typeof raw === 'number') {
    const id = numericSkillId(raw);
    if (id) tokens.add(`#${id}`);
    addSlugToken(tokens, raw);
  } else {
    const id = numericSkillId(raw.skill_id ?? raw.id);
    if (id) tokens.add(`#${id}`);
    addSlugToken(tokens, raw.slug);
    addSlugToken(tokens, raw.skill);
    addSlugToken(tokens, slugify(raw.name));
  }
  const byId = new Map(list.map((row) => [Number(row.id), row]));
  const bySlug = new Map(list.filter((row) => row.slug).map((row) => [row.slug, row]));
  for (const token of [...tokens]) {
    if (token.startsWith('#')) {
      const row = byId.get(Number(token.slice(1)));
      if (row?.slug) addSlugToken(tokens, row.slug);
      if (row?.name) addSlugToken(tokens, slugify(row.name));
    } else {
      const row = bySlug.get(token);
      if (row?.id) tokens.add(`#${Number(row.id)}`);
      if (row?.slug) addSlugToken(tokens, row.slug);
    }
  }
  return tokens;
}

function skillFamilyKey(raw, catalogue = []) {
  const list = catalogueOr(catalogue);
  const tokens = skillTokens(raw, list);
  const row = list.find((s) => tokens.has(`#${Number(s.id)}`) || (s.slug && tokens.has(s.slug)));
  const nameKey = stripLevelFromKey(slugify(row?.name || (raw && typeof raw === 'object' ? raw.name : '') || ''));
  const slugKey = stripLevelFromKey([...tokens].find((t) => !t.startsWith('#')) || '');
  return LEGACY_SKILL_SLUG[nameKey] || nameKey || LEGACY_SKILL_SLUG[slugKey] || slugKey || '';
}

function entryLevel(item, catalogue = []) {
  const list = catalogueOr(catalogue);
  const field = typeof item === 'object' && item ? item.level : null;
  const row = list.find((s) => {
    const tokens = skillTokens(item, list);
    return tokens.has(`#${Number(s.id)}`) || (s.slug && tokens.has(s.slug));
  });
  const named = impliedLevelFromText([
    typeof item === 'string' ? item : '',
    item && typeof item === 'object' ? (item.name || item.slug || '') : '',
    row?.name,
    row?.slug,
  ].join(' '));
  const parsedField = field != null && field !== '' ? parseLevel(field, null) : null;
  const parsedNamed = named ? parseLevel(named, null) : null;
  if (parsedField && parsedNamed) {
    return LEVEL_RANK[parsedNamed] > LEVEL_RANK[parsedField] ? parsedNamed : parsedField;
  }
  return parsedField || parsedNamed || parseLevel(field);
}

export function requirementId(required) {
  if (required == null) return null;
  if (typeof required === 'string' || typeof required === 'number') return required;
  return required.skill_id ?? required.id ?? required.slug ?? null;
}

export function requirementLevel(required, catalogue = []) {
  if (required && typeof required === 'object') return entryLevel(required, catalogue);
  return entryLevel(required, catalogue) || 'competent';
}

export function staffLevelFor(staffSkills, skillId, catalogue = []) {
  if (skillId == null) return null;
  const list = catalogueOr(catalogue);
  const want = skillTokens(skillId, list);
  const wantFamily = skillFamilyKey(skillId, list);
  if (!want.size && !wantFamily) return null;
  let best = null;
  for (const item of Array.isArray(staffSkills) ? staffSkills : []) {
    const haveTokens = skillTokens(item, list);
    const sameSkill = [...want].some((token) => haveTokens.has(token));
    const haveFamily = skillFamilyKey(item, list);
    if (!sameSkill && !(wantFamily && haveFamily && wantFamily === haveFamily)) continue;
    const level = typeof item === 'string' || typeof item === 'number'
      ? (entryLevel(item, list) || 'competent')
      : entryLevel(item, list);
    if (!best || LEVEL_RANK[level] > LEVEL_RANK[best]) best = level;
  }
  return best;
}

/** True when the person holds this skill at the required level or higher. */
export function staffCoversRequirement(staffSkills, required, catalogue = []) {
  const list = catalogueOr(catalogue);
  if (requirementId(required) == null && skillFamilyKey(required, list) === '') return false;
  const have = staffLevelFor(staffSkills, required, list);
  if (!have) return false;
  return LEVEL_RANK[have] >= LEVEL_RANK[requirementLevel(required, list)];
}

/** True when the person covers at least one of the job's required skills at the needed level. */
export function staffMatchesRequiredSkills(staffSkills, required, catalogue = []) {
  const needed = Array.isArray(required) ? required : [];
  if (!needed.length) return false;
  return needed.some((skill) => staffCoversRequirement(staffSkills, skill, catalogue));
}

export function staffCoverageScore(staffSkills, required, catalogue = []) {
  const needed = Array.isArray(required) ? required : [];
  if (!needed.length) return 0;
  return needed.filter((skill) => staffCoversRequirement(staffSkills, skill, catalogue)).length;
}

export function sortStaffForJob(staff, required, catalogue = []) {
  const needed = Array.isArray(required) ? required : [];
  return [...(staff || [])].sort((a, b) => {
    const sa = staffCoverageScore(a.skills, needed, catalogue);
    const sb = staffCoverageScore(b.skills, needed, catalogue);
    if (sb !== sa) return sb - sa;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

function selectedUser(person, selected) {
  return selected.has(Number(person.id)) || selected.has(Number(person.user_id));
}

/** Required skills not held (at the needed level or higher) by anyone in selectedIds. */
export function missingRequiredSkills(staff, selectedIds, required, catalogue = []) {
  const needed = Array.isArray(required) ? required : [];
  if (!needed.length) return [];
  const selected = new Set((selectedIds || []).map((id) => Number(id)));
  const crewSkills = [];
  for (const person of staff || []) {
    if (!selectedUser(person, selected)) continue;
    const list = Array.isArray(person.skills) ? person.skills : [];
    crewSkills.push(...list);
  }
  return needed.filter((skill) => !staffCoversRequirement(crewSkills, skill, catalogue));
}

export function crewHasDriver(staff, selectedIds) {
  const selected = new Set((selectedIds || []).map((id) => Number(id)));
  return (staff || []).some((person) => selectedUser(person, selected) && person.is_driver);
}

function humanize(skill) {
  return String(skill || '')
    .replace(/_/g, ' ')
    .replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
}

export function skillName(req, catalogue = []) {
  if (req == null) return '';
  const list = Array.isArray(catalogue) ? catalogue : [];
  if (typeof req === 'string' || typeof req === 'number') {
    const row = list.find((s) => s.slug === req || Number(s.id) === Number(req));
    return row?.name || humanize(req);
  }
  const id = requirementId(req);
  const row = list.find((s) => Number(s.id) === Number(id) || s.slug === id);
  return row?.name || req.name || humanize(id);
}

export function skillLabel(req, catalogue = []) {
  const name = skillName(req, catalogue);
  if (req && typeof req === 'object' && req.level) {
    const level = LEVEL_LABELS[parseLevel(req.level)] || req.level;
    return `${name} - ${level}`;
  }
  return name;
}

export function staffSkillLine(staffSkills, catalogue = []) {
  const list = Array.isArray(staffSkills) ? staffSkills : [];
  if (!list.length) return '';
  return list.map((entry) => skillLabel(entry, catalogue)).join(', ');
}

export function toggleStaffSkill(list, skillId, level = 'competent') {
  const cur = Array.isArray(list) ? list : [];
  const id = Number(skillId);
  const has = cur.some((row) => Number(row.skill_id ?? row) === id);
  if (has) return cur.filter((row) => Number(row.skill_id ?? row) !== id);
  return [...cur, { skill_id: id, level: parseLevel(level) }];
}

export function setStaffSkillLevel(list, skillId, level) {
  const id = Number(skillId);
  const parsed = parseLevel(level);
  const cur = Array.isArray(list) ? list : [];
  if (!cur.some((row) => Number(row.skill_id ?? row) === id)) {
    return [...cur, { skill_id: id, level: parsed }];
  }
  return cur.map((row) => (Number(row.skill_id ?? row) === id ? { skill_id: id, level: parsed } : row));
}

export function skillSelected(list, skillId) {
  const id = Number(skillId);
  return (Array.isArray(list) ? list : []).some((row) => Number(row.skill_id ?? row) === id);
}

export function selectedLevel(list, skillId) {
  const id = Number(skillId);
  const row = (Array.isArray(list) ? list : []).find((item) => Number(item.skill_id ?? item) === id);
  if (!row || typeof row === 'string' || typeof row === 'number') return 'competent';
  return parseLevel(row.level);
}
