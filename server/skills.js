'use strict';

/**
 * Staff / job skills (requirement 1.8 / 7.2 / 8.3).
 * Catalogue lives in Settings; staff hold selected skills with a level;
 * jobs require a minimum level; scheduling matches anyone at that level or above.
 */
const SKILL_LEVELS = Object.freeze(['trainee', 'competent', 'advanced']);
const LEVEL_RANK = Object.freeze({ trainee: 1, competent: 2, advanced: 3 });
const LEVEL_LABELS = Object.freeze({
  trainee: 'Trainee',
  competent: 'Competent',
  advanced: 'Advanced',
});

const DEFAULT_SKILLS = Object.freeze([
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
]);

const LEGACY_SKILL_SLUG = Object.freeze({
  roofer: 'roofing',
  labourer: 'general_labouring',
  slate: 'roofing',
  flat_roof: 'flat_roofing',
  felt: 'flat_roofing',
  lead_work: 'lead_work',
  guttering: 'guttering_plastics',
  chimney: 'roofing',
});

const DEFAULT_JOB_TYPES = Object.freeze([
  { name: 'Re-roof', skills: [{ slug: 'roofing', level: 'advanced' }] },
  { name: 'Lead valley', skills: [{ slug: 'lead_work', level: 'advanced' }] },
  { name: 'Extension', skills: [
    { slug: 'general_building', level: 'competent' },
    { slug: 'brickwork_masonry', level: 'competent' },
    { slug: 'joinery_carpentry', level: 'competent' },
  ] },
  { name: 'Flat roof', skills: [{ slug: 'flat_roofing', level: 'competent' }] },
  { name: 'Guttering', skills: [{ slug: 'guttering_plastics', level: 'competent' }] },
  { name: 'Windows & doors', skills: [{ slug: 'windows_doors', level: 'competent' }] },
  { name: 'Kitchen fitting', skills: [{ slug: 'kitchen_fitting', level: 'competent' }] },
  { name: 'Groundworks', skills: [{ slug: 'groundworks', level: 'competent' }] },
]);

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60);
}

function parseLevel(value, fallback = 'competent') {
  const key = String(value || '').toLowerCase().trim();
  return SKILL_LEVELS.includes(key) ? key : fallback;
}

function publicSkill(row) {
  if (!row) return null;
  const o = typeof row.toJSON === 'function' ? row.toJSON() : row;
  return {
    id: Number(o.id),
    slug: o.slug,
    name: o.name,
    sort_order: Number(o.sort_order) || 0,
  };
}

function publicJobType(row) {
  if (!row) return null;
  const o = typeof row.toJSON === 'function' ? row.toJSON() : row;
  return {
    id: Number(o.id),
    name: o.name,
    sort_order: Number(o.sort_order) || 0,
    required_skills: Array.isArray(o.required_skills) ? o.required_skills : [],
  };
}

function catalogueIndex(catalogue) {
  const byId = new Map();
  const bySlug = new Map();
  for (const row of catalogue || []) {
    const id = Number(row.id);
    if (Number.isInteger(id) && id > 0) byId.set(id, row);
    if (row.slug) bySlug.set(row.slug, row);
  }
  return { byId, bySlug };
}

function resolveSkillId(raw, catalogue) {
  const { byId, bySlug } = catalogueIndex(catalogue);
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object') {
    const id = Number(raw.skill_id ?? raw.id);
    if (Number.isInteger(id) && id > 0) {
      if (!byId.size || byId.has(id)) return id;
      return null;
    }
    const slug = LEGACY_SKILL_SLUG[raw.slug || raw.skill] || raw.slug || raw.skill;
    return bySlug.get(slug)?.id ? Number(bySlug.get(slug).id) : null;
  }
  if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) {
    return !byId.size || byId.has(raw) ? raw : null;
  }
  const key = String(raw);
  if (/^\d+$/.test(key)) {
    const id = Number(key);
    return !byId.size || byId.has(id) ? id : null;
  }
  const slug = LEGACY_SKILL_SLUG[key] || key;
  const found = bySlug.get(slug);
  return found?.id ? Number(found.id) : null;
}

function normaliseEntries(list, catalogue, { defaultLevel = 'competent' } = {}) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    const skillId = resolveSkillId(
      typeof raw === 'object' && raw ? raw : raw,
      catalogue,
    );
    if (!skillId || seen.has(skillId)) continue;
    const level = parseLevel(typeof raw === 'object' ? raw.level : defaultLevel, defaultLevel);
    seen.add(skillId);
    out.push({ skill_id: skillId, level });
  }
  return out;
}

function normaliseJobSkills(list, catalogue = []) {
  return normaliseEntries(list, catalogue);
}

function parseStaffSkills(list, catalogue = []) {
  return normaliseEntries(list, catalogue);
}

