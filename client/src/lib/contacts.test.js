import { describe, it, expect } from 'vitest';
import { formatSite, primaryOf, soleContactId, contactsFromSingleOptions, PHONE_TYPES, EMAIL_TYPES } from './contacts';

describe('contact display helpers (requirement 2.2)', () => {
  it('formats a site as address + postcode', () => {
    expect(formatSite({ address: '14 Elm Grove', postcode: 'RG1 5AB' })).toBe('14 Elm Grove, RG1 5AB');
    expect(formatSite(null)).toBe('');
  });

  it('auto-selects a contact only when there is exactly one', () => {
    expect(soleContactId([{ id: 4 }])).toBe(4);
    expect(soleContactId([{ id: 4 }, { id: 5 }])).toBe('');
    expect(contactsFromSingleOptions({
      sites: [{ id: 1 }],
      phones: [{ id: 2 }, { id: 3 }],
      emails: [{ id: 8 }],
    })).toEqual({ site_id: 1, phone_id: '', email_id: 8 });
  });

  it('picks the primary row, then the first row', () => {
    expect(primaryOf([
      { id: 1, is_primary: false },
      { id: 2, is_primary: true },
    ]).id).toBe(2);
    expect(primaryOf([{ id: 1, is_primary: false }]).id).toBe(1);
    expect(primaryOf([])).toBeNull();
  });

  it('exposes the stored phone and email types', () => {
    expect(PHONE_TYPES.map((t) => t.value)).toEqual(['mobile', 'landline', 'work']);
    expect(EMAIL_TYPES.map((t) => t.value)).toEqual(['personal', 'work']);
  });
});
