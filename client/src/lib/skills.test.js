import { describe, it, expect } from 'vitest';
import { SKILL_OPTIONS, skillLabel, staffMatchesRequiredSkills, missingRequiredSkills, crewHasDriver } from './skills';

describe('staffMatchesRequiredSkills (requirement 7.2)', () => {
  it('is the same list as Settings staff skills', () => {
    expect(SKILL_OPTIONS).toEqual([
      'roofer', 'labourer', 'slate', 'flat_roof', 'felt', 'lead_work', 'guttering', 'chimney',
    ]);
  });

  it('capitalises skill keys for display', () => {
    expect(skillLabel('roofer')).toBe('Roofer');
    expect(skillLabel('flat_roof')).toBe('Flat Roof');
    expect(skillLabel('lead_work')).toBe('Lead Work');
  });

  it('matches when the person has at least one required skill', () => {
    expect(staffMatchesRequiredSkills(['roofer', 'slate'], ['slate'])).toBe(true);
    expect(staffMatchesRequiredSkills(['labourer'], ['slate'])).toBe(false);
    expect(staffMatchesRequiredSkills(['roofer'], [])).toBe(false);
  });

  it('lists required skills the selected crew does not cover (requirement 8.3)', () => {
    const staff = [
      { id: 3, skills: ['labourer'], is_driver: false },
      { id: 4, skills: ['slate'], is_driver: true },
    ];
    expect(missingRequiredSkills(staff, [3], ['slate', 'roofer'])).toEqual(['slate', 'roofer']);
    expect(missingRequiredSkills(staff, [3, 4], ['slate'])).toEqual([]);
    expect(crewHasDriver(staff, [3])).toBe(false);
    expect(crewHasDriver(staff, [4])).toBe(true);
  });
});
