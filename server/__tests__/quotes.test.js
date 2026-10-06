jest.mock('../auth', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 1, role: 'ADMIN' }; next(); },
  requireOffice: (req, res, next) => next(),
  asyncHandler: (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next),
}));

jest.mock('../db', () => ({
  nextRef: jest.fn(async () => 'Q-2026-0001'),
  getSetting: jest.fn(async (key) => {
    if (key === 'quote_defaults') return { payment_schedule: [] };
    if (key === 'uk') return { vat_registered: true, default_cis_rate: 20 };
    if (key === 'quote_validity_days') return 30;
    if (key === 'vat_rate') return 20;
    return null;
  }),
  money: (n) => `£${n}`,
  DATA_DIR: '/tmp',
  plain: (row) => (row && typeof row.toJSON === 'function' ? row.toJSON() : row),
}));

jest.mock('../models', () => ({
  Quote: { create: jest.fn(), findByPk: jest.fn(), findAll: jest.fn(), findOne: jest.fn() },
  Customer: { findByPk: jest.fn(), update: jest.fn() },
  Followup: { findAll: jest.fn(), update: jest.fn(), destroy: jest.fn() },
  Job: { create: jest.fn(), findOne: jest.fn() },
  sequelize: { transaction: jest.fn(async (fn) => fn({})) },
  CustomerSite: {},
  CustomerPhone: {},
  CustomerEmail: {},
  Appointment: {},
}));
jest.mock('../customerContacts', () => ({
  resolveCustomerContactSelection: jest.fn(async () => ({
    site_id: null, phone_id: null, email_id: null, site: null, phone: null, email: null,
  })),
  loadCustomerWithContacts: jest.fn(),
  applySelectedContacts: jest.fn((c) => c),
  formatSite: jest.fn(() => null),
}));
jest.mock('../geocode', () => ({
  ensureJobSitePoint: jest.fn(async () => null),
  geocodeAddress: jest.fn(async () => null),
}));
jest.mock('../catalogue', () => ({
  listItems: jest.fn(async () => [{
    id: 'felt_3layer',
    description: 'Supply & fit 3-layer torch-on felt system',
    unit: 'm²',
    unit_price: 42,
    vat_code: 'standard',
    kind: 'materials',
  }]),
}));

jest.mock('../services/pipeline', () => ({ setStage: jest.fn(), logActivity: jest.fn(), resolveLeadForCustomer: jest.fn(async () => null) }));
jest.mock('../services/messenger', () => ({ sendToCustomer: jest.fn() }));
jest.mock('../services/followups', () => ({
  scheduleForQuote: jest.fn(),
  render: jest.fn(),
  cancelPendingForQuote: jest.fn(async () => 1),
  updateFollowupSchedule: jest.fn(),
  cancelFollowup: jest.fn(),
}));
jest.mock('../services/taskEngine', () => ({
  resolveRule: jest.fn(),
  ensureTask: jest.fn(),
  resolveQuoteFollowupTask: jest.fn(),
}));
jest.mock('../services/pdf', () => ({ quotePdf: jest.fn(async () => 'quote-Q-2026-0001.pdf') }));
jest.mock('../notifications', () => ({
  safeNotify: jest.fn(async () => []),
  notifyOffice: jest.fn(async () => []),
  notifyUsers: jest.fn(async () => []),
}));

const request = require('supertest');
const express = require('express');
const { Customer, Quote, Job, Followup } = require('../models');
const quotes = require('../routes/quotes');

const app = express();
app.use(express.json());
app.use('/api/quotes', quotes);
app.use((err, req, res, next) => { res.status(500).json({ error: err.message }); });

