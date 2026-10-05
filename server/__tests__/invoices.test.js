jest.mock('../auth', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 1, role: 'ADMIN' }; next(); },
  requireOffice: (req, res, next) => next(),
  asyncHandler: (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next),
}));

jest.mock('../db', () => ({
  nextRef: jest.fn(async () => 'INV-2026-0001'),
  getSetting: jest.fn(async (key) => {
    if (key === 'uk') return { vat_registered: true, default_cis_rate: 20 };
    if (key === 'invoice_due_days') return 14;
    if (key === 'vat_rate') return 20;
    return null;
  }),
  money: (n) => `£${n}`,
  DATA_DIR: '/tmp',
  todayStr: () => '2026-09-26',
  plain: (row) => (row && typeof row.toJSON === 'function' ? row.toJSON() : row),
}));

jest.mock('../models', () => ({
  Invoice: { create: jest.fn(), findByPk: jest.fn(), findAll: jest.fn(), findOne: jest.fn(), count: jest.fn() },
  Job: { findByPk: jest.fn(), update: jest.fn(), findAll: jest.fn() },
  Customer: { findByPk: jest.fn() },
  Quote: { findByPk: jest.fn() },
  JobVariation: { findAll: jest.fn() },
  InvoicePayment: { create: jest.fn(), findAll: jest.fn() },
}));

jest.mock('../services/pipeline', () => ({ setStage: jest.fn(), logActivity: jest.fn(), resolveLeadForCustomer: jest.fn(async () => null) }));
jest.mock('../services/messenger', () => ({ sendToCustomer: jest.fn() }));
jest.mock('../services/taskEngine', () => ({ resolveRule: jest.fn() }));
jest.mock('../services/pdf', () => ({ invoicePdf: jest.fn(async () => 'inv.pdf') }));
jest.mock('../integrations/quickbooks', () => ({ pushInvoice: jest.fn() }));
jest.mock('../customerContacts', () => ({
  loadCustomerWithContacts: jest.fn(),
  applySelectedContacts: jest.fn((c) => c),
}));

const request = require('supertest');
const express = require('express');
const { Op } = require('sequelize');
const { Invoice, Job, Customer, Quote, JobVariation } = require('../models');
const invoices = require('../routes/invoices');

const app = express();
app.use(express.json());
app.use('/api/invoices', invoices);
app.use((err, req, res, next) => { res.status(500).json({ error: err.message }); });

