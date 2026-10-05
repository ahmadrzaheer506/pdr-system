const { CATALOGUE, findCatalogueItem, lineFromCatalogue } = require('../catalogue');

describe('service catalogue (requirement 6.1)', () => {
  test('is a fixed list with description, unit, price, VAT, and kind', () => {
    expect(CATALOGUE.length).toBeGreaterThan(0);
    for (const row of CATALOGUE) {
      expect(row).toEqual(expect.objectContaining({
        id: expect.any(String),
        description: expect.any(String),
        unit: expect.any(String),
        unit_price: expect.any(Number),
        vat_code: expect.stringMatching(/^(standard|reduced|zero|exempt)$/),
        kind: expect.stringMatching(/^(labour|materials|both)$/),
      }));
    }
  });

  test('copies catalogue fields onto a quote line with a simple quantity', () => {
    const felt = findCatalogueItem('felt_3layer');
    expect(lineFromCatalogue(felt, 18)).toEqual({
      catalogue_id: 'felt_3layer',
      description: 'Supply & fit 3-layer torch-on felt system',
      unit: 'm²',
      qty: 18,
      unit_price: 42,
      vat_code: 'standard',
      kind: 'materials',
    });
  });

  test('returns null for an unknown catalogue id', () => {
    expect(findCatalogueItem('not-a-thing')).toBeNull();
    expect(lineFromCatalogue(null)).toBeNull();
  });
});

describe('parseCatalogueItem (requirement 17.2)', () => {
  const { parseCatalogueItem } = require('../catalogue');

  test('accepts a valid row', () => {
    const parsed = parseCatalogueItem({
      id: 'Moss Removal!',
      description: 'Soft wash',
      unit: 'item',
      unit_price: 10,
      vat_code: 'standard',
      kind: 'labour',
    });
    expect(parsed.value).toEqual(expect.objectContaining({
      id: 'moss_removal',
      description: 'Soft wash',
      kind: 'labour',
    }));
  });

  test('rejects a negative price and an unknown kind', () => {
    expect(parseCatalogueItem({
      id: 'moss_x', description: 'A', unit: 'each', unit_price: -1, vat_code: 'standard', kind: 'labour',
    }).error).toMatch(/non-negative/);
    expect(parseCatalogueItem({
      id: 'xy', description: 'A', unit: 'each', unit_price: 1, vat_code: 'standard', kind: 'widget',
    }).error).toMatch(/labour, materials, or both/);
  });
});
