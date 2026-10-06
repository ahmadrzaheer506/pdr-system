jest.mock('../models', () => ({
  sequelize: { transaction: jest.fn(async (fn) => fn({})) },
  Customer: {},
  CustomerSite: {},
  CustomerPhone: {},
  CustomerEmail: {},
  Job: {},
  Appointment: {},
}));
jest.mock('../db', () => ({
  plain: (row) => (row && typeof row.toJSON === 'function' ? row.toJSON() : row),
}));

const {
  PHONE_TYPES,
  EMAIL_TYPES,
  parseContactInput,
  parsePhoneItem,
  parseEmailItem,
  parseSiteItem,
  enforceOnePrimary,
  applyPrimaryContacts,
  applySelectedContacts,
  applyLeadContacts,
  leadContactSelection,
  formatSite,
} = require('../customerContacts');

describe('contact helpers (requirement 2.2)', () => {
  test('phone types are mobile, landline, work; email types are personal, work', () => {
    expect(PHONE_TYPES).toEqual(['mobile', 'landline', 'work']);
    expect(EMAIL_TYPES).toEqual(['personal', 'work']);
  });

  test('formatSite joins address and postcode', () => {
    expect(formatSite({ address: '14 Elm Grove', postcode: 'RG1 5AB' })).toBe('14 Elm Grove, RG1 5AB');
    expect(formatSite({ address: '14 Elm Grove', postcode: null })).toBe('14 Elm Grove');
    expect(formatSite(null)).toBeNull();
  });

  test('empty lists are allowed; a non-empty list gets exactly one primary', () => {
    expect(enforceOnePrimary([], 'phone')).toEqual([]);
    expect(enforceOnePrimary([{ value: 'a', is_primary: false }, { value: 'b', is_primary: false }], 'phone')).toEqual([
      { value: 'a', is_primary: true },
      { value: 'b', is_primary: false },
    ]);
    expect(enforceOnePrimary(
      [{ value: 'a', is_primary: true }, { value: 'b', is_primary: true }],
      'phone',
    ).error).toMatch(/Exactly one primary/);
  });

  test('scalar shortcuts become a single primary of each list', () => {
    const parsed = parseContactInput({
      phone: ' 07700 ',
      phone_type: 'landline',
      email: 'dave@example.com',
      email_type: 'work',
      address: '14 Elm Grove',
      postcode: 'RG1 5AB',
    });
    expect(parsed.phones).toEqual([{ value: '07700', normalised: '07700', type: 'landline', is_primary: true }]);
    expect(parsed.emails).toEqual([{ value: 'dave@example.com', type: 'work', is_primary: true }]);
    expect(parsed.sites).toEqual([{ address: '14 Elm Grove', postcode: 'RG1 5AB', is_primary: true }]);
  });

  test('arrays win over scalar shortcuts', () => {
    const parsed = parseContactInput({
      phone: 'ignored',
      phones: [{ value: '0118 123', type: 'work' }],
    });
    expect(parsed.phones).toEqual([{ value: '0118 123', normalised: '0118123', type: 'work', is_primary: true }]);
  });

  test('invalid email format and missing site address are rejected', () => {
    expect(parseEmailItem({ value: 'not-an-email', type: 'personal' }).error).toBe('Invalid email address');
    expect(parseSiteItem({ address: '  ' }).error).toBe('Site address is required');
    expect(parsePhoneItem({ value: '07700', type: 'pager' }).error).toBe('Invalid phone type');
    expect(parsePhoneItem({ value: 'not-a-number' }).error).toBe('Enter a valid phone number');
  });

  test('applyPrimaryContacts copies the primary of each list onto scalar fields', () => {
    const obj = applyPrimaryContacts({
      name: 'Dave',
      phones: [
        { id: 2, value: '0118', type: 'landline', is_primary: false },
        { id: 1, value: '07700', type: 'mobile', is_primary: true },
      ],
      emails: [{ id: 3, value: 'dave@example.com', type: 'personal', is_primary: true }],
      sites: [{ id: 4, address: '14 Elm Grove', postcode: 'RG1', is_primary: true }],
    });
    expect(obj.phone).toBe('07700');
    expect(obj.email).toBe('dave@example.com');
    expect(obj.address).toBe('14 Elm Grove');
    expect(obj.postcode).toBe('RG1');
  });

  test('applyPrimaryContacts leaves scalar fields alone when lists are omitted', () => {
    const obj = applyPrimaryContacts({ name: 'Dave', phone: '07700', address: 'Home' });
    expect(obj.phone).toBe('07700');
    expect(obj.address).toBe('Home');
  });

  test('applySelectedContacts overlays the chosen site, phone, and email', () => {
    const customer = {
      name: 'Dave',
      phones: [
        { id: 1, value: '07700', is_primary: true },
        { id: 2, value: '0118', is_primary: false },
      ],
      emails: [
        { id: 3, value: 'home@example.com', is_primary: true },
        { id: 4, value: 'work@example.com', is_primary: false },
      ],
      sites: [
        { id: 5, address: 'Home', postcode: 'RG1', is_primary: true },
        { id: 6, address: 'Garage', postcode: 'RG2', is_primary: false },
      ],
    };
    const selected = applySelectedContacts(customer, { site_id: 6, phone_id: 2, email_id: 4 });
    expect(selected.address).toBe('Garage');
    expect(selected.postcode).toBe('RG2');
    expect(selected.phone).toBe('0118');
    expect(selected.email).toBe('work@example.com');
  });

  test('applyLeadContacts uses only the enquiry ids, not every customer contact', () => {
    const customer = {
      phones: [
        { id: 1, value: '07700', is_primary: true },
        { id: 2, value: '0118', is_primary: false },
      ],
      emails: [
        { id: 3, value: 'home@example.com', is_primary: true },
        { id: 4, value: 'work@example.com', is_primary: false },
      ],
      sites: [
        { id: 5, address: 'Home', postcode: 'RG1', is_primary: true },
        { id: 6, address: 'Garage', postcode: 'RG2', is_primary: false },
      ],
    };
    const chosen = applyLeadContacts(customer, { site_id: 6, phone_id: 2, email_id: 4 });
    expect(chosen).toEqual(expect.objectContaining({
      site_id: 6,
      phone_id: 2,
      email_id: 4,
      address: 'Garage',
      phone: '0118',
      email: 'work@example.com',
    }));
    expect(applyLeadContacts(customer, { meta: {} }).phone).toBeNull();
    expect(leadContactSelection({ meta: { site_id: 6 } }).site_id).toBe(6);
  });
});