describe('POST /api/invoices tax rules (requirement 6.3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Invoice.findOne.mockResolvedValue(null);
    JobVariation.findAll.mockResolvedValue([]);
  });

  test('inherits VAT, CIS and reverse charge from the linked quote', async () => {
    Job.findByPk.mockResolvedValue({ id: 7, customer_id: 3, quote_id: 9, title: 'Re-roof', value: 5000, stage: 'COMPLETED' });
    Quote.findByPk.mockResolvedValue({
      id: 9,
      items: [{ description: 'Labour', qty: 1, unit_price: 1000, vat_code: 'standard', kind: 'labour' }],
      vat_treatment: 'reverse_charge',
      cis_applies: true,
      cis_rate: 20,
      retention_percent: 0,
    });
    Customer.findByPk.mockResolvedValue({ id: 3, customer_type: 'commercial', stage: 'COMPLETED' });
    Invoice.create.mockResolvedValue({ id: 55, ref: 'INV-2026-0001' });

    const res = await request(app).post('/api/invoices').send({ job_id: 7 });
    expect(res.status).toBe(200);
    const payload = Invoice.create.mock.calls[0][0];
    expect(payload.vat_treatment).toBe('reverse_charge');
    expect(payload.cis_applies).toBe(true);
    expect(payload.vat_amount).toBe(0);
    expect(payload.cis_deduction).toBe(200);
    expect(payload.total).toBe(1000);
  });

  test('domestic invoice without a quote charges per-line VAT and no CIS', async () => {
    Customer.findByPk.mockResolvedValue({ id: 4, customer_type: 'domestic', stage: 'COMPLETED' });
    Invoice.create.mockResolvedValue({ id: 56, ref: 'INV-2026-0002' });

    const res = await request(app).post('/api/invoices').send({
      customer_id: 4,
      items: [{ description: 'Felt', qty: 1, unit_price: 500, vat_code: 'standard', kind: 'materials' }],
    });
    expect(res.status).toBe(200);
    const payload = Invoice.create.mock.calls[0][0];
    expect(payload.vat_treatment).toBe('standard');
    expect(payload.cis_applies).toBe(false);
    expect(payload.vat_amount).toBe(100);
    expect(payload.total).toBe(600);
  });

  test('inherits provisional sums and bills grand total when the toggle is on (requirement 6.4)', async () => {
    Job.findByPk.mockResolvedValue({ id: 8, customer_id: 5, quote_id: 10, title: 'Re-roof', value: 5000, stage: 'COMPLETED' });
    Quote.findByPk.mockResolvedValue({
      id: 10,
      items: [{ description: 'Labour', qty: 1, unit_price: 1000, vat_code: 'standard', kind: 'labour' }],
      vat_treatment: 'standard',
      cis_applies: false,
      cis_rate: 20,
      retention_percent: 0,
      provisional_sums: [{ description: 'Rafter feet', amount: 250 }],
      provisional_sums_in_total: true,
    });
    Customer.findByPk.mockResolvedValue({ id: 5, customer_type: 'domestic', stage: 'COMPLETED' });
    Invoice.create.mockResolvedValue({ id: 57, ref: 'INV-2026-0003' });

    const res = await request(app).post('/api/invoices').send({ job_id: 8 });
    expect(res.status).toBe(200);
    const payload = Invoice.create.mock.calls[0][0];
    expect(payload.total).toBe(1450);
    expect(payload.provisional_sums).toEqual([{ description: 'Rafter feet', amount: 250 }]);
    expect(payload.provisional_sums_in_total).toBe(true);
  });

  test('appends each job variation after quote lines (requirement 11.1)', async () => {
    Job.findByPk.mockResolvedValue({ id: 8, customer_id: 5, quote_id: 10, title: 'Re-roof', value: 5000 });
    Quote.findByPk.mockResolvedValue({
      id: 10,
      items: [{ description: 'Labour', qty: 1, unit_price: 1000, vat_code: 'standard', kind: 'labour' }],
      vat_treatment: 'standard',
      cis_applies: true,
      cis_rate: 20,
      retention_percent: 0,
    });
    JobVariation.findAll.mockResolvedValue([
      { description: 'Lead soakers', amount: 180, sort_order: 0 },
    ]);
    Customer.findByPk.mockResolvedValue({ id: 5, customer_type: 'domestic', stage: 'COMPLETED' });
    Invoice.create.mockResolvedValue({ id: 58, ref: 'INV-2026-0004' });

    const res = await request(app).post('/api/invoices').send({ job_id: 8 });
    expect(res.status).toBe(200);
    const payload = Invoice.create.mock.calls[0][0];
    expect(payload.items).toEqual([
      { description: 'Labour', qty: 1, unit_price: 1000, vat_code: 'standard', kind: 'labour' },
      { description: 'Lead soakers', qty: 1, unit_price: 180, vat_code: 'standard', kind: 'labour' },
    ]);
    expect(payload.cis_applies).toBe(true);
    expect(payload.cis_deduction).toBe(236);
  });

  test('returns 400 when that job already has an invoice (requirement 11.1)', async () => {
    Job.findByPk.mockResolvedValue({ id: 8, customer_id: 5, quote_id: 10, title: 'Re-roof', value: 5000 });
    Invoice.findOne.mockResolvedValue({ id: 12, ref: 'INV-2026-0004' });

    const res = await request(app).post('/api/invoices').send({ job_id: 8 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('This job already has an invoice');
    expect(res.body.invoice_id).toBe(12);
    expect(Invoice.create).not.toHaveBeenCalled();
  });

  test('does not require COMPLETED status (requirement 11.1)', async () => {
    Job.findByPk.mockResolvedValue({ id: 9, customer_id: 5, quote_id: null, title: 'Porch', value: 400, status: 'IN_PROGRESS' });
    Customer.findByPk.mockResolvedValue({ id: 5, customer_type: 'domestic', stage: 'IN_PROGRESS' });
    Invoice.create.mockResolvedValue({ id: 59, ref: 'INV-2026-0005' });

    const res = await request(app).post('/api/invoices').send({ job_id: 9 });
    expect(res.status).toBe(200);
    expect(Invoice.create.mock.calls[0][0].items).toEqual([
      { description: 'Porch', qty: 1, unit_price: 400 },
    ]);
  });
});

