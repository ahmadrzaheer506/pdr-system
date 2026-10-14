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

const LEVEL_LABELS = Object.fromEntries(SKILL_LEVELS.map((l) => [l.id, l.label]));

export function parseLevel(value, fallback = 'competent') {
  const key = String(value || '').toLowerCase().trim();
  return LEVEL_RANK[key] ? key : fallback;
}

export function requirementId(required) {
  if (required == null) return null;
  if (typeof required === 'string' || typeof required === 'number') return required;
  return required.skill_id ?? required.id ?? required.slug ?? null;
}

export function requirementLevel(required) {
  if (required && typeof required === 'object') return parseLevel(required.level);
  return 'competent';
}

export function staffLevelFor(staffSkills, skillId) {
  if (skillId == null) return null;
  for (const item of Array.isArray(staffSkills) ? staffSkills : []) {
    if (typeof item === 'string' || typeof item === 'number') {
      if (String(item) === String(skillId)) return 'competent';
      continue;
    }
    const id = item?.skill_id ?? item?.id ?? item?.slug;
    if (String(id) === String(skillId)) return parseLevel(item.level);
  }
  return null;
}

export function staffCoversRequirement(staffSkills, required) {
  const id = requirementId(required);
  if (id == null) return false;
  const have = staffLevelFor(staffSkills, id);
  if (!have) return false;
  return LEVEL_RANK[have] >= LEVEL_RANK[requirementLevel(required)];
}

/** True when the person covers at least one of the job's required skills at the needed level. */
export function staffMatchesRequiredSkills(staffSkills, required) {
  const needed = Array.isArray(required) ? required : [];
  if (!needed.length) return false;
  return needed.some((skill) => staffCoversRequirement(staffSkills, skill));
}

export function staffCoverageScore(staffSkills, required) {
  const needed = Array.isArray(required) ? required : [];
  if (!needed.length) return 0;
  return needed.filter((skill) => staffCoversRequirement(staffSkills, skill)).length;
}

export function sortStaffForJob(staff, required) {
  const needed = Array.isArray(required) ? required : [];
  return [...(staff || [])].sort((a, b) => {
    const sa = staffCoverageScore(a.skills, needed);
    const sb = staffCoverageScore(b.skills, needed);
    if (sb !== sa) return sb - sa;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

/** Required skills not held (at the needed level) by anyone in selectedIds. */
export function missingRequiredSkills(staff, selectedIds, required) {
  const needed = Array.isArray(required) ? required : [];
  if (!needed.length) return [];
  const selected = new Set(selectedIds || []);
  const crewSkills = [];
  for (const person of staff || []) {
    if (!selected.has(person.id) && !selected.has(person.user_id)) continue;
    const list = Array.isArray(person.skills) ? person.skills : [];
    crewSkills.push(...list);
  }
  return needed.filter((skill) => !staffCoversRequirement(crewSkills, skill));
}

export function crewHasDriver(staff, selectedIds) {
  const selected = new Set(selectedIds || []);
  return (staff || []).some((person) => (
    (selected.has(person.id) || selected.has(person.user_id)) && person.is_driver
  ));
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
    return `${name} — ${level}`;
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
