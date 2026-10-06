jest.mock('../models', () => ({
  User: { create: jest.fn(), findByPk: jest.fn(), findAll: jest.fn(), count: jest.fn() },
  SecurityEvent: { create: jest.fn(), findAll: jest.fn() },
}));
jest.mock('../db', () => ({
  allSettings: jest.fn(async () => ({ ok: true })),
  setSetting: jest.fn(),
  getSetting: jest.fn(),
  plain: (row) => (row && typeof row.toJSON === 'function' ? row.toJSON() : row),
}));
jest.mock('../integrations/registry', () => ({
  all: jest.fn(),
  recentEvents: jest.fn(),
}));
jest.mock('../branding', () => ({
  hasUploadedLogo: jest.fn(() => false),
  handleUpload: (req, res, next) => next(),
  saveLogo: jest.fn(async () => ({ branding: { logo_file: 'brand-logo.png', uploaded: true } })),
  sendLogo: (res) => res.status(200).end(),
}));
jest.mock('../automation', () => ({
  applyIntervalFromSettings: jest.fn(async () => '*/5 * * * *'),
}));
jest.mock('../auth', () => {
  const actual = jest.requireActual('../auth');
  const state = { user: { id: 1, role: 'ADMIN' } };
  return {
    ...actual,
    requireAuth: (req, res, next) => { req.user = state.user; next(); },
    requireOffice: (req, res, next) => next(),
    requireAdmin: (req, res, next) => {
      if (req.user && req.user.role === 'ADMIN') return next();
      return res.status(403).json({ error: 'Owner/admin only' });
    },
    __setUser: (user) => { state.user = user; },
  };
});

const request = require('supertest');
const express = require('express');
const settings = require('../routes/settings');
const { allSettings, setSetting, getSetting } = require('../db');
const { __setUser } = require('../auth');
const branding = require('../branding');

const app = express();
app.use(express.json());
app.use('/api/settings', settings);
app.use((err, req, res, next) => { res.status(500).json({ error: err.message }); });

describe('PUT /api/settings VAT rates (requirement 6.3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __setUser({ id: 1, role: 'ADMIN' });
  });

  test('saves added and updated VAT rates', async () => {
    const res = await request(app).put('/api/settings').send({
      uk: {
        vat_registered: true,
        vat_rates: [
          { code: 'standard', rate: 21, short: '21%', label: 'Standard 21%' },
          { code: 'green', rate: 5, short: '5%', label: 'Green 5%' },
        ],
      },
    });
    expect(res.status).toBe(200);
    expect(setSetting).toHaveBeenCalledWith('uk', expect.objectContaining({
      vat_rates: expect.arrayContaining([
        expect.objectContaining({ code: 'standard', rate: 21 }),
        expect.objectContaining({ code: 'green', rate: 5 }),
      ]),
    }));
    expect(setSetting).toHaveBeenCalledWith('vat_rate', 21);
  });

  test('rejects a duplicate VAT code', async () => {
    const res = await request(app).put('/api/settings').send({
      uk: { vat_rates: [{ code: 'x', rate: 10 }, { code: 'x', rate: 12 }] },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Duplicate/);
    expect(setSetting).not.toHaveBeenCalled();
  });
});

describe('PUT /api/settings follow-ups (requirement 12.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __setUser({ id: 1, role: 'ADMIN' });
  });

  test('saves a sequence with a body template per step', async () => {
    const followups = {
      enabled: true,
      email_subject: 'Re {ref}',
      steps: [
        { delay_days: 2, channel: 'whatsapp', body: 'Hi {name}' },
        { delay_days: 5, channel: 'email', body: 'Checking {ref}' },
      ],
    };
    const res = await request(app).put('/api/settings').send({ followups });
    expect(res.status).toBe(200);
    expect(setSetting).toHaveBeenCalledWith('followups', followups);
  });

  test('rejects a step without a body template', async () => {
    const res = await request(app).put('/api/settings').send({
      followups: { enabled: true, steps: [{ delay_days: 2, channel: 'whatsapp', body: '' }] },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/body template is required/);
    expect(setSetting).not.toHaveBeenCalled();
  });
});

