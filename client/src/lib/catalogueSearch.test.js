import { describe, expect, it } from 'vitest';
import { catalogueHint, matchCatalogueItems } from './catalogueSearch';

const ROWS = [
  { id: 'felt', description: 'Supply & fit 3-layer torch-on felt system', unit: 'm²', unit_price: 42 },
  { id: 'ridge', description: 'Dry-fix ridge and hip', unit: 'lin m', unit_price: 38 },
  { id: 'grp', description: 'GRP fibreglass overlay', unit: 'm²', unit_price: 58 },
];

describe('matchCatalogueItems', () => {
  it('returns the catalogue when the query is empty', () => {
    expect(matchCatalogueItems(ROWS, '')).toHaveLength(3);
  });

  it('filters by description without requiring an exact match', () => {
    expect(matchCatalogueItems(ROWS, 'ridge').map((r) => r.id)).toEqual(['ridge']);
  });

  it('is case-insensitive', () => {
    expect(matchCatalogueItems(ROWS, 'GRP').map((r) => r.id)).toEqual(['grp']);
  });

  it('returns nothing when no row matches so the typed name can be kept', () => {
    expect(matchCatalogueItems(ROWS, 'flashing')).toEqual([]);
  });
});

describe('catalogueHint', () => {
  it('shows price and unit', () => {
    expect(catalogueHint(ROWS[0])).toBe('£42.00 / m²');
  });
});
