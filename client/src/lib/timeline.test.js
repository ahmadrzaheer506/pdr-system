import { describe, it, expect } from 'vitest';
import { TIMELINE_TYPES, TIMELINE_LABELS } from './timeline';

describe('timeline labels (requirement 2.3)', () => {
  it('lists the six required timeline types', () => {
    expect(TIMELINE_TYPES).toEqual(['message', 'call', 'note', 'quote', 'job', 'invoice']);
    for (const type of TIMELINE_TYPES) {
      expect(TIMELINE_LABELS[type]).toBeTruthy();
    }
  });
});