describe('GET /api/invoices/ready (requirement 11.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Invoice.findOne.mockResolvedValue(null);
    JobVariation.findAll.mockResolvedValue([]);
  });

  test('lists completed jobs that do not yet have an invoice', async () => {
    Invoice.findAll.mockResolvedValue([{ job_id: 2 }]);
    Job.findAll.mockResolvedValue([
      {
        toJSON: () => ({
          id: 9,
          title: 'Moss removal',
          customer_id: 3,
          value: 548,
          status: 'COMPLETED',
          Customer: { name: 'Fiona Whitmore' },
        }),
      },
    ]);

    const res = await request(app).get('/api/invoices/ready');
    expect(res.status).toBe(200);
    const where = Job.findAll.mock.calls[0][0].where;
    expect(where.status).toBe('COMPLETED');
    expect(where.id[Op.notIn]).toEqual([2]);
    expect(res.body.jobs).toEqual([
      {
        id: 9,
        title: 'Moss removal',
        customer_id: 3,
        customer_name: 'Fiona Whitmore',
        value: 548,
        status: 'COMPLETED',
      },
    ]);
  });
});

describe('GET /api/invoices', () => {
  beforeEach(() => jest.clearAllMocks());

  test('copies the job enquiry onto each invoice', async () => {
    Invoice.findAll.mockResolvedValue([{
      id: 12,
      customer_id: 25,
      job_id: 7,
      ref: 'INV-2026-0009',
      Customer: { name: 'Fiona Whitmore' },
      Job: { id: 7, lead_id: 14 },
      toJSON() { return { ...this }; },
    }]);

    const res = await request(app).get('/api/invoices');
    expect(res.status).toBe(200);
    expect(res.body.invoices[0].lead_id).toBe(14);
    expect(res.body.invoices[0].customer_name).toBe('Fiona Whitmore');
    expect(res.body.invoices[0].Job).toBeUndefined();
  });
});

describe('PUT /api/invoices/:id/tax (requirement 11.2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Invoice.findOne.mockResolvedValue(null);
    JobVariation.findAll.mockResolvedValue([]);
  });

  const draftInvoice = () => ({
    id: 12,
    ref: 'INV-2026-0010',
    customer_id: 5,
    status: 'draft',
    items: [{ description: 'Labour', qty: 1, unit_price: 1000, vat_code: 'standard', kind: 'labour' }],
    vat_treatment: 'reverse_charge',
    cis_applies: true,
    cis_rate: 20,
    retention_percent: 0,
    provisional_sums: [],
    provisional_sums_in_total: false,
    vat_breakdown: [{ code: 'standard', rate: 20, net: 1000, vat: 0 }],
    update: jest.fn(async function update(fields) { Object.assign(this, fields); }),
  });

  test('recalculates a draft and stores the new columns', async () => {
    const row = draftInvoice();
    row.Job = { id: 7, lead_id: 14 };
    Invoice.findByPk.mockResolvedValue(row);
    Customer.findByPk.mockResolvedValue({ id: 5, customer_type: 'commercial' });

    const res = await request(app).put('/api/invoices/12/tax').send({
      vat_treatment: 'standard',
      cis_applies: true,
      cis_rate: 20,
    });
    expect(res.status).toBe(200);
    expect(row.update).toHaveBeenCalled();
    expect(res.body.invoice.vat_treatment).toBe('standard');
    expect(res.body.invoice.vat_amount).toBe(200);
    expect(res.body.invoice.cis_deduction).toBe(200);
    expect(res.body.invoice.tax_frozen).toBe(false);
    expect(res.body.invoice.lead_id).toBe(14);
    expect(res.body.invoice.Job).toBeUndefined();
  });

  test('returns 400 when the invoice is not a draft', async () => {
    Invoice.findByPk.mockResolvedValue({ ...draftInvoice(), status: 'sent', update: jest.fn() });
    Customer.findByPk.mockResolvedValue({ id: 5, customer_type: 'commercial' });

    const res = await request(app).put('/api/invoices/12/tax').send({ vat_treatment: 'standard' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VAT and CIS can only be edited on a draft invoice');
  });

  test('returns 400 for paid invoices', async () => {
    Invoice.findByPk.mockResolvedValue({ ...draftInvoice(), status: 'paid', update: jest.fn() });
    Customer.findByPk.mockResolvedValue({ id: 5, customer_type: 'commercial' });
    const res = await request(app).put('/api/invoices/12/tax').send({ cis_applies: false });
    expect(res.status).toBe(400);
  });
});

function invoicePdfRow(overrides = {}) {
  return {
    id: 12,
    customer_id: 5,
    ref: 'INV-2026-0010',
    status: 'draft',
    total: 657.6,
    due_date: '2026-10-09',
    pdf_file: null,
    toJSON() { return { ...this }; },
    update: jest.fn(async function patch(fields) { Object.assign(this, fields); }),
    ...overrides,
  };
}

