jest.mock('../models', () => ({
  sequelize: {},
  Setting: {
    findByPk: jest.fn(),
    upsert: jest.fn(),
    findAll: jest.fn(),
  },
  Quote: { findAll: jest.fn() },
  Invoice: { findAll: jest.fn() },
}));

const { Setting, Quote, Invoice } = require('../models');
const { getSetting, setSetting, allSettings, nextRef, pj, plain, DEFAULT_SETTINGS } = require('../db');

describe('db helpers', () => {
  beforeEach(() => jest.clearAllMocks());

  test('pj returns objects already parsed (JSONB) and parses leftover TEXT JSON', () => {
    expect(pj({ a: 1 }, {})).toEqual({ a: 1 });
    expect(pj('[1,2]', [])).toEqual([1, 2]);
    expect(pj('not-json', [])).toEqual([]);
    expect(pj(null, { fallback: true })).toEqual({ fallback: true });
  });

  test('plain flattens Sequelize instances', () => {
    expect(plain(null)).toBeNull();
    expect(plain({ toJSON: () => ({ id: 3 }) })).toEqual({ id: 3 });
    expect(plain([{ toJSON: () => ({ id: 1 }) }])).toEqual([{ id: 1 }]);
  });

  test('getSetting reads JSONB value from Setting model', async () => {
    Setting.findByPk.mockResolvedValue({ key: 'vat_rate', value: 20 });
    await expect(getSetting('vat_rate')).resolves.toBe(20);
  });

  test('getSetting merges seeded VAT rates onto stored uk settings', async () => {
    Setting.findByPk.mockResolvedValue({ key: 'uk', value: { vat_registered: true, default_cis_rate: 20 } });
    const uk = await getSetting('uk');
    expect(uk.vat_registered).toBe(true);
    expect(uk.vat_rates).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'standard', rate: 20 }),
    ]));
  });

  test('getSetting merges company defaults so bank keys exist (requirement 17.1)', async () => {
    Setting.findByPk.mockResolvedValue({
      key: 'company',
      value: { name: 'Stored Ltd', city: 'Leeds' },
    });
    const company = await getSetting('company');
    expect(company.name).toBe('Stored Ltd');
    expect(company.city).toBe('Leeds');
    expect(company.bank_account_number).toBe('');
    expect(company.bank_sort_code).toBe('');
    expect(company.vat_number).toBe(DEFAULT_SETTINGS.company.vat_number);
  });

  test('allSettings merges company defaults onto stored company JSON (requirement 17.1)', async () => {
    Setting.findAll.mockResolvedValue([
      { key: 'company', value: { name: 'Stored Ltd' } },
    ]);
    const settings = await allSettings();
    expect(settings.company.name).toBe('Stored Ltd');
    expect(settings.company.city).toBe(DEFAULT_SETTINGS.company.city);
    expect(settings.company).toEqual(expect.objectContaining({
      bank_name: '',
      bank_account_name: '',
      bank_sort_code: '',
      bank_account_number: '',
    }));
  });

  test('getSetting merges timesheet defaults (requirement 17.3)', async () => {
    Setting.findByPk.mockResolvedValue({
      key: 'timesheets',
      value: { site_radius_m: 250 },
    });
    const timesheets = await getSetting('timesheets');
    expect(timesheets.site_radius_m).toBe(250);
    expect(timesheets.enabled).toBe(DEFAULT_SETTINGS.timesheets.enabled);
    expect(timesheets.max_shift_hours).toBe(DEFAULT_SETTINGS.timesheets.max_shift_hours);
    expect(timesheets.require_photo_on_clockout).toBe(false);
    expect(timesheets.auto_break_minutes).toBeUndefined();
    expect(timesheets.auto_break_after_hours).toBeUndefined();
  });

  test('getSetting strips retired auto-break timesheet keys', async () => {
    Setting.findByPk.mockResolvedValue({
      key: 'timesheets',
      value: {
        enabled: true,
        site_radius_m: 250,
        auto_break_minutes: 30,
        auto_break_after_hours: 6,
      },
    });
    const timesheets = await getSetting('timesheets');
    expect(timesheets.site_radius_m).toBe(250);
    expect(timesheets.auto_break_minutes).toBeUndefined();
    expect(timesheets.auto_break_after_hours).toBeUndefined();
  });

  test('getSetting strips retired follow-up template keys', async () => {
    Setting.findByPk.mockResolvedValue({
      key: 'templates',
      value: {
        quote_sent_whatsapp: 'Hi',
        quote_followup_1: 'legacy',
        followup_email_subject: 'legacy subject',
        custom: [],
      },
    });
    const templates = await getSetting('templates');
    expect(templates.quote_sent_whatsapp).toBe('Hi');
    expect(templates.quote_followup_1).toBeUndefined();
    expect(templates.followup_email_subject).toBeUndefined();
  });

  test('allSettings merges branding defaults (requirement 17.3)', async () => {
    Setting.findAll.mockResolvedValue([
      { key: 'branding', value: { logo_file: 'brand-logo.png' } },
    ]);
    const settings = await allSettings();
    expect(settings.branding.logo_file).toBe('brand-logo.png');
    expect(settings.timesheets.enabled).toBe(true);
    expect(settings.holiday_allowance_days).toBe(28);
  });

  test('setSetting upserts JSONB', async () => {
    Setting.upsert.mockResolvedValue([{}, true]);
    await setSetting('company', { name: 'Test Ltd' });
    expect(Setting.upsert).toHaveBeenCalledWith({ key: 'company', value: { name: 'Test Ltd' } });
  });

  test('setSetting strips retired auto-break timesheet keys', async () => {
    Setting.upsert.mockResolvedValue([{}, true]);
    await setSetting('timesheets', {
      enabled: true,
      site_radius_m: 250,
      auto_break_minutes: 30,
      auto_break_after_hours: 6,
    });
    expect(Setting.upsert).toHaveBeenCalledWith({
      key: 'timesheets',
      value: { enabled: true, site_radius_m: 250 },
    });
  });

  test('nextRef uses the highest yearly sequence, not the row count', async () => {
    const year = new Date().getFullYear();
    Quote.findAll.mockResolvedValue([
      { ref: `Q-${year}-0001` },
      { ref: `Q-${year}-0017` },
    ]);
    await expect(nextRef('quote')).resolves.toBe(`Q-${year}-0018`);
  });

  test('nextRef starts at 0001 when none exist for the year', async () => {
    Quote.findAll.mockResolvedValue([]);
    const year = new Date().getFullYear();
    await expect(nextRef('quote')).resolves.toBe(`Q-${year}-0001`);
  });

  test('nextRef uses Invoice model for invoices', async () => {
    Invoice.findAll.mockResolvedValue([]);
    const year = new Date().getFullYear();
    await expect(nextRef('invoice')).resolves.toBe(`INV-${year}-0001`);
  });

  test('nextRef skips invoice sequence gaps', async () => {
    const year = new Date().getFullYear();
    Invoice.findAll.mockResolvedValue([{ ref: `INV-${year}-0004` }]);
    await expect(nextRef('invoice')).resolves.toBe(`INV-${year}-0005`);
  });
});
