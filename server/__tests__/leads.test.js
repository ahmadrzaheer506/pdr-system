jest.mock('../models', () => ({
  Lead: {
    findAll: jest.fn(),
    findByPk: jest.fn(),
    sequelize: { fn: jest.fn(() => 'COUNT'), col: jest.fn(() => 'id'), escape: (v) => `'${String(v).replace(/'/g, "''")}'` },
  },
  Customer: {},
}));
jest.mock('../db', () => ({
  plain: (row) => (row && typeof row.toJSON === 'function' ? row.toJSON() : row),
}));
jest.mock('../services/messenger', () => ({ ingestInbound: jest.fn() }));
jest.mock('../services/pipeline', () => ({ logActivity: jest.fn() }));
jest.mock('../customerDuplicates', () => ({ findEnquiryOwner: jest.fn() }));
jest.mock('../customerContacts', () => ({
  CONTACT_INCLUDE: [],
  applyPrimaryContacts: (c) => ({
    ...c,
    phone: c.phones?.[0]?.value || null,
    email: c.emails?.[0]?.value || null,
    address: c.sites?.[0]?.address || null,
  }),
  loadCustomerWithContacts: jest.fn(),
  resolveCustomerContactSelection: jest.fn(),
  createMissingContacts: jest.fn(async (_id, _customer, body = {}) => ({
    value: { site_id: body.site_id, phone_id: body.phone_id, email_id: body.email_id },
  })),
}));
jest.mock('../auth', () => {
  const actual = jest.requireActual('../auth');
  const state = { user: { id: 1, role: 'ADMIN', name: 'Paul' } };
  return {
    ...actual,
    requireAuth: (req, res, next) => { req.user = state.user; next(); },
    __setUser: (user) => { state.user = user; },
  };
});

const request = require('supertest');
const express = require('express');
const { Op } = require('sequelize');
const { Lead } = require('../models');
const { __setUser } = require('../auth');
const { ingestInbound } = require('../services/messenger');
const { logActivity } = require('../services/pipeline');
const { findEnquiryOwner } = require('../customerDuplicates');
const contacts = require('../customerContacts');
const leads = require('../routes/leads');

const app = express();
app.use(express.json());
app.use('/api/leads', leads);
app.use((err, req, res, next) => { res.status(500).json({ error: err.message }); });

function leadRow({ id, source, status, name }) {
  return {
    toJSON: () => ({
      id,
      customer_id: id,
      source,
      status,
      next_action: 'Review & respond',
      message: `${source} enquiry`,
      created_at: '2026-09-22T10:00:00Z',
      meta: {},
      Customer: { name, stage: 'ENQUIRY', phones: [], emails: [], sites: [] },
    }),
  };
}

describe('GET /api/leads (requirement 3.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __setUser({ id: 1, role: 'ADMIN', name: 'Paul' });
    Lead.findAll
      .mockResolvedValueOnce([
        leadRow({ id: 1, source: 'whatsapp', status: 'NEW', name: 'Dave' }),
        leadRow({ id: 2, source: 'phone', status: 'NEW', name: 'Priya' }),
        leadRow({ id: 3, source: 'sms', status: 'NEW', name: 'SMS Lead' }),
        leadRow({ id: 4, source: 'manual', status: 'NEW', name: 'Amy' }),
      ])
      .mockResolvedValueOnce([
        { status: 'NEW', c: 4 },
        { status: 'CLOSED', c: 6 },
      ]);
  });

  test('returns every channel without a source filter', async () => {
    const res = await request(app).get('/api/leads?status=NEW');
    expect(res.status).toBe(200);
    expect(res.body.leads.map((l) => l.source)).toEqual(['whatsapp', 'phone', 'sms', 'manual']);
    expect(res.body.leads[0].next_action).toBe('Review & respond');
    expect(Lead.findAll).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'NEW' },
    }));
  });

  test('filters CLOSED when requested', async () => {
    Lead.findAll.mockReset();
    Lead.findAll
      .mockResolvedValueOnce([
        leadRow({ id: 20, source: 'phone', status: 'CLOSED', name: 'Neil Draper' }),
      ])
      .mockResolvedValueOnce([{ status: 'CLOSED', c: 1 }]);
    const res = await request(app).get('/api/leads?status=CLOSED');
    expect(res.status).toBe(200);
    expect(res.body.leads).toEqual([
      expect.objectContaining({ source: 'phone', status: 'CLOSED', customer_name: 'Neil Draper' }),
    ]);
    expect(Lead.findAll).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'CLOSED' },
    }));
  });

  test('ALL does not restrict by status, so closed leads are included', async () => {
    Lead.findAll.mockReset();
    Lead.findAll
      .mockResolvedValueOnce([
        leadRow({ id: 1, source: 'whatsapp', status: 'NEW', name: 'Dave' }),
        leadRow({ id: 20, source: 'phone', status: 'CLOSED', name: 'Neil' }),
      ])
      .mockResolvedValueOnce([{ status: 'NEW', c: 1 }, { status: 'CLOSED', c: 1 }]);
    const res = await request(app).get('/api/leads?status=ALL');
    expect(res.status).toBe(200);
    expect(Lead.findAll.mock.calls[0][0].where.status).toBeUndefined();
    expect(res.body.leads.map((l) => l.status)).toEqual(['NEW', 'CLOSED']);
  });

  test('STAFF receives 403', async () => {
    __setUser({ id: 3, role: 'STAFF', name: 'Jamie' });
    const res = await request(app).get('/api/leads');
    expect(res.status).toBe(403);
    expect(Lead.findAll).not.toHaveBeenCalled();
  });

  test('filters by source, search, and created-date range', async () => {
    const res = await request(app).get('/api/leads?status=NEW&source=whatsapp&q=Dave&created_from=2026-09-01&created_to=2026-09-22');
    expect(res.status).toBe(200);
    const and = Lead.findAll.mock.calls[0][0].where[Op.and];
    expect(and).toEqual(expect.arrayContaining([
      { status: 'NEW' },
      { source: 'whatsapp' },
      { created_at: { [Op.gte]: '2026-09-01T00:00:00.000Z', [Op.lte]: '2026-09-22T23:59:59.999Z' } },
    ]));
    expect(and.some((c) => c[Op.or])).toBe(true);
    const counted = Lead.findAll.mock.calls[1][0].where[Op.and];
    expect(counted).toEqual(expect.arrayContaining([{ source: 'whatsapp' }]));
    expect(counted.some((c) => c.status)).toBe(false);
  });

  test('rejects an invalid created_from date', async () => {
    const res = await request(app).get('/api/leads?status=NEW&created_from=22-09-2026');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid created_from date');
    expect(Lead.findAll).not.toHaveBeenCalled();
  });
});

