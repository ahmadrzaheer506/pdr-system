const { CHECKLIST_TEMPLATES, findChecklistTemplate, publicTemplates, parseChecklistTemplates } = require('../jobChecklists');

describe('checklist templates (requirement 7.3)', () => {
  test('seeds generic, re-roof, felt, and guttering', () => {
    expect(CHECKLIST_TEMPLATES.map((t) => t.id)).toEqual(['generic', 're_roof', 'felt', 'guttering']);
    expect(findChecklistTemplate('felt').items.length).toBeGreaterThan(0);
    expect(findChecklistTemplate('unknown')).toBeNull();
    expect(publicTemplates()[0]).toEqual(expect.objectContaining({ id: 'generic', label: 'Generic' }));
  });
});

describe('checklist template settings (requirement 17.2)', () => {
  test('allows omitting a seeded template', () => {
    const parsed = parseChecklistTemplates([
      { id: 'generic', label: 'Generic', items: ['PPE on'] },
    ]);
    expect(parsed.value).toEqual([{ id: 'generic', label: 'Generic', items: ['PPE on'] }]);
  });

  test('allows a new template id', () => {
    const parsed = parseChecklistTemplates([
      { id: 'chimney', label: 'Chimney', items: ['Scaffold check'] },
    ]);
    expect(parsed.value).toEqual([{ id: 'chimney', label: 'Chimney', items: ['Scaffold check'] }]);
  });

  test('rejects an invalid template id', () => {
    expect(parseChecklistTemplates([{ id: 'Not Valid!', label: 'New', items: ['A'] }]).error)
      .toMatch(/letters, numbers, and underscores/);
  });
});
