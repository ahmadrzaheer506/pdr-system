jest.mock('../models', () => {
  const contactModel = () => ({
    create: jest.fn(),
    findByPk: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    destroy: jest.fn(),
    count: jest.fn(),
  });
  return {
    sequelize: { transaction: jest.fn(async (fn) => fn({})) },
    Customer: { create: jest.fn(), findByPk: jest.fn(), findAll: jest.fn(), update: jest.fn() },
    CustomerSite: contactModel(),
    CustomerPhone: contactModel(),
    CustomerEmail: contactModel(),
    CustomerNote: contactModel(),
    CustomerFile: contactModel(),
    Quote: {},
    Task: {},
    Message: {},
    Activity: {},
    Job: { update: jest.fn() },
    JobAssignment: {},
    User: { findByPk: jest.fn(), findAll: jest.fn() },
    Invoice: {},
    Appointment: { update: jest.fn() },
    Lead: { create: jest.fn(), findAll: jest.fn(), findOne: jest.fn(), update: jest.fn() },
    Followup: {},
    StageHistory: {},
  };
});
jest.mock('../services/pipeline', () => ({
  STAGES: ['ENQUIRY'],
  STAGE_LABELS: { ENQUIRY: 'Enquiry' },
  setStage: jest.fn(),
  logActivity: jest.fn(),
  resolveLeadForCustomer: jest.fn(),
}));
jest.mock('../services/messenger', () => ({
  sendToCustomer: jest.fn(),
}));
jest.mock('../db', () => ({
  plain: (row) => (row && typeof row.toJSON === 'function' ? row.toJSON() : row),
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
const { Customer, CustomerPhone, CustomerSite, CustomerEmail, User, Lead } = require('../models');
const { logActivity, setStage, resolveLeadForCustomer } = require('../services/pipeline');
const { __setUser } = require('../auth');
const { resolveCustomerType, typeFields, CUSTOMER_TYPES } = require('../customerType');
const customers = require('../routes/customers');

const app = express();
app.use(express.json());
app.use('/api/customers', customers);
app.use((err, req, res, next) => { res.status(500).json({ error: err.message }); });

describe('customer type helpers (requirement 2.1)', () => {
  test('stored values are domestic and commercial', () => {
    expect(CUSTOMER_TYPES).toEqual(['domestic', 'commercial']);
  });

  test('omitted type falls back; unknown values are rejected', () => {
    expect(resolveCustomerType(undefined).value).toBe('domestic');
    expect(resolveCustomerType(undefined, 'commercial').value).toBe('commercial');
    expect(resolveCustomerType('business').error).toBe('Invalid customer type');
    expect(resolveCustomerType('DOMESTIC').error).toBe('Invalid customer type');
  });

  test('domestic clears company and VAT even if they were sent', () => {
    expect(typeFields('domestic', { company_name: 'Acme Ltd', vat_number: 'GB 123' })).toEqual({
      customer_type: 'domestic', company_name: null, vat_number: null,
    });
  });

  test('commercial requires a company name; VAT is optional', () => {
    expect(typeFields('commercial', { company_name: '  ', vat_number: 'GB1' }).error).toMatch(/Company name is required/);
    expect(typeFields('commercial', { company_name: ' Acme Ltd ', vat_number: null })).toEqual({
      customer_type: 'commercial', company_name: 'Acme Ltd', vat_number: null,
    });
    expect(typeFields('commercial', {}, { company_name: 'Acme Ltd', vat_number: 'GB 123' })).toEqual({
      customer_type: 'commercial', company_name: 'Acme Ltd', vat_number: 'GB 123',
    });
  });
});

describe('POST /api/customers (requirement 2.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __setUser({ id: 1, role: 'ADMIN', name: 'Paul' });
    Customer.create.mockResolvedValue({ id: 42 });
    Lead.create.mockResolvedValue({ id: 90 });
  });

  test('defaults to domestic and ignores company/VAT when type is omitted', async () => {
    const res = await request(app).post('/api/customers').send({
      name: 'Dave Whitfield', company_name: 'Should Clear', vat_number: 'GB1',
    });
    expect(res.status).toBe(200);
    expect(Customer.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Dave Whitfield',
      customer_type: 'domestic',
      company_name: null,
      vat_number: null,
      owner_id: 1,
    }));
    expect(logActivity).toHaveBeenCalled();
    expect(Lead.create).toHaveBeenCalledWith(expect.objectContaining({
      customer_id: 42,
      stage: 'ENQUIRY',
      status: 'NEW',
    }));
  });

  test('creates a commercial record with company name and optional VAT', async () => {
    const res = await request(app).post('/api/customers').send({
      name: 'Jane Site',
      customer_type: 'commercial',
      company_name: 'Site Roofing Ltd',
      vat_number: 'GB 123 4567 89',
    });
    expect(res.status).toBe(200);
    expect(Customer.create).toHaveBeenCalledWith(expect.objectContaining({
      customer_type: 'commercial',
      company_name: 'Site Roofing Ltd',
      vat_number: 'GB 123 4567 89',
    }));
  });

  test('rejects commercial without a company name and rejects unknown types', async () => {
    const missing = await request(app).post('/api/customers').send({
      name: 'Jane', customer_type: 'commercial',
    });
    expect(missing.status).toBe(400);
    expect(missing.body.error).toMatch(/Company name is required/);
    const bad = await request(app).post('/api/customers').send({
      name: 'Jane', customer_type: 'business',
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('Invalid customer type');
    expect(Customer.create).not.toHaveBeenCalled();
  });

  test('STAFF receives 403', async () => {
    __setUser({ id: 3, role: 'STAFF', name: 'Jamie' });
    const res = await request(app).post('/api/customers').send({ name: 'Dave' });
    expect(res.status).toBe(403);
    expect(Customer.create).not.toHaveBeenCalled();
  });
});

