import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SKILLS,
  skillLabel,
  staffMatchesRequiredSkills,
  missingRequiredSkills,
  crewHasDriver,
  staffCoversRequirement,
  toggleStaffSkill,
  setStaffSkillLevel,
  sortStaffForJob,
} from './skills';

const CATALOGUE = DEFAULT_SKILLS.map((s, i) => ({ id: i + 1, ...s }));
const roofing = CATALOGUE.find((s) => s.slug === 'roofing').id;
const lead = CATALOGUE.find((s) => s.slug === 'lead_work').id;
const labour = CATALOGUE.find((s) => s.slug === 'general_labouring').id;

describe('staff skill matching (requirement 7.2 / 8.3)', () => {
  it('ships the Settings catalogue names', () => {
    expect(DEFAULT_SKILLS.map((s) => s.name)).toContain('Roofing');
    expect(DEFAULT_SKILLS.map((s) => s.name)).toContain('Digger Driving & Plant');
  });

  it('labels a requirement with its level', () => {
    expect(skillLabel({ skill_id: roofing, level: 'advanced' }, CATALOGUE)).toBe('Roofing — Advanced');
  });

  it('matches when the person meets the required level or higher', () => {
    expect(staffCoversRequirement(
      [{ skill_id: roofing, level: 'advanced' }],
      { skill_id: roofing, level: 'competent' },
    )).toBe(true);
    expect(staffMatchesRequiredSkills(
      [{ skill_id: roofing, level: 'trainee' }],
      [{ skill_id: roofing, level: 'competent' }],
    )).toBe(false);
  });

  it('lists required skills the selected crew does not cover', () => {
    const staff = [
      { id: 3, skills: [{ skill_id: labour, level: 'competent' }], is_driver: false },
      { id: 4, skills: [{ skill_id: roofing, level: 'advanced' }], is_driver: true },
    ];
    expect(missingRequiredSkills(staff, [3], [
      { skill_id: roofing, level: 'advanced' },
      { skill_id: lead, level: 'competent' },
    ])).toHaveLength(2);
    expect(missingRequiredSkills(staff, [3, 4], [{ skill_id: roofing, level: 'advanced' }])).toEqual([]);
    expect(crewHasDriver(staff, [3])).toBe(false);
    expect(crewHasDriver(staff, [4])).toBe(true);
  });

  it('toggles a staff skill and sets the level', () => {
    const once = toggleStaffSkill([], roofing, 'competent');
    expect(once).toEqual([{ skill_id: roofing, level: 'competent' }]);
    expect(setStaffSkillLevel(once, roofing, 'advanced')).toEqual([{ skill_id: roofing, level: 'advanced' }]);
    expect(toggleStaffSkill(once, roofing)).toEqual([]);
  });

  it('sorts recommended crew by how many required skills they cover', () => {
    const staff = [
      { id: 2, name: 'Liam', skills: [{ skill_id: labour, level: 'competent' }] },
      { id: 1, name: 'Jamie', skills: [{ skill_id: roofing, level: 'advanced' }] },
    ];
    const ranked = sortStaffForJob(staff, [{ skill_id: roofing, level: 'advanced' }]);
    expect(ranked.map((p) => p.name)).toEqual(['Jamie', 'Liam']);
  });
});