describe('PUT /api/settings automation interval (requirement 12.3)', () => {
  const { applyIntervalFromSettings } = require('../automation');

  beforeEach(() => {
    jest.clearAllMocks();
    __setUser({ id: 1, role: 'ADMIN' });
  });

  test('saves interval minutes and reschedules the cron', async () => {
    const res = await request(app).put('/api/settings').send({ automation: { interval_minutes: 10 } });
    expect(res.status).toBe(200);
    expect(setSetting).toHaveBeenCalledWith('automation', { interval_minutes: 10 });
    expect(applyIntervalFromSettings).toHaveBeenCalled();
  });

  test('rejects an interval outside 1–60 minutes', async () => {
    const res = await request(app).put('/api/settings').send({ automation: { interval_minutes: 0 } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/1 to 60/);
    expect(setSetting).not.toHaveBeenCalled();
  });
});

describe('GET /api/settings company bank (requirement 17.1)', () => {
  const full = {
    company: {
      name: 'PDR',
      city: 'United Kingdom',
      bank_name: 'Barclays',
      bank_account_name: 'Paul Douglas Roofing',
      bank_sort_code: '20-00-00',
      bank_account_number: '12345678',
    },
    uk: { vat_registered: true, cis_registered: true, cis_utr: '1234567890', default_cis_rate: 20 },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    allSettings.mockResolvedValue(full);
    __setUser({ id: 1, role: 'ADMIN' });
  });

  test('admin receives bank details', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body.settings.company.bank_account_number).toBe('12345678');
    expect(res.body.settings.company.bank_sort_code).toBe('20-00-00');
    expect(res.body.settings.company.bank_name).toBe('Barclays');
  });

  test('office omits bank details', async () => {
    __setUser({ id: 2, role: 'OFFICE' });
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body.settings.company.name).toBe('PDR');
    expect(res.body.settings.company.city).toBe('United Kingdom');
    expect(res.body.settings.company.bank_account_number).toBeUndefined();
    expect(res.body.settings.company.bank_sort_code).toBeUndefined();
    expect(res.body.settings.company.bank_name).toBeUndefined();
    expect(res.body.settings.company.bank_account_name).toBeUndefined();
    expect(res.body.settings.uk.vat_registered).toBe(true);
  });
});

describe('PUT /api/settings UK tax flags (requirement 17.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __setUser({ id: 1, role: 'ADMIN' });
  });

  test('saves vat_registered, cis_registered, cis_utr, and default_cis_rate', async () => {
    const res = await request(app).put('/api/settings').send({
      uk: {
        vat_registered: false,
        cis_registered: true,
        cis_utr: ' 1234567890 ',
        default_cis_rate: 30,
      },
    });
    expect(res.status).toBe(200);
    expect(setSetting).toHaveBeenCalledWith('uk', expect.objectContaining({
      vat_registered: false,
      cis_registered: true,
      cis_utr: '1234567890',
      default_cis_rate: 30,
    }));
  });

  test('rejects an invalid default CIS rate', async () => {
    const res = await request(app).put('/api/settings').send({
      uk: { default_cis_rate: 15 },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/0, 20, or 30/);
    expect(setSetting).not.toHaveBeenCalled();
  });
});