describe('PUT /api/customers/:id (requirement 2.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __setUser({ id: 1, role: 'ADMIN', name: 'Paul' });
  });

  function row(overrides = {}) {
    const update = overrides.update || jest.fn();
    return {
      id: 9,
      name: 'Dave Whitfield',
      customer_type: 'domestic',
      company_name: null,
      vat_number: null,
      ...overrides,
      update,
    };
  }

  test('switches domestic to commercial when company name is provided', async () => {
    const c = row();
    Customer.findByPk.mockResolvedValue(c);
    const res = await request(app).put('/api/customers/9').send({
      customer_type: 'commercial', company_name: 'Whitfield Roofing',
    });
    expect(res.status).toBe(200);
    expect(c.update).toHaveBeenCalledWith(expect.objectContaining({
      customer_type: 'commercial', company_name: 'Whitfield Roofing', vat_number: null,
    }));
  });

  test('clears company and VAT when switching back to domestic', async () => {
    const c = row({
      customer_type: 'commercial', company_name: 'Acme Ltd', vat_number: 'GB1',
    });
    Customer.findByPk.mockResolvedValue(c);
    const res = await request(app).put('/api/customers/9').send({ customer_type: 'domestic' });
    expect(res.status).toBe(200);
    expect(c.update).toHaveBeenCalledWith(expect.objectContaining({
      customer_type: 'domestic', company_name: null, vat_number: null,
    }));
  });

  test('name-only edit on a commercial customer does not drop company fields', async () => {
    const c = row({
      customer_type: 'commercial', company_name: 'Acme Ltd', vat_number: 'GB1',
    });
    Customer.findByPk.mockResolvedValue(c);
    const res = await request(app).put('/api/customers/9').send({ name: 'Dave Updated' });
    expect(res.status).toBe(200);
    expect(c.update).toHaveBeenCalledWith({ name: 'Dave Updated' });
  });

  test('rejects commercial conversion without a company name', async () => {
    const c = row();
    Customer.findByPk.mockResolvedValue(c);
    const res = await request(app).put('/api/customers/9').send({ customer_type: 'commercial' });
    expect(res.status).toBe(400);
    expect(c.update).not.toHaveBeenCalled();
  });

  test('OFFICE may edit; STAFF receives 403', async () => {
    const c = row();
    Customer.findByPk.mockResolvedValue(c);
    __setUser({ id: 2, role: 'OFFICE', name: 'Lisa' });
    const ok = await request(app).put('/api/customers/9').send({ name: 'Dave' });
    expect(ok.status).toBe(200);
    __setUser({ id: 3, role: 'STAFF', name: 'Jamie' });
    const denied = await request(app).put('/api/customers/9').send({ name: 'Dave' });
    expect(denied.status).toBe(403);
  });
});