describe('POST /api/quotes native types', () => {
  beforeEach(() => jest.clearAllMocks());

  test('stores JSONB arrays, BOOLEAN flags, and DATEONLY validity', async () => {
    Customer.findByPk.mockResolvedValue({ id: 9, customer_type: 'domestic' });
    Quote.create.mockResolvedValue({ id: 42, ref: 'Q-2026-0001' });

    const items = [
      { description: 'Labour', qty: 1, unit_price: 1000, vat_code: 'standard', kind: 'labour' },
    ];
    const res = await request(app).post('/api/quotes').send({
      customer_id: 9,
      title: 'Test quote',
      items,
      cis_applies: true,
      cis_rate: 20,
    });

    expect(res.status).toBe(200);
    expect(Quote.create).toHaveBeenCalledTimes(1);
    const payload = Quote.create.mock.calls[0][0];
    expect(Array.isArray(payload.items)).toBe(true);
    expect(payload.items).toEqual(items);
    expect(payload.cis_applies).toBe(true);
    expect(payload.cancellation_rights_apply).toBe(true);
    expect(typeof payload.cis_applies).toBe('boolean');
    expect(payload.valid_until).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof payload.items).not.toBe('string');
  });

  test('commercial customers do not get cancellation rights', async () => {
    Customer.findByPk.mockResolvedValue({ id: 10, customer_type: 'commercial' });
    Quote.create.mockResolvedValue({ id: 43, ref: 'Q-2026-0002' });

    const res = await request(app).post('/api/quotes').send({
      customer_id: 10,
      title: 'Commercial quote',
      items: [{ description: 'Works', qty: 1, unit_price: 500, vat_code: 'standard', kind: 'both' }],
    });

    expect(res.status).toBe(200);
    expect(Quote.create.mock.calls[0][0].cancellation_rights_apply).toBe(false);
    expect(Quote.create.mock.calls[0][0].cis_applies).toBe(true);
    expect(Quote.create.mock.calls[0][0].vat_treatment).toBe('reverse_charge');
    expect(Quote.create.mock.calls[0][0].retention_percent).toBe(5);
  });

  test('domestic quotes default to standard VAT and no CIS', async () => {
    Customer.findByPk.mockResolvedValue({ id: 11, customer_type: 'domestic' });
    Quote.create.mockResolvedValue({ id: 44, ref: 'Q-2026-0003' });

    const res = await request(app).post('/api/quotes').send({
      customer_id: 11,
      title: 'Domestic quote',
      items: [{ description: 'Works', qty: 1, unit_price: 500, vat_code: 'standard', kind: 'labour' }],
    });

    expect(res.status).toBe(200);
    expect(Quote.create.mock.calls[0][0].vat_treatment).toBe('standard');
    expect(Quote.create.mock.calls[0][0].cis_applies).toBe(false);
    expect(Quote.create.mock.calls[0][0].vat_amount).toBe(100);
    expect(Quote.create.mock.calls[0][0].retention_percent).toBe(0);
  });

  test('office can override commercial defaults on the quote', async () => {
    Customer.findByPk.mockResolvedValue({ id: 12, customer_type: 'commercial' });
    Quote.create.mockResolvedValue({ id: 45, ref: 'Q-2026-0004' });

    const res = await request(app).post('/api/quotes').send({
      customer_id: 12,
      title: 'Override',
      items: [{ description: 'Works', qty: 1, unit_price: 500, vat_code: 'standard', kind: 'labour' }],
      vat_treatment: 'standard',
      cis_applies: false,
      retention_percent: 0,
    });

    expect(res.status).toBe(200);
    expect(Quote.create.mock.calls[0][0].vat_treatment).toBe('standard');
    expect(Quote.create.mock.calls[0][0].cis_applies).toBe(false);
    expect(Quote.create.mock.calls[0][0].vat_amount).toBe(100);
    expect(Quote.create.mock.calls[0][0].retention_percent).toBe(0);
  });

  test('provisional sums stay off the works total unless the toggle is on', async () => {
    Customer.findByPk.mockResolvedValue({ id: 13, customer_type: 'domestic' });
    Quote.create.mockResolvedValue({ id: 46, ref: 'Q-2026-0005' });

    const res = await request(app).post('/api/quotes').send({
      customer_id: 13,
      title: 'With P.S.',
      items: [{ description: 'Works', qty: 1, unit_price: 1000, vat_code: 'standard', kind: 'labour' }],
      provisional_sums: [{ description: 'Rafter feet', amount: 400 }],
      provisional_sums_in_total: true,
    });

    expect(res.status).toBe(200);
    const payload = Quote.create.mock.calls[0][0];
    expect(payload.total).toBe(1200);
    expect(payload.provisional_sums).toEqual([{ description: 'Rafter feet', amount: 400 }]);
    expect(payload.provisional_sums_in_total).toBe(true);
    expect(res.body.calc.grand_total).toBe(1600);
  });

  test('optional extras stay off the works total (requirement 6.5)', async () => {
    Customer.findByPk.mockResolvedValue({ id: 14, customer_type: 'domestic' });
    Quote.create.mockResolvedValue({ id: 47, ref: 'Q-2026-0006' });

    const res = await request(app).post('/api/quotes').send({
      customer_id: 14,
      title: 'With extras',
      items: [{ description: 'Works', qty: 1, unit_price: 1000, vat_code: 'standard', kind: 'labour' }],
      optional_extras: [{ description: 'Velux window', amount: 640 }],
    });

    expect(res.status).toBe(200);
    const payload = Quote.create.mock.calls[0][0];
    expect(payload.total).toBe(1200);
    expect(payload.optional_extras).toEqual([{ description: 'Velux window', amount: 640 }]);
    expect(res.body.calc.optional_extras_total).toBe(640);
    expect(res.body.calc.grand_total).toBe(1200);
  });
});

