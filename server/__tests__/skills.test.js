const { SKILL_OPTIONS, normaliseJobSkills } = require('../skills');

describe('normaliseJobSkills (requirement 7.2)', () => {
  test('keeps the Settings staff skill list and drops unknown values', () => {
    expect(SKILL_OPTIONS).toEqual([
      'roofer', 'labourer', 'slate', 'flat_roof', 'felt', 'lead_work', 'guttering', 'chimney',
    ]);
    expect(normaliseJobSkills(['slate', 'wizard', 'slate'])).toEqual(['slate']);
    expect(normaliseJobSkills(undefined)).toEqual([]);
  });
});