function staffLevelFor(staffSkills, skillId) {
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

function requirementId(required) {
  if (required == null) return null;
  if (typeof required === 'string' || typeof required === 'number') return required;
  return required.skill_id ?? required.id ?? required.slug ?? null;
}

function requirementLevel(required) {
  if (required && typeof required === 'object') return parseLevel(required.level);
  return 'competent';
}

function staffCoversRequirement(staffSkills, required) {
  const id = requirementId(required);
  if (id == null) return false;
  const have = staffLevelFor(staffSkills, id);
  if (!have) return false;
  return LEVEL_RANK[have] >= LEVEL_RANK[requirementLevel(required)];
}

function staffMatchesRequiredSkills(staffSkills, required) {
  const needed = Array.isArray(required) ? required : [];
  if (!needed.length) return false;
  return needed.some((req) => staffCoversRequirement(staffSkills, req));
}

function staffCoverageScore(staffSkills, required) {
  const needed = Array.isArray(required) ? required : [];
  if (!needed.length) return 0;
  return needed.filter((req) => staffCoversRequirement(staffSkills, req)).length;
}

function missingRequiredSkills(staff, selectedIds, required) {
  const needed = Array.isArray(required) ? required : [];
  if (!needed.length) return [];
  const selected = new Set((selectedIds || []).map((id) => Number(id)));
  const crewSkills = [];
  for (const person of staff || []) {
    const uid = person.id ?? person.user_id;
    if (!selected.has(Number(uid))) continue;
    const list = Array.isArray(person.skills) ? person.skills : [];
    crewSkills.push(...list);
  }
  return needed.filter((req) => !staffCoversRequirement(crewSkills, req));
}

function skillDisplayName(req, catalogue = []) {
  if (req == null) return '';
  if (typeof req === 'string') {
    const row = (catalogue || []).find((s) => s.slug === req || String(s.id) === req);
    if (row) return row.name;
    return req.replace(/_/g, ' ').replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
  }
  const id = requirementId(req);
  const row = (catalogue || []).find((s) => Number(s.id) === Number(id) || s.slug === id);
  return row?.name || req.name || `Skill ${id}`;
}

function requiredSkillLabel(req, catalogue = []) {
  const name = skillDisplayName(req, catalogue);
  if (typeof req === 'string' || typeof req === 'number') return name;
  const level = LEVEL_LABELS[requirementLevel(req)];
  return level ? `${name} — ${level}` : name;
}

function staffSkillLabel(entry, catalogue = []) {
  return requiredSkillLabel(entry, catalogue);
}

async function listSkillRows() {
  const { Skill } = require('./models');
  const rows = await Skill.findAll({ order: [['sort_order', 'ASC'], ['name', 'ASC'], ['id', 'ASC']] });
  return rows.map(publicSkill);
}

async function listJobTypeRows() {
  const { JobType } = require('./models');
  const rows = await JobType.findAll({ order: [['sort_order', 'ASC'], ['name', 'ASC'], ['id', 'ASC']] });
  return rows.map(publicJobType);
}

async function uniqueSlug(base, excludeId) {
  const { Skill } = require('./models');
  const { Op } = require('sequelize');
  let slug = slugify(base) || 'skill';
  const original = slug;
  let n = 2;
  for (;;) {
    const where = excludeId
      ? { slug, id: { [Op.ne]: excludeId } }
      : { slug };
    const taken = await Skill.findOne({ where, attributes: ['id'] });
    if (!taken) return slug;
    slug = `${original}_${n}`;
    n += 1;
  }
}

function stripSkillFromList(list, skillId) {
  return (Array.isArray(list) ? list : []).filter((item) => {
    if (typeof item === 'string' || typeof item === 'number') return String(item) !== String(skillId);
    return Number(item?.skill_id ?? item?.id) !== Number(skillId);
  });
}

async function removeSkillFromRecords(skillId) {
  const { User, Job, JobType } = require('./models');
  const users = await User.findAll({ attributes: ['id', 'skills'] });
  for (const row of users) {
    const next = stripSkillFromList(row.skills, skillId);
    if (JSON.stringify(next) !== JSON.stringify(row.skills || [])) {
      await row.update({ skills: next });
    }
  }
  const jobs = await Job.findAll({ attributes: ['id', 'required_skills'] });
  for (const row of jobs) {
    const next = stripSkillFromList(row.required_skills, skillId);
    if (JSON.stringify(next) !== JSON.stringify(row.required_skills || [])) {
      await row.update({ required_skills: next });
    }
  }
  const types = await JobType.findAll({ attributes: ['id', 'required_skills'] });
  for (const row of types) {
    const next = stripSkillFromList(row.required_skills, skillId);
    if (JSON.stringify(next) !== JSON.stringify(row.required_skills || [])) {
      await row.update({ required_skills: next });
    }
  }
}

/** Map old string skill keys onto catalogue ids (data migration / seed). */
function migrateLegacyList(list, slugToId) {
  const map = slugToId instanceof Map ? slugToId : new Map(Object.entries(slugToId || {}));
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    if (raw && typeof raw === 'object' && raw.skill_id) {
      const id = Number(raw.skill_id);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({ skill_id: id, level: parseLevel(raw.level) });
      continue;
    }
    const key = String(raw || '');
    const slug = LEGACY_SKILL_SLUG[key] || key;
    const id = Number(map.get(slug));
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ skill_id: id, level: 'competent' });
  }
  return out;
}

module.exports = {
  SKILL_LEVELS,
  LEVEL_RANK,
  LEVEL_LABELS,
  DEFAULT_SKILLS,
  DEFAULT_JOB_TYPES,
  LEGACY_SKILL_SLUG,
  SKILL_OPTIONS: DEFAULT_SKILLS.map((s) => s.slug),
  slugify,
  parseLevel,
  publicSkill,
  publicJobType,
  normaliseJobSkills,
  parseStaffSkills,
  staffLevelFor,
  staffCoversRequirement,
  staffMatchesRequiredSkills,
  staffCoverageScore,
  missingRequiredSkills,
  skillDisplayName,
  requiredSkillLabel,
  staffSkillLabel,
  listSkillRows,
  listJobTypeRows,
  uniqueSlug,
  removeSkillFromRecords,
  migrateLegacyList,
};