describe('GET /api/quotes/meta/options (requirement 6.1)', () => {
  test('returns the catalogue for the quote builder', async () => {
    const res = await request(app).get('/api/quotes/meta/options');
    expect(res.status).toBe(200);
    expect(res.body.catalogue).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'felt_3layer',
        description: 'Supply & fit 3-layer torch-on felt system',
        unit: 'm²',
        unit_price: 42,
        vat_code: 'standard',
        kind: 'materials',
      }),
    ]));
    expect(res.body.vat_rates).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'standard', rate: 20 }),
      expect.objectContaining({ code: 'reduced', rate: 5 }),
    ]));
  });
});

describe('quote revisions and extras on accept (requirement 6.5)', () => {
  const contacts = require('../customerContacts');

  beforeEach(() => jest.clearAllMocks());

  test('POST /:id/revise copies the quote as a new draft ref', async () => {
    Quote.findByPk.mockResolvedValue({
      id: 10,
      customer_id: 9,
      ref: 'Q-2026-0010',
      title: 'Felt overlay',
      items: [{ description: 'Felt', qty: 1, unit_price: 1000 }],
      total: 1200,
      subtotal: 1000,
      vat_amount: 200,
      vat_rate: 20,
      vat_treatment: 'standard',
      cis_applies: false,
      cis_rate: 20,
      cis_deduction: 0,
      retention_percent: 0,
      retention_amount: 0,
      due_now: 1200,
      labour_total: 0,
      materials_total: 1000,
      vat_breakdown: [],
      payment_schedule: [],
      optional_extras: [{ description: 'Velux', amount: 640 }],
      provisional_sums: [],
      provisional_sums_in_total: false,
      cancellation_rights_apply: true,
    });
    Quote.create.mockResolvedValue({ id: 11, ref: 'Q-2026-0001', total: 1200 });

    const res = await request(app).post('/api/quotes/10/revise');
    expect(res.status).toBe(200);
    expect(res.body.ref).toBe('Q-2026-0001');
    const payload = Quote.create.mock.calls[0][0];
    expect(payload.status).toBe('draft');
    expect(payload.revised_from_id).toBe(10);
    expect(payload.title).toBe('Felt overlay');
    expect(payload.optional_extras).toEqual([{ description: 'Velux', amount: 640 }]);
    expect(payload.accepted_optional_extras).toEqual([]);
  });

  test('POST /:id/clone copies the quote with a new title', async () => {
    Quote.findByPk.mockResolvedValue({
      id: 10,
      customer_id: 9,
      ref: 'Q-2026-0010',
      title: 'Felt overlay',
      items: [{ description: 'Felt', qty: 1, unit_price: 1000 }],
      total: 1200,
      subtotal: 1000,
      vat_amount: 200,
      vat_rate: 20,
      vat_treatment: 'standard',
      cis_applies: false,
      cis_rate: 20,
      cis_deduction: 0,
      retention_percent: 0,
      retention_amount: 0,
      due_now: 1200,
      labour_total: 0,
      materials_total: 1000,
      vat_breakdown: [],
      payment_schedule: [],
      optional_extras: [{ description: 'Velux', amount: 640 }],
      provisional_sums: [],
      provisional_sums_in_total: false,
      cancellation_rights_apply: true,
    });
    Quote.create.mockResolvedValue({ id: 12, ref: 'Q-2026-0001', total: 1200, title: 'Rear slope v2' });

    const res = await request(app).post('/api/quotes/10/clone').send({ title: 'Rear slope v2' });
    expect(res.status).toBe(200);
    expect(res.body.ref).toBe('Q-2026-0001');
    const payload = Quote.create.mock.calls[0][0];
    expect(payload.status).toBe('draft');
    expect(payload.revised_from_id).toBe(10);
    expect(payload.title).toBe('Rear slope v2');
  });

  test('POST /:id/clone requires a title', async () => {
    Quote.findByPk.mockResolvedValue({ id: 10, title: 'Felt overlay' });
    const res = await request(app).post('/api/quotes/10/clone').send({ title: '  ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title is required/i);
    expect(Quote.create).not.toHaveBeenCalled();
  });

  test('DELETE /:id removes a quote without a job', async () => {
    const quoteRow = {
      id: 10,
      customer_id: 9,
      ref: 'Q-2026-0010',
      destroy: jest.fn(async () => {}),
    };
    Quote.findByPk.mockResolvedValue(quoteRow);
    Job.findOne.mockResolvedValue(null);
    Followup.destroy.mockResolvedValue(2);

    const res = await request(app).delete('/api/quotes/10');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Followup.destroy).toHaveBeenCalledWith({ where: { quote_id: 10 } });
    expect(quoteRow.destroy).toHaveBeenCalled();
    const { logActivity } = require('../services/pipeline');
    expect(logActivity).toHaveBeenCalledWith(9, 1, 'quote_deleted', 'Quote Q-2026-0010 deleted', 'quote', 10);
  });

  test('DELETE /:id rejects a quote that already has a job', async () => {
    Quote.findByPk.mockResolvedValue({
      id: 20,
      customer_id: 9,
      ref: 'Q-2026-0020',
      destroy: jest.fn(async () => {}),
    });
    Job.findOne.mockResolvedValue({ id: 77, quote_id: 20 });

    const res = await request(app).delete('/api/quotes/20');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/has a job/i);
    expect(Followup.destroy).not.toHaveBeenCalled();
  });

  test('accepting a quote adds ticked extras to the job value', async () => {
    const quoteRow = {
      id: 20,
      customer_id: 9,
      ref: 'Q-2026-0020',
      title: 'Re-roof',
      total: 1200,
      notes: null,
      site_id: null,
      phone_id: null,
      email_id: null,
      optional_extras: [{ description: 'Velux', amount: 640 }, { description: 'Cowl', amount: 45 }],
      update: jest.fn(async function patch(fields) { Object.assign(this, fields); }),
    };
    Quote.findByPk.mockResolvedValue(quoteRow);
    contacts.loadCustomerWithContacts.mockResolvedValue({ id: 9, name: 'Dave', sites: [] });
    Followup.update.mockResolvedValue([1]);
    Job.findOne.mockResolvedValue(null);
    Job.create.mockResolvedValue({ id: 77 });

    const res = await request(app).post('/api/quotes/20/decision').send({
      decision: 'accepted',
      accepted_extra_indexes: [0],
    });
    expect(res.status).toBe(200);
    expect(res.body.job_value).toBe(1840);
    expect(Job.create.mock.calls[0][0].value).toBe(1840);
    expect(Job.create.mock.calls[0][0].title).toBe('Re-roof');
    expect(Job.create.mock.calls[0][0].description).toBeNull();
    expect(Job.create.mock.calls[0][0].required_skills).toEqual([]);
    expect(Job.create.mock.calls[0][0].materials).toBeUndefined();
    expect(quoteRow.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'accepted',
      accepted_optional_extras: [{ description: 'Velux', amount: 640 }],
    }));
    const { resolveQuoteFollowupTask } = require('../services/taskEngine');
    expect(resolveQuoteFollowupTask).toHaveBeenCalledWith(20);
  });

  test('a second accept returns the existing job and does not create another (requirement 7.1)', async () => {
    Quote.findByPk.mockResolvedValue({ id: 20, customer_id: 9, status: 'accepted' });
    Job.findOne.mockResolvedValue({ id: 77, value: 1840 });
    const { setStage, logActivity } = require('../services/pipeline');

    const res = await request(app).post('/api/quotes/20/decision').send({
      decision: 'accepted',
      accepted_extra_indexes: [0],
    });
    expect(res.status).toBe(200);
    expect(res.body.job_id).toBe(77);
    expect(res.body.job_value).toBe(1840);
    expect(Job.create).not.toHaveBeenCalled();
    expect(setStage).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });
});

