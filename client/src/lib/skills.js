/** Same list as Settings staff skills (requirement 1.8 / 7.2). */
export const SKILL_OPTIONS = [
  'roofer',
  'labourer',
  'slate',
  'flat_roof',
  'felt',
  'lead_work',
  'guttering',
  'chimney',
];

/** Display label for a stored skill key (flat_roof → Flat Roof). */
export function skillLabel(skill) {
  return String(skill || '')
    .replace(/_/g, ' ')
    .replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
}

/** True when the person has at least one of the job's required skills. */
export function staffMatchesRequiredSkills(staffSkills, required) {
  const needed = Array.isArray(required) ? required : [];
  if (!needed.length) return false;
  const have = new Set(Array.isArray(staffSkills) ? staffSkills : []);
  return needed.some((skill) => have.has(skill));
}

/** Required skills not held by anyone in selectedIds. */
export function missingRequiredSkills(staff, selectedIds, required) {
  const needed = Array.isArray(required) ? required : [];
  if (!needed.length) return [];
  const selected = new Set(selectedIds || []);
  const have = new Set();
  for (const person of staff || []) {
    if (!selected.has(person.id) && !selected.has(person.user_id)) continue;
    const list = Array.isArray(person.skills) ? person.skills : [];
    for (const skill of list) have.add(skill);
  }
  return needed.filter((skill) => !have.has(skill));
}

export function crewHasDriver(staff, selectedIds) {
  const selected = new Set(selectedIds || []);
  return (staff || []).some((person) => (
    (selected.has(person.id) || selected.has(person.user_id)) && person.is_driver
  ));
}