describe('POST /api/invoices/:id/pdf (requirement 11.3)', () => {
  const contacts = require('../customerContacts');
  const { invoicePdf } = require('../services/pdf');
  const { sendToCustomer } = require('../services/messenger');

  beforeEach(() => jest.clearAllMocks());

  test('generates and stores the PDF without sending or changing status', async () => {
    const row = invoicePdfRow();
    Invoice.findByPk.mockResolvedValue(row);
    contacts.loadCustomerWithContacts.mockResolvedValue({ id: 5, name: 'Fiona', email: 'fiona@example.com' });

    const res = await request(app).post('/api/invoices/12/pdf');
    expect(res.status).toBe(200);
    expect(res.body.pdf).toBe('inv.pdf');
    expect(invoicePdf).toHaveBeenCalled();
    expect(row.update).toHaveBeenCalledWith({ pdf_file: 'inv.pdf' });
    expect(row.status).toBe('draft');
    expect(sendToCustomer).not.toHaveBeenCalled();
  });

  test('returns 404 when the invoice is missing', async () => {
    Invoice.findByPk.mockResolvedValue(null);
    const res = await request(app).post('/api/invoices/99/pdf');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/invoices/:id/send (requirement 11.3)', () => {
  const contacts = require('../customerContacts');
  const { sendToCustomer } = require('../services/messenger');
  const { getSetting } = require('../db');
  const { invoicePdf } = require('../services/pdf');
  const quickbooks = require('../integrations/quickbooks');

  beforeEach(() => {
    jest.clearAllMocks();
    getSetting.mockImplementation(async (key) => {
      if (key === 'templates') {
        return {
          invoice_email_body: 'Invoice {ref} for {name}',
          invoice_email_subject: 'Invoice {ref}',
        };
      }
      return null;
    });
    sendToCustomer.mockResolvedValue({ simulated: true });
    quickbooks.pushInvoice.mockResolvedValue({ simulated: true, qboId: 'qb-1' });
  });

  test('emails a draft invoice with the PDF attached and marks sent', async () => {
    const row = invoicePdfRow();
    Invoice.findByPk.mockResolvedValue(row);
    contacts.loadCustomerWithContacts.mockResolvedValue({
      id: 5,
      name: 'Fiona Whitmore',
      email: 'fiona@example.com',
    });

    const res = await request(app).post('/api/invoices/12/send');
    expect(res.status).toBe(200);
    expect(invoicePdf).toHaveBeenCalled();
    expect(sendToCustomer).toHaveBeenCalledWith(
      5,
      'email',
      expect.any(String),
      expect.objectContaining({
        email: 'fiona@example.com',
        attachments: [expect.objectContaining({ filename: 'INV-2026-0010.pdf' })],
      }),
    );
    expect(row.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'sent' }));
    expect(quickbooks.pushInvoice).toHaveBeenCalled();
  });

  test('allows resend while the invoice is already sent', async () => {
    const row = invoicePdfRow({ status: 'sent' });
    Invoice.findByPk.mockResolvedValue(row);
    contacts.loadCustomerWithContacts.mockResolvedValue({
      id: 5,
      name: 'Fiona',
      email: 'fiona@example.com',
    });

    const res = await request(app).post('/api/invoices/12/send');
    expect(res.status).toBe(200);
    expect(sendToCustomer).toHaveBeenCalled();
    expect(row.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'sent' }));
  });

  test('returns 400 and does not mark sent when the customer has no email', async () => {
    const row = invoicePdfRow();
    Invoice.findByPk.mockResolvedValue(row);
    contacts.loadCustomerWithContacts.mockResolvedValue({ id: 5, name: 'Fiona', email: null });

    const res = await request(app).post('/api/invoices/12/send');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Customer has no email address on record');
    expect(sendToCustomer).not.toHaveBeenCalled();
    expect(invoicePdf).not.toHaveBeenCalled();
    expect(row.update).not.toHaveBeenCalled();
  });

  test('returns 400 for paid invoices', async () => {
    Invoice.findByPk.mockResolvedValue(invoicePdfRow({ status: 'paid' }));
    const res = await request(app).post('/api/invoices/12/send');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('This invoice cannot be emailed');
    expect(sendToCustomer).not.toHaveBeenCalled();
  });

  test('does not mark sent if the email send fails', async () => {
    const row = invoicePdfRow();
    Invoice.findByPk.mockResolvedValue(row);
    contacts.loadCustomerWithContacts.mockResolvedValue({
      id: 5,
      name: 'Fiona',
      email: 'fiona@example.com',
    });
    sendToCustomer.mockRejectedValue(new Error('SMTP down'));

    const res = await request(app).post('/api/invoices/12/send');
    expect(res.status).toBe(400);
    expect(row.update).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'sent' }));
  });
});

