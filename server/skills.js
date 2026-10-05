/** Same list as Settings staff skills (requirement 1.8 / 7.2). */
const SKILL_OPTIONS = [
  'roofer',
  'labourer',
  'slate',
  'flat_roof',
  'felt',
  'lead_work',
  'guttering',
  'chimney',
];

const ALLOWED = new Set(SKILL_OPTIONS);

function normaliseJobSkills(list) {
  return [...new Set((Array.isArray(list) ? list : []).filter((s) => ALLOWED.has(s)))];
}

module.exports = { SKILL_OPTIONS, normaliseJobSkills };