describe('customer owner (requirement 4.4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __setUser({ id: 1, role: 'ADMIN', name: 'Paul' });
    Customer.create.mockResolvedValue({ id: 42 });
  });

  test('POST auto-assigns the creating office user', async () => {
    __setUser({ id: 2, role: 'OFFICE', name: 'Lisa' });
    const res = await request(app).post('/api/customers').send({ name: 'Dave Whitfield' });
    expect(res.status).toBe(200);
    expect(Customer.create).toHaveBeenCalledWith(expect.objectContaining({ owner_id: 2 }));
  });

  test('PUT assigns an active office owner and can unassign', async () => {
    const c = { id: 9, update: jest.fn() };
    Customer.findByPk.mockResolvedValue(c);
    User.findByPk.mockResolvedValue({ id: 2, active: true, role: 'OFFICE' });
    const assign = await request(app).put('/api/customers/9').send({ owner_id: 2 });
    expect(assign.status).toBe(200);
    expect(c.update).toHaveBeenCalledWith({ owner_id: 2 });

    const clear = await request(app).put('/api/customers/9').send({ owner_id: null });
    expect(clear.status).toBe(200);
    expect(c.update).toHaveBeenCalledWith({ owner_id: null });
  });

  test('PUT rejects a staff owner', async () => {
    const c = { id: 9, update: jest.fn() };
    Customer.findByPk.mockResolvedValue(c);
    User.findByPk.mockResolvedValue({ id: 3, active: true, role: 'STAFF' });
    const res = await request(app).put('/api/customers/9').send({ owner_id: 3 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Owner must be an active office user');
    expect(c.update).not.toHaveBeenCalled();
  });
});