describe('PUT /api/settings templates (requirement 17.2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __setUser({ id: 1, role: 'ADMIN' });
  });

  test('saves core bodies and extra named templates', async () => {
    const res = await request(app).put('/api/settings').send({
      templates: {
        quote_sent_whatsapp: 'Hi {name}, quote {ref}',
        custom: [{ key: 'Site Visit Confirm!', body: 'See you tomorrow {name}' }],
      },
    });
    expect(res.status).toBe(200);
    expect(setSetting).toHaveBeenCalledWith('templates', expect.objectContaining({
      quote_sent_whatsapp: 'Hi {name}, quote {ref}',
      custom: [{ key: 'site_visit_confirm', body: 'See you tomorrow {name}' }],
    }));
  });

  test('rejects a reserved custom key', async () => {
    const res = await request(app).put('/api/settings').send({
      templates: { custom: [{ key: 'quote_email_body', body: 'nope' }] },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/reserved/);
    expect(setSetting).not.toHaveBeenCalled();
  });

  test('drops retired legacy follow-up template keys', async () => {
    const res = await request(app).put('/api/settings').send({
      templates: {
        quote_sent_whatsapp: 'Hi {name}',
        quote_followup_1: 'should not save',
        followup_email_subject: 'should not save',
      },
    });
    expect(res.status).toBe(200);
    const saved = setSetting.mock.calls.find((c) => c[0] === 'templates')[1];
    expect(saved.quote_followup_1).toBeUndefined();
    expect(saved.followup_email_subject).toBeUndefined();
    expect(saved.quote_sent_whatsapp).toBe('Hi {name}');
  });

  test('saves edited checklist templates and allows deleting a seed', async () => {
    const res = await request(app).put('/api/settings').send({
      checklist_templates: [
        { id: 'generic', label: 'Generic visit', items: ['PPE on'] },
        { id: 'felt', label: 'Felt / flat roof', items: ['Prime', 'Fit covering'] },
      ],
    });
    expect(res.status).toBe(200);
    expect(setSetting).toHaveBeenCalledWith('checklist_templates', [
      { id: 'generic', label: 'Generic visit', items: ['PPE on'] },
      { id: 'felt', label: 'Felt / flat roof', items: ['Prime', 'Fit covering'] },
    ]);
  });

  test('saves a newly added checklist template', async () => {
    const res = await request(app).put('/api/settings').send({
      checklist_templates: [{ id: 'wizard', label: 'Wizard', items: ['Cast'] }],
    });
    expect(res.status).toBe(200);
    expect(setSetting).toHaveBeenCalledWith('checklist_templates', [
      { id: 'wizard', label: 'Wizard', items: ['Cast'] },
    ]);
  });

  test('rejects an invalid checklist template id', async () => {
    const res = await request(app).put('/api/settings').send({
      checklist_templates: [{ id: 'Not Valid!', label: 'Wizard', items: ['Cast'] }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/letters, numbers, and underscores/);
    expect(setSetting).not.toHaveBeenCalled();
  });
});

describe('PUT /api/settings timesheet rules and holiday default (requirement 17.3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getSetting.mockReset();
    __setUser({ id: 1, role: 'ADMIN' });
  });

  test('saves the stored timesheet keys', async () => {
    const timesheets = {
      enabled: true,
      require_location: false,
      site_radius_m: 250,
      require_photo_on_clockout: true,
      round_to_minutes: 15,
      max_shift_hours: 12,
    };
    const res = await request(app).put('/api/settings').send({ timesheets });
    expect(res.status).toBe(200);
    expect(setSetting).toHaveBeenCalledWith('timesheets', timesheets);
  });

  test('does not persist retired auto-break timesheet keys', async () => {
    const res = await request(app).put('/api/settings').send({
      timesheets: { enabled: true, auto_break_minutes: 30, auto_break_after_hours: 6 },
    });
    expect(res.status).toBe(200);
    const saved = setSetting.mock.calls.find((c) => c[0] === 'timesheets')[1];
    expect(saved.auto_break_minutes).toBeUndefined();
    expect(saved.auto_break_after_hours).toBeUndefined();
  });

  test('merges a partial timesheets PUT onto stored rules', async () => {
    getSetting.mockImplementation(async (key) => {
      if (key === 'timesheets') {
        return {
          enabled: true,
          require_location: true,
          site_radius_m: 500,
          require_photo_on_clockout: true,
          round_to_minutes: 5,
          max_shift_hours: 12,
        };
      }
      return undefined;
    });
    const res = await request(app).put('/api/settings').send({ timesheets: { enabled: false } });
    expect(res.status).toBe(200);
    expect(setSetting).toHaveBeenCalledWith('timesheets', expect.objectContaining({
      enabled: false,
      site_radius_m: 500,
      require_photo_on_clockout: true,
      max_shift_hours: 12,
    }));
  });

  test('does not persist unknown settings keys', async () => {
    const res = await request(app).put('/api/settings').send({
      quote_validity_days: 21,
      working_hours: { start: '00:00', end: '00:00' },
    });
    expect(res.status).toBe(200);
    expect(setSetting).toHaveBeenCalledWith('quote_validity_days', 21);
    expect(setSetting).not.toHaveBeenCalledWith('working_hours', expect.anything());
  });

  test('rejects an out-of-range timesheet value', async () => {
    const res = await request(app).put('/api/settings').send({
      timesheets: { site_radius_m: 20000 },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/site_radius_m/);
    expect(setSetting).not.toHaveBeenCalled();
  });

  test('saves company default holiday allowance', async () => {
    const res = await request(app).put('/api/settings').send({ holiday_allowance_days: 30 });
    expect(res.status).toBe(200);
    expect(setSetting).toHaveBeenCalledWith('holiday_allowance_days', 30);
  });

  test('rejects an invalid holiday allowance default', async () => {
    const res = await request(app).put('/api/settings').send({ holiday_allowance_days: 400 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/0–365/);
    expect(setSetting).not.toHaveBeenCalled();
  });

  test('ignores branding JSON on PUT', async () => {
    const res = await request(app).put('/api/settings').send({
      quote_validity_days: 21,
      branding: { logo_file: 'hack.png' },
    });
    expect(res.status).toBe(200);
    expect(setSetting).toHaveBeenCalledWith('quote_validity_days', 21);
    expect(setSetting).not.toHaveBeenCalledWith('branding', expect.anything());
  });
});

describe('GET/POST /api/settings logo (requirement 17.3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    branding.hasUploadedLogo.mockReturnValue(true);
    branding.saveLogo.mockResolvedValue({ branding: { logo_file: 'brand-logo.png', uploaded: true } });
    __setUser({ id: 1, role: 'ADMIN' });
  });

  test('GET includes whether a logo has been uploaded', async () => {
    allSettings.mockResolvedValue({ company: { name: 'PDR' } });
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body.settings.branding.uploaded).toBe(true);
  });

  test('ADMIN can upload a logo', async () => {
    const res = await request(app).post('/api/settings/logo');
    expect(res.status).toBe(200);
    expect(branding.saveLogo).toHaveBeenCalled();
    expect(res.body.branding.logo_file).toBe('brand-logo.png');
  });

  test('OFFICE cannot upload a logo', async () => {
    __setUser({ id: 2, role: 'OFFICE' });
    const res = await request(app).post('/api/settings/logo');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Owner/admin only');
    expect(branding.saveLogo).not.toHaveBeenCalled();
  });
});