describe('GET /api/invoices/summary (requirement 11.4)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns outstanding, overdue and paid-in-full count from due_now', async () => {
    Invoice.findOne
      .mockResolvedValueOnce({ v: 1200 })
      .mockResolvedValueOnce({ v: 400, c: 2 });
    Invoice.count.mockResolvedValue(5);

    const res = await request(app).get('/api/invoices/summary');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      outstanding: 1200,
      overdue: 400,
      overdue_count: 2,
      paid_count: 5,
    });
  });
});

describe('POST /api/invoices/:id/payment (requirement 11.4)', () => {
  const { InvoicePayment } = require('../models');
  const { setStage } = require('../services/pipeline');
  const { resolveRule } = require('../services/taskEngine');

  function sentInvoice(overrides = {}) {
    return {
      id: 12,
      customer_id: 5,
      job_id: 7,
      ref: 'INV-2026-0010',
      status: 'sent',
      due_now: 548,
      amount_paid: 0,
      paid_at: null,
      toJSON() { return { ...this }; },
      update: jest.fn(async function patch(fields) { Object.assign(this, fields); }),
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    InvoicePayment.create.mockImplementation(async (row) => ({ id: 99, ...row }));
  });

  test('logs a ledger row and marks part-paid below due_now', async () => {
    const row = sentInvoice();
    Invoice.findByPk.mockResolvedValue(row);
    InvoicePayment.findAll.mockResolvedValue([{ amount: 200 }]);

    const res = await request(app).post('/api/invoices/12/payment').send({
      amount: 200,
      paid_at: '2026-09-20',
      note: 'BACS',
    });
    expect(res.status).toBe(200);
    expect(InvoicePayment.create).toHaveBeenCalledWith(expect.objectContaining({
      invoice_id: 12,
      amount: 200,
      paid_at: '2026-09-20',
      note: 'BACS',
      recorded_by: 1,
    }));
    expect(row.update).toHaveBeenCalledWith(expect.objectContaining({
      amount_paid: 200,
      status: 'part_paid',
    }));
    expect(res.body.status).toBe('part_paid');
    expect(setStage).not.toHaveBeenCalled();
  });

  test('caps the amount at remaining due_now and marks paid', async () => {
    const row = sentInvoice();
    Invoice.findByPk.mockResolvedValue(row);
    InvoicePayment.findAll.mockResolvedValue([{ amount: 548 }]);

    const res = await request(app).post('/api/invoices/12/payment').send({ amount: 999 });
    expect(res.status).toBe(200);
    expect(InvoicePayment.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 548 }));
    expect(row.update).toHaveBeenCalledWith(expect.objectContaining({
      amount_paid: 548,
      status: 'paid',
    }));
    expect(Job.update).toHaveBeenCalledWith({ status: 'PAID' }, { where: { id: 7 } });
    expect(setStage).toHaveBeenCalledWith(5, 'PAID', 1, expect.stringContaining('INV-2026-0010'), expect.anything());
    expect(resolveRule).toHaveBeenCalledWith('chase_payment:invoice:12');
  });

  test('omitted amount pays the remaining due_now balance', async () => {
    const row = sentInvoice({ amount_paid: 48, due_now: 548 });
    Invoice.findByPk.mockResolvedValue(row);
    InvoicePayment.findAll.mockResolvedValue([{ amount: 48 }, { amount: 500 }]);

    const res = await request(app).post('/api/invoices/12/payment').send({});
    expect(res.status).toBe(200);
    expect(InvoicePayment.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 500 }));
  });

  test('rejects payment on a draft', async () => {
    Invoice.findByPk.mockResolvedValue(sentInvoice({ status: 'draft' }));
    const res = await request(app).post('/api/invoices/12/payment').send({ amount: 10 });
    expect(res.status).toBe(400);
    expect(InvoicePayment.create).not.toHaveBeenCalled();
  });

  test('rejects payment on a paid invoice', async () => {
    Invoice.findByPk.mockResolvedValue(sentInvoice({ status: 'paid', amount_paid: 548 }));
    const res = await request(app).post('/api/invoices/12/payment').send({ amount: 10 });
    expect(res.status).toBe(400);
    expect(InvoicePayment.create).not.toHaveBeenCalled();
  });
});