describe('POST /api/quotes/:id/pdf (requirement 6.6)', () => {
  const contacts = require('../customerContacts');
  const { quotePdf } = require('../services/pdf');
  const { sendToCustomer } = require('../services/messenger');

  beforeEach(() => jest.clearAllMocks());

  test('generates and stores the PDF without sending or changing status', async () => {
    const quoteRow = {
      id: 7,
      customer_id: 9,
      ref: 'Q-2026-0007',
      status: 'draft',
      pdf_file: null,
      cancellation_rights_apply: true,
      toJSON() { return { ...this }; },
      update: jest.fn(async function patch(fields) { Object.assign(this, fields); }),
    };
    Quote.findByPk.mockResolvedValue(quoteRow);
    contacts.loadCustomerWithContacts.mockResolvedValue({ id: 9, name: 'Dave' });

    const res = await request(app).post('/api/quotes/7/pdf');
    expect(res.status).toBe(200);
    expect(res.body.pdf).toBe('quote-Q-2026-0001.pdf');
    expect(quotePdf).toHaveBeenCalledWith(
      expect.objectContaining({ ref: 'Q-2026-0007', cancellation_rights_apply: true }),
      expect.anything()
    );
    expect(quoteRow.update).toHaveBeenCalledWith({ pdf_file: 'quote-Q-2026-0001.pdf' });
    expect(quoteRow.status).toBe('draft');
    expect(sendToCustomer).not.toHaveBeenCalled();
  });

  test('commercial quotes still generate a PDF without cancellation rights', async () => {
    const quoteRow = {
      id: 8,
      customer_id: 10,
      ref: 'Q-2026-0008',
      status: 'draft',
      cancellation_rights_apply: false,
      toJSON() { return { ...this }; },
      update: jest.fn(async function patch(fields) { Object.assign(this, fields); }),
    };
    Quote.findByPk.mockResolvedValue(quoteRow);
    contacts.loadCustomerWithContacts.mockResolvedValue({ id: 10, name: 'Site Roofing', customer_type: 'commercial' });

    const res = await request(app).post('/api/quotes/8/pdf');
    expect(res.status).toBe(200);
    expect(quotePdf).toHaveBeenCalledWith(
      expect.objectContaining({ cancellation_rights_apply: false }),
      expect.anything()
    );
    expect(sendToCustomer).not.toHaveBeenCalled();
  });

  test('returns 404 when the quote is missing', async () => {
    Quote.findByPk.mockResolvedValue(null);
    const res = await request(app).post('/api/quotes/99/pdf');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/quotes/:id/send (requirement 6.7)', () => {
  const contacts = require('../customerContacts');
  const { sendToCustomer } = require('../services/messenger');
  const { getSetting } = require('../db');

  beforeEach(() => {
    jest.clearAllMocks();
    getSetting.mockImplementation(async (key) => {
      if (key === 'templates') {
        return {
          quote_sent_whatsapp: 'Hi {name} — {ref}',
          quote_email_body: 'Quote {ref}',
          quote_email_subject: 'Quote {ref}',
        };
      }
      return null;
    });
    sendToCustomer.mockResolvedValue({ simulated: true });
  });

  test('sends a draft quote and records the channel', async () => {
    const quoteRow = {
      id: 7,
      customer_id: 9,
      ref: 'Q-2026-0007',
      title: 'Felt',
      total: 1200,
      status: 'draft',
      valid_until: '2026-10-01',
      toJSON() { return { ...this }; },
      update: jest.fn(async function patch(fields) { Object.assign(this, fields); }),
    };
    Quote.findByPk.mockResolvedValue(quoteRow);
    contacts.loadCustomerWithContacts.mockResolvedValue({ id: 9, name: 'Dave Whitfield' });

    const res = await request(app).post('/api/quotes/7/send').send({ channels: ['whatsapp'] });
    expect(res.status).toBe(200);
    expect(sendToCustomer).toHaveBeenCalled();
    expect(quoteRow.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'sent',
      sent_via: 'whatsapp',
    }));
  });

  test('does not mark the quote sent when WhatsApp keys are missing', async () => {
    const { NOT_CONNECTED_ERROR } = require('../integrations/whatsapp');
    sendToCustomer.mockRejectedValue(new Error(NOT_CONNECTED_ERROR));
    const quoteRow = {
      id: 7,
      customer_id: 9,
      ref: 'Q-2026-0017',
      title: 'Test',
      total: 158,
      status: 'draft',
      valid_until: '2026-10-01',
      toJSON() { return { ...this }; },
      update: jest.fn(async function patch(fields) { Object.assign(this, fields); }),
    };
    Quote.findByPk.mockResolvedValue(quoteRow);
    contacts.loadCustomerWithContacts.mockResolvedValue({ id: 9, name: 'Sahil' });

    const res = await request(app).post('/api/quotes/7/send').send({ channels: ['whatsapp'] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(NOT_CONNECTED_ERROR);
    expect(quoteRow.update).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'sent' }));
  });

  test('allows resend on an already sent quote', async () => {
    const quoteRow = {
      id: 8,
      customer_id: 9,
      ref: 'Q-2026-0008',
      title: 'Felt',
      total: 1200,
      status: 'sent',
      sent_via: 'whatsapp',
      valid_until: '2026-10-01',
      toJSON() { return { ...this }; },
      update: jest.fn(async function patch(fields) { Object.assign(this, fields); }),
    };
    Quote.findByPk.mockResolvedValue(quoteRow);
    contacts.loadCustomerWithContacts.mockResolvedValue({ id: 9, name: 'Dave' });

    const res = await request(app).post('/api/quotes/8/send').send({ channels: ['email'] });
    expect(res.status).toBe(200);
    expect(sendToCustomer).toHaveBeenCalled();
    expect(quoteRow.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'sent',
      sent_via: 'email',
    }));
  });

  test('rejects send on an accepted quote', async () => {
    Quote.findByPk.mockResolvedValue({ id: 9, status: 'accepted' });
    const res = await request(app).post('/api/quotes/9/send').send({ channels: ['whatsapp'] });
    expect(res.status).toBe(400);
    expect(sendToCustomer).not.toHaveBeenCalled();
  });
});

