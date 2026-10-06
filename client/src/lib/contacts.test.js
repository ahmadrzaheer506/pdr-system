import { describe, it, expect } from 'vitest';
import { formatSite, primaryOf, soleContactId, contactsFromSingleOptions, primaryContactIds, contactIdsFromLead, findContact, PHONE_TYPES, EMAIL_TYPES, emailFormatError } from './contacts';

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

  it('auto-selects the primary site, phone and email for a new enquiry', () => {
    expect(primaryContactIds({
      sites: [
        { id: 11, is_primary: true },
        { id: 12, is_primary: false },
      ],
      phones: [
        { id: 21, is_primary: false },
        { id: 22, is_primary: true },
      ],
      emails: [{ id: 31, is_primary: true }],
    })).toEqual({ site_id: 11, phone_id: 22, email_id: 31 });
  });

  it('reads one site, phone and email from the lead', () => {
    expect(contactIdsFromLead({ site_id: 6, phone_id: 2, email_id: 4 })).toEqual({
      site_id: 6, phone_id: 2, email_id: 4,
    });
    expect(findContact([{ id: 6, address: 'Garage' }], 6).address).toBe('Garage');
  });

  it('exposes the stored phone and email types', () => {
    expect(PHONE_TYPES.map((t) => t.value)).toEqual(['mobile', 'landline', 'work']);
    expect(EMAIL_TYPES.map((t) => t.value)).toEqual(['personal', 'work']);
  });

  it('requires @ and a domain when an email is entered', () => {
    expect(emailFormatError('')).toBe('');
    expect(emailFormatError('not-an-email')).toBe('Enter a valid email address');
    expect(emailFormatError('name@')).toBe('Enter a valid email address');
    expect(emailFormatError('dave@example.com')).toBe('');
  });
});