describe('customer contacts (requirement 2.2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __setUser({ id: 1, role: 'ADMIN', name: 'Paul' });
    Customer.create.mockResolvedValue({ id: 42 });
    Customer.findByPk.mockResolvedValue({ id: 9, name: 'Dave' });
    CustomerPhone.count.mockResolvedValue(0);
    CustomerPhone.create.mockResolvedValue({
      id: 1, value: '07700 900100', type: 'mobile', is_primary: true,
    });
    CustomerSite.count.mockResolvedValue(0);
    CustomerSite.create.mockResolvedValue({
      id: 3, address: '14 Elm Grove', postcode: 'RG1 5AB', is_primary: true,
    });
    CustomerEmail.count.mockResolvedValue(0);
    CustomerEmail.create.mockResolvedValue({
      id: 2, value: 'dave@example.com', type: 'personal', is_primary: true,
    });
  });

  test('POST creates the first phone, email, and site as primary', async () => {
    const res = await request(app).post('/api/customers').send({
      name: 'Dave Whitfield',
      phones: [{ value: '07700 900100', type: 'mobile' }],
      emails: [{ value: 'dave@example.com', type: 'work' }],
      sites: [{ address: '14 Elm Grove', postcode: 'RG1 5AB' }],
    });
    expect(res.status).toBe(200);
    expect(Customer.create).toHaveBeenCalledWith(expect.not.objectContaining({
      phone: expect.anything(),
      email: expect.anything(),
      address: expect.anything(),
    }));
    expect(CustomerPhone.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer_id: 42, value: '07700 900100', normalised: '07700900100', type: 'mobile', is_primary: true,
      }),
      expect.any(Object),
    );
    expect(CustomerEmail.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer_id: 42, value: 'dave@example.com', type: 'work', is_primary: true }),
      expect.any(Object),
    );
    expect(CustomerSite.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer_id: 42, address: '14 Elm Grove', postcode: 'RG1 5AB', is_primary: true }),
      expect.any(Object),
    );
  });

  test('POST rejects two primary phones and an unknown phone type', async () => {
    const two = await request(app).post('/api/customers').send({
      name: 'Dave',
      phones: [
        { value: '07700', type: 'mobile', is_primary: true },
        { value: '0118', type: 'landline', is_primary: true },
      ],
    });
    expect(two.status).toBe(400);
    expect(two.body.error).toMatch(/Exactly one primary/);
    const badType = await request(app).post('/api/customers').send({
      name: 'Dave',
      phones: [{ value: '07700', type: 'fax' }],
    });
    expect(badType.status).toBe(400);
    expect(badType.body.error).toBe('Invalid phone type');
    expect(Customer.create).not.toHaveBeenCalled();
  });

  test('POST nested phone on an existing customer', async () => {
    const res = await request(app).post('/api/customers/9/phones').send({
      value: '07700 900100', type: 'mobile',
    });
    expect(res.status).toBe(200);
    expect(CustomerPhone.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customer_id: 9, value: '07700 900100', normalised: '07700900100', type: 'mobile', is_primary: true,
      }),
      expect.any(Object),
    );
  });

  test('STAFF cannot manage contacts', async () => {
    __setUser({ id: 3, role: 'STAFF', name: 'Jamie' });
    const res = await request(app).post('/api/customers/9/sites').send({ address: '1 Test Road' });
    expect(res.status).toBe(403);
    expect(CustomerSite.create).not.toHaveBeenCalled();
  });
});

describe('GET /api/customers (customer list)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __setUser({ id: 1, role: 'ADMIN', name: 'Paul' });
    Customer.findAll.mockResolvedValue([
      { id: 9, name: 'Dave Whitfield', customer_type: 'domestic', stage: 'ENQUIRY' },
    ]);
  });

  test('returns the customer list for ADMIN', async () => {
    const res = await request(app).get('/api/customers');
    expect(res.status).toBe(200);
    expect(res.body.customers).toEqual([
      expect.objectContaining({ id: 9, name: 'Dave Whitfield' }),
    ]);
  });

  test('filters by customer_type and rejects unknown types', async () => {
    const ok = await request(app).get('/api/customers?customer_type=commercial');
    expect(ok.status).toBe(200);
    expect(Customer.findAll).toHaveBeenCalledWith(expect.objectContaining({
      where: { [Op.and]: expect.arrayContaining([{ customer_type: 'commercial' }]) },
    }));
    const bad = await request(app).get('/api/customers?customer_type=business');
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('Invalid customer type');
  });

  test('rejects an invalid created_from date', async () => {
    const res = await request(app).get('/api/customers?created_from=22-09-2026');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid created_from date');
    expect(Customer.findAll).not.toHaveBeenCalled();
  });

  test('OFFICE may list; STAFF receives 403', async () => {
    __setUser({ id: 2, role: 'OFFICE', name: 'Lisa' });
    const ok = await request(app).get('/api/customers');
    expect(ok.status).toBe(200);
    __setUser({ id: 3, role: 'STAFF', name: 'Jamie' });
    const denied = await request(app).get('/api/customers');
    expect(denied.status).toBe(403);
    expect(Customer.findAll).toHaveBeenCalledTimes(1);
  });
});