describe('POST /api/leads (requirement 3.3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __setUser({ id: 2, role: 'OFFICE', name: 'Lisa' });
    ingestInbound.mockResolvedValue({ customerId: 9, leadId: 40, messageId: 7, matched: false });
    findEnquiryOwner.mockResolvedValue(null);
  });

  test('requires a name and accepts phone as optional', async () => {
    const missing = await request(app).post('/api/leads').send({ source: 'phone', phone: '07700 900100' });
    expect(missing.status).toBe(400);
    expect(missing.body.error).toBe('Name is required');
    expect(ingestInbound).not.toHaveBeenCalled();

    const ok = await request(app).post('/api/leads').send({
      source: 'phone',
      name: '  Dave Whitfield  ',
      message: 'Called about guttering',
    });
    expect(ok.status).toBe(200);
    expect(ingestInbound).toHaveBeenCalledWith(expect.objectContaining({
      source: 'phone',
      channel: 'phone',
      name: 'Dave Whitfield',
      phone: undefined,
      body: 'Called about guttering',
      ownerId: 2,
      forceNewLead: true,
      customer_type: 'domestic',
      company_name: null,
      vat_number: null,
    }));
    expect(logActivity).toHaveBeenCalledWith(9, 2, 'lead_logged', 'Enquiry logged manually (phone)');
  });

  test('keeps the Came in via sources including manual and phone', async () => {
    const res = await request(app).post('/api/leads').send({
      source: 'manual',
      name: 'Walk-in caller',
      phone: '07700 900100',
    });
    expect(res.status).toBe(200);
    expect(ingestInbound).toHaveBeenCalledWith(expect.objectContaining({
      source: 'manual',
      channel: 'note',
      name: 'Walk-in caller',
      phone: '07700 900100',
    }));
    const leadAd = await request(app).post('/api/leads').send({ source: 'facebook_lead', name: 'Lead' });
    expect(leadAd.status).toBe(200);
    expect(ingestInbound).toHaveBeenCalledWith(expect.objectContaining({
      source: 'facebook_lead',
      channel: 'facebook',
      name: 'Lead',
    }));
    const bad = await request(app).post('/api/leads').send({ source: 'website', name: 'Lead' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('Invalid source');
  });

  test('STAFF cannot log an enquiry', async () => {
    __setUser({ id: 3, role: 'STAFF', name: 'Jamie' });
    const res = await request(app).post('/api/leads').send({ name: 'Dave', source: 'phone' });
    expect(res.status).toBe(403);
    expect(ingestInbound).not.toHaveBeenCalled();
  });

  test('returns 409 with a duplicate notice when the phone or email is already on a customer', async () => {
    findEnquiryOwner.mockResolvedValue({
      status: 409,
      error: 'This phone number is already on Dave Whitfield. Open that customer instead.',
      customer_id: 9,
      name: 'Dave Whitfield',
    });
    const res = await request(app).post('/api/leads').send({
      source: 'phone',
      name: 'Someone Else',
      phone: '07700 900100',
    });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: 'This phone number is already on Dave Whitfield. Open that customer instead.',
      customer_id: 9,
      name: 'Dave Whitfield',
    });
    expect(ingestInbound).not.toHaveBeenCalled();
  });

  test('attaches to an existing customer without creating or merging contacts', async () => {
    contacts.loadCustomerWithContacts.mockResolvedValue({ id: 9, name: 'Dave Whitfield' });
    contacts.resolveCustomerContactSelection.mockResolvedValue({
      site_id: 1,
      phone_id: 3,
      email_id: 4,
      site: { address: '14 Elm Grove' },
      phone: { value: '07700 900100' },
      email: { value: 'dave@example.com' },
    });
    ingestInbound.mockResolvedValue({ customerId: 9, leadId: 41, messageId: 8, matched: true });

    const res = await request(app).post('/api/leads').send({
      source: 'phone',
      customer_id: 9,
      site_id: 1,
      phone_id: 3,
      email_id: 4,
      message: 'Called about guttering',
    });
    expect(res.status).toBe(200);
    expect(res.body.customerId).toBe(9);
    expect(findEnquiryOwner).not.toHaveBeenCalled();
    expect(contacts.resolveCustomerContactSelection).toHaveBeenCalledWith(
      9,
      expect.objectContaining({ customer_id: 9, site_id: 1 }),
      { fallbackPrimary: false },
    );
    expect(ingestInbound).toHaveBeenCalledWith(expect.objectContaining({
      customerId: 9,
      forceNewLead: true,
      meta: { site_id: 1, phone_id: 3, email_id: 4 },
    }));
  });

  test('creates missing site phone and email on an existing customer', async () => {
    contacts.loadCustomerWithContacts.mockResolvedValue({
      id: 9, name: 'Dave Whitfield', sites: [], phones: [], emails: [],
    });
    contacts.createMissingContacts.mockResolvedValue({
      value: { site_id: 11, phone_id: 21, email_id: 31 },
    });
    contacts.resolveCustomerContactSelection.mockResolvedValue({
      site_id: 11,
      phone_id: 21,
      email_id: 31,
      site: { address: '14 Elm Grove' },
      phone: { value: '07700 900100' },
      email: { value: 'dave@example.com' },
    });

    const res = await request(app).post('/api/leads').send({
      source: 'manual',
      customer_id: 9,
      address: '14 Elm Grove',
      postcode: 'RG1 5AB',
      phone: '07700 900100',
      phone_type: 'mobile',
      email: 'dave@example.com',
      email_type: 'personal',
    });
    expect(res.status).toBe(200);
    expect(contacts.createMissingContacts).toHaveBeenCalledWith(
      9,
      expect.objectContaining({ id: 9 }),
      expect.objectContaining({ address: '14 Elm Grove', phone: '07700 900100' }),
    );
    expect(ingestInbound).toHaveBeenCalledWith(expect.objectContaining({
      customerId: 9,
      address: '14 Elm Grove',
      phone: '07700 900100',
      email: 'dave@example.com',
      meta: { site_id: 11, phone_id: 21, email_id: 31 },
    }));
  });

  test('leaves omitted existing-customer contacts unselected', async () => {
    contacts.loadCustomerWithContacts.mockResolvedValue({ id: 9, name: 'Dave Whitfield' });
    contacts.resolveCustomerContactSelection.mockResolvedValue({
      site_id: null,
      phone_id: null,
      email_id: null,
      site: null,
      phone: null,
      email: null,
    });

    const res = await request(app).post('/api/leads').send({
      source: 'manual',
      customer_id: 9,
      message: 'Walk-in',
    });
    expect(res.status).toBe(200);
    expect(ingestInbound).toHaveBeenCalledWith(expect.objectContaining({
      customerId: 9,
      phone: null,
      email: null,
      address: null,
      meta: { site_id: null, phone_id: null, email_id: null },
    }));
  });

  test('rejects a missing or unknown existing customer', async () => {
    const bad = await request(app).post('/api/leads').send({ source: 'phone', customer_id: 0 });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('Pick a customer');
    expect(contacts.loadCustomerWithContacts).not.toHaveBeenCalled();

    contacts.loadCustomerWithContacts.mockResolvedValue(null);
    const missing = await request(app).post('/api/leads').send({ source: 'phone', customer_id: 99 });
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe('Customer not found');
    expect(ingestInbound).not.toHaveBeenCalled();
  });
});

describe('PUT /api/leads/:id (requirement 3.4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __setUser({ id: 2, role: 'OFFICE', name: 'Lisa' });
  });

  test('Mark actioned does not require next_action', async () => {
    const update = jest.fn();
    Lead.findByPk.mockResolvedValue({
      id: 1, status: 'NEW', next_action: 'Review & respond', update,
    });
    const res = await request(app).put('/api/leads/1').send({ status: 'ACTIONED' });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ status: 'ACTIONED' });
  });
});
