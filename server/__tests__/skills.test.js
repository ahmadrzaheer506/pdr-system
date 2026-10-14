const {
  DEFAULT_SKILLS,
  parseStaffSkills,
  normaliseJobSkills,
  staffCoversRequirement,
  staffMatchesRequiredSkills,
  missingRequiredSkills,
  migrateLegacyList,
  requiredSkillLabel,
} = require('../skills');

const CATALOGUE = DEFAULT_SKILLS.map((s, i) => ({ id: i + 1, slug: s.slug, name: s.name }));

function id(slug) {
  return CATALOGUE.find((s) => s.slug === slug).id;
}

describe('skill catalogue and matching (requirement 1.8 / 7.2 / 8.3)', () => {
  test('default catalogue is the scheduling skill list', () => {
    expect(DEFAULT_SKILLS.map((s) => s.name)).toEqual([
      'Roofing', 'Flat Roofing', 'Lead Work', 'Guttering & Plastics', 'Brickwork & Masonry',
      'General Building', 'Joinery & Carpentry', 'Plastering', 'Groundworks', 'Plumbing',
      'Electrical', 'Kitchen Fitting', 'Tiling', 'Windows & Doors', 'General Labouring',
      'Trailer Towing', 'Digger Driving & Plant', 'Site Supervision',
    ]);
  });

  test('normaliseJobSkills keeps catalogue ids and levels and drops unknowns', () => {
    expect(normaliseJobSkills([
      { skill_id: id('roofing'), level: 'advanced' },
      { skill_id: 999, level: 'trainee' },
      'wizard',
    ], CATALOGUE)).toEqual([{ skill_id: id('roofing'), level: 'advanced' }]);
  });

  test('maps legacy string skills onto the new catalogue', () => {
    expect(parseStaffSkills(['roofer', 'slate', 'lead_work'], CATALOGUE)).toEqual([
      { skill_id: id('roofing'), level: 'competent' },
      { skill_id: id('lead_work'), level: 'competent' },
    ]);
  });

  test('Advanced covers Competent, Trainee does not', () => {
    const staff = [{ skill_id: id('roofing'), level: 'advanced' }];
    expect(staffCoversRequirement(staff, { skill_id: id('roofing'), level: 'competent' })).toBe(true);
    expect(staffCoversRequirement(staff, { skill_id: id('roofing'), level: 'advanced' })).toBe(true);
    expect(staffCoversRequirement([{ skill_id: id('roofing'), level: 'trainee' }], { skill_id: id('roofing'), level: 'competent' })).toBe(false);
  });

  test('staffMatchesRequiredSkills is true when any required skill is covered', () => {
    const staff = [{ skill_id: id('lead_work'), level: 'competent' }];
    expect(staffMatchesRequiredSkills(staff, [
      { skill_id: id('roofing'), level: 'advanced' },
      { skill_id: id('lead_work'), level: 'competent' },
    ])).toBe(true);
    expect(staffMatchesRequiredSkills(staff, [{ skill_id: id('roofing'), level: 'advanced' }])).toBe(false);
  });

  test('missingRequiredSkills lists uncovered job requirements', () => {
    const people = [
      { id: 3, skills: [{ skill_id: id('general_labouring'), level: 'competent' }] },
      { id: 4, skills: [{ skill_id: id('roofing'), level: 'advanced' }] },
    ];
    const needed = [
      { skill_id: id('roofing'), level: 'advanced' },
      { skill_id: id('lead_work'), level: 'competent' },
    ];
    expect(missingRequiredSkills(people, [3], needed)).toHaveLength(2);
    expect(missingRequiredSkills(people, [4], needed)).toEqual([needed[1]]);
    expect(missingRequiredSkills(people, [3, 4], [{ skill_id: id('roofing'), level: 'advanced' }])).toEqual([]);
  });

  test('migrateLegacyList maps old keys through slug ids', () => {
    const map = new Map(CATALOGUE.map((s) => [s.slug, s.id]));
    expect(migrateLegacyList(['roofer', 'guttering'], map)).toEqual([
      { skill_id: id('roofing'), level: 'competent' },
      { skill_id: id('guttering_plastics'), level: 'competent' },
    ]);
  });

  test('requiredSkillLabel includes the level', () => {
    expect(requiredSkillLabel({ skill_id: id('roofing'), level: 'advanced' }, CATALOGUE))
      .toBe('Roofing — Advanced');
  });
});