describe('POST /api/quotes/:id/followups/cancel (requirement 12.1)', () => {
  const { cancelPendingForQuote } = require('../services/followups');
  const { logActivity } = require('../services/pipeline');

  beforeEach(() => jest.clearAllMocks());

  test('cancels remaining pending steps for that quote', async () => {
    Quote.findByPk.mockResolvedValue({ id: 20, customer_id: 9, ref: 'Q-2026-0020' });
    cancelPendingForQuote.mockResolvedValue(2);
    const res = await request(app).post('/api/quotes/20/followups/cancel');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, cancelled: 2 });
    expect(cancelPendingForQuote).toHaveBeenCalledWith(20, 'cancelled by office');
    expect(logActivity).toHaveBeenCalledWith(
      9, 1, 'followups_cancelled',
      'Office cancelled remaining follow-ups for quote Q-2026-0020',
      'quote', 20
    );
    const { resolveQuoteFollowupTask } = require('../services/taskEngine');
    expect(resolveQuoteFollowupTask).toHaveBeenCalledWith(20);
  });

  test('returns 404 when the quote is missing', async () => {
    Quote.findByPk.mockResolvedValue(null);
    const res = await request(app).post('/api/quotes/99/followups/cancel');
    expect(res.status).toBe(404);
    expect(cancelPendingForQuote).not.toHaveBeenCalled();
  });
});

