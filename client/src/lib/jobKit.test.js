import { describe, it, expect } from 'vitest';
import { materialsNoteVisible, materialQtyLabel } from './jobKit';

describe('materialsNoteVisible (requirement 7.3)', () => {
  it('shows the old text note only when the structured list is empty', () => {
    expect(materialsNoteVisible('16m UPVC', [])).toBe(true);
    expect(materialsNoteVisible('16m UPVC', [{ id: 1 }])).toBe(false);
    expect(materialsNoteVisible('', [])).toBe(false);
  });
});

describe('materialQtyLabel', () => {
  it('shows Qty under the name, with unit when present', () => {
    expect(materialQtyLabel({ qty: 2 })).toBe('Qty: 2');
    expect(materialQtyLabel({ qty: 20, unit: 'm²' })).toBe('Qty: 20 m²');
    expect(materialQtyLabel({ qty: '' })).toBeNull();
  });
});