describe('PUT /api/customers/:id/stage lost reason (requirement 2.6)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __setUser({ id: 1, role: 'ADMIN', name: 'Paul' });
    Customer.update.mockResolvedValue([1]);
    setStage.mockResolvedValue('LOST');
  });

  test('rejects LOST without a pick-list reason and does not change stage', async () => {
    Customer.findByPk.mockResolvedValue({ id: 9, stage: 'ENQUIRY' });
    const res = await request(app).put('/api/customers/9/stage').send({ stage: 'LOST' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Select a lost reason');
    expect(setStage).not.toHaveBeenCalled();
    expect(Customer.update).not.toHaveBeenCalled();
  });

  test('stores the selected reason when moving to LOST', async () => {
    Customer.findByPk.mockResolvedValue({ id: 9, stage: 'QUOTED' });
    const res = await request(app).put('/api/customers/9/stage').send({
      stage: 'LOST',
      lost_reason_code: 'cheaper_quote',
    });
    expect(res.status).toBe(200);
    expect(setStage).toHaveBeenCalledWith(9, 'LOST', 1, undefined, { beforeId: null });
    expect(Customer.update).toHaveBeenCalledWith(
      { lost_reason: 'Cheaper quote' },
      { where: { id: '9' } },
    );
  });

  test('stores Other with an optional note', async () => {
    Customer.findByPk.mockResolvedValue({ id: 9, stage: 'ENQUIRY' });
    const res = await request(app).put('/api/customers/9/stage').send({
      stage: 'LOST',
      lost_reason_code: 'other',
      lost_reason_note: 'Went with a neighbour',
    });
    expect(res.status).toBe(200);
    expect(Customer.update).toHaveBeenCalledWith(
      { lost_reason: 'Other — Went with a neighbour' },
      { where: { id: '9' } },
    );
  });

  test('clears lost_reason when leaving LOST', async () => {
    Customer.findByPk.mockResolvedValue({ id: 9, stage: 'LOST' });
    setStage.mockResolvedValue('ENQUIRY');
    const res = await request(app).put('/api/customers/9/stage').send({ stage: 'ENQUIRY' });
    expect(res.status).toBe(200);
    expect(Customer.update).toHaveBeenCalledWith(
      { lost_reason: null },
      { where: { id: '9' } },
    );
  });

  test('does not require a new reason when already LOST', async () => {
    Customer.findByPk.mockResolvedValue({ id: 9, stage: 'LOST' });
    setStage.mockResolvedValue('LOST');
    const res = await request(app).put('/api/customers/9/stage').send({ stage: 'LOST' });
    expect(res.status).toBe(200);
    expect(Customer.update).not.toHaveBeenCalled();
  });

  test('forwards before_id so cards can be reordered in a column (requirement 4.2)', async () => {
    Customer.findByPk.mockResolvedValue({ id: 9, stage: 'ENQUIRY' });
    setStage.mockResolvedValue('PAID');
    const res = await request(app).put('/api/customers/9/stage').send({
      stage: 'PAID',
      before_id: 4,
    });
    expect(res.status).toBe(200);
    expect(setStage).toHaveBeenCalledWith(9, 'PAID', 1, undefined, { beforeId: 4 });
  });

  test('moves one enquiry when lead_id is sent, not every job on the customer', async () => {
    Customer.findByPk.mockResolvedValue({ id: 9, stage: 'WON' });
    resolveLeadForCustomer.mockResolvedValue({ id: 41, stage: 'ENQUIRY' });
    Lead.update.mockResolvedValue([1]);
    setStage.mockResolvedValue('LOST');
    const res = await request(app).put('/api/customers/9/stage').send({
      stage: 'LOST',
      lead_id: 41,
      lost_reason_code: 'cheaper_quote',
    });
    expect(res.status).toBe(200);
    expect(resolveLeadForCustomer).toHaveBeenCalledWith(9, 41);
    expect(setStage).toHaveBeenCalledWith(9, 'LOST', 1, undefined, { beforeId: null, leadId: 41 });
    expect(Lead.update).toHaveBeenCalledWith(
      { lost_reason: 'Cheaper quote' },
      { where: { id: 41, customer_id: '9' } },
    );
  });
});