describe('PUT /api/quotes/:id/followups/:followupId', () => {
  const { updateFollowupSchedule } = require('../services/followups');

  beforeEach(() => jest.clearAllMocks());

  test('saves a new scheduled time for that step', async () => {
    Quote.findByPk.mockResolvedValue({ id: 20, customer_id: 9, ref: 'Q-2026-0020' });
    updateFollowupSchedule.mockResolvedValue({
      id: 8, quote_id: 20, step: 1, status: 'pending', scheduled_at: '2026-10-12T09:00:00.000Z',
    });
    const res = await request(app).put('/api/quotes/20/followups/8').send({
      scheduled_at: '2026-10-12T09:00:00.000Z',
    });
    expect(res.status).toBe(200);
    expect(updateFollowupSchedule).toHaveBeenCalledWith(expect.objectContaining({
      quoteId: 20,
      followupId: '8',
      scheduledAt: '2026-10-12T09:00:00.000Z',
      userId: 1,
    }));
  });

  test('returns the service error status', async () => {
    Quote.findByPk.mockResolvedValue({ id: 20, customer_id: 9, ref: 'Q-20' });
    updateFollowupSchedule.mockRejectedValue(Object.assign(new Error('Only a pending follow-up can have its date changed'), { status: 400 }));
    const res = await request(app).put('/api/quotes/20/followups/8').send({ scheduled_at: '2026-10-12T09:00:00.000Z' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/pending/i);
  });
});

describe('POST /api/quotes/:id/followups/:followupId/cancel', () => {
  const { cancelFollowup } = require('../services/followups');

  beforeEach(() => jest.clearAllMocks());

  test('cancels that step only', async () => {
    Quote.findByPk.mockResolvedValue({ id: 20, customer_id: 9, ref: 'Q-2026-0020' });
    cancelFollowup.mockResolvedValue({ id: 8, quote_id: 20, status: 'cancelled' });
    const res = await request(app).post('/api/quotes/20/followups/8/cancel');
    expect(res.status).toBe(200);
    expect(cancelFollowup).toHaveBeenCalledWith(expect.objectContaining({
      quoteId: 20,
      followupId: '8',
      userId: 1,
    }));
  });
});
