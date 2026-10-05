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
    sequelize: { transaction: jest.fn(async (fn) => fn({})), escape: (v) => `'${v}'` },
    Customer: { create: jest.fn(), findByPk: jest.fn(), findAll: jest.fn(), update: jest.fn(), sequelize: { escape: (v) => `'${String(v).replace(/'/g, "''")}'` } },
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
    User: {},
    Invoice: {},
    Appointment: { update: jest.fn() },
    Lead: { create: jest.fn().mockResolvedValue({ id: 1 }), findAll: jest.fn(), findOne: jest.fn(), update: jest.fn() },
    Followup: {},
    StageHistory: {},
  };
});
jest.mock('../services/pipeline', () => ({
  STAGES: ['ENQUIRY'],
  STAGE_LABELS: { ENQUIRY: 'Enquiry' },
  setStage: jest.fn(),
  logActivity: jest.fn(),
}));
jest.mock('../services/messenger', () => ({ sendToCustomer: jest.fn() }));
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
const { Customer, CustomerPhone, CustomerEmail } = require('../models');
const { __setUser } = require('../auth');
const customers = require('../routes/customers');

const app = express();
app.use(express.json());
app.use('/api/customers', customers);
app.use((err, req, res, next) => { res.status(500).json({ error: err.message }); });

describe('duplicate contacts (requirement 2.5)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __setUser({ id: 1, role: 'ADMIN', name: 'Paul' });
    Customer.create.mockResolvedValue({ id: 99 });
    Customer.findByPk.mockResolvedValue({ id: 9, name: 'Dave Whitfield' });
    CustomerPhone.findOne.mockResolvedValue(null);
    CustomerEmail.findOne.mockResolvedValue(null);
    CustomerPhone.count.mockResolvedValue(0);
    CustomerPhone.create.mockResolvedValue({ id: 1, value: '07700 900100', type: 'mobile', is_primary: true });
    CustomerEmail.count.mockResolvedValue(0);
    CustomerEmail.create.mockResolvedValue({ id: 2, value: 'dave@example.com', type: 'personal', is_primary: true });
  });

  test('POST create returns 409 when the phone already belongs to a customer', async () => {
    CustomerPhone.findOne.mockResolvedValue({
      customer_id: 7,
      Customer: { id: 7, name: 'Helen Ackroyd' },
    });
    const res = await request(app).post('/api/customers').send({
      name: 'Someone New',
      phones: [{ value: '+44 7700 900100', type: 'mobile' }],
    });
    expect(res.status).toBe(409);
    expect(res.body.customer_id).toBe(7);
    expect(res.body.name).toBe('Helen Ackroyd');
    expect(res.body.error).toMatch(/Helen Ackroyd/);
    expect(Customer.create).not.toHaveBeenCalled();
  });

  test('POST create returns 409 when the email already belongs to a customer', async () => {
    CustomerEmail.findOne.mockResolvedValue({
      customer_id: 8,
      Customer: { id: 8, name: 'Priya Nair' },
    });
    const res = await request(app).post('/api/customers').send({
      name: 'Someone New',
      emails: [{ value: 'priya.nair@example.co.uk', type: 'personal' }],
    });
    expect(res.status).toBe(409);
    expect(res.body.customer_id).toBe(8);
    expect(Customer.create).not.toHaveBeenCalled();
  });

  test('POST /phones returns 409 so office must open the existing customer', async () => {
    CustomerPhone.findOne.mockResolvedValue({
      customer_id: 7,
      Customer: { id: 7, name: 'Helen Ackroyd' },
    });
    const res = await request(app).post('/api/customers/9/phones').send({
      value: '07700 900100', type: 'mobile',
    });
    expect(res.status).toBe(409);
    expect(res.body.customer_id).toBe(7);
    expect(CustomerPhone.create).not.toHaveBeenCalled();
  });

  test('POST /emails is case-insensitive on the match', async () => {
    CustomerEmail.findOne.mockResolvedValue({
      customer_id: 8,
      Customer: { id: 8, name: 'Priya Nair' },
    });
    const res = await request(app).post('/api/customers/9/emails').send({
      value: 'PRIYA.NAIR@example.co.uk', type: 'personal',
    });
    expect(res.status).toBe(409);
    expect(CustomerEmail.create).not.toHaveBeenCalled();
  });

  test('STAFF still cannot create a customer', async () => {
    __setUser({ id: 3, role: 'STAFF', name: 'Jamie' });
    const res = await request(app).post('/api/customers').send({ name: 'Nope' });
    expect(res.status).toBe(403);
  });
});

describe('findEnquiryOwner (requirement 3.4)', () => {
  const { findEnquiryOwner } = require('../customerDuplicates');

  beforeEach(() => {
    jest.clearAllMocks();
    CustomerPhone.findOne.mockResolvedValue(null);
    CustomerEmail.findOne.mockResolvedValue(null);
  });

  test('matches phone first and does not look up email when the phone hits', async () => {
    CustomerPhone.findOne.mockResolvedValue({
      customer_id: 9,
      Customer: { id: 9, name: 'Dave Whitfield' },
    });
    CustomerEmail.findOne.mockResolvedValue({
      customer_id: 8,
      Customer: { id: 8, name: 'Priya Nair' },
    });
    const hit = await findEnquiryOwner('+44 7911 223344', 'priya@example.com');
    expect(hit).toMatchObject({ status: 409, customer_id: 9, name: 'Dave Whitfield' });
    expect(CustomerEmail.findOne).not.toHaveBeenCalled();
  });

  test('falls through to email when phone is empty or unknown', async () => {
    CustomerEmail.findOne.mockResolvedValue({
      customer_id: 8,
      Customer: { id: 8, name: 'Priya Nair' },
    });
    const emptyPhone = await findEnquiryOwner('', 'priya@example.com');
    expect(emptyPhone).toMatchObject({ status: 409, customer_id: 8, name: 'Priya Nair' });
    expect(CustomerPhone.findOne).not.toHaveBeenCalled();

    CustomerPhone.findOne.mockResolvedValue(null);
    const unknownPhone = await findEnquiryOwner('07700 000000', 'priya@example.com');
    expect(unknownPhone).toMatchObject({ status: 409, customer_id: 8 });
    expect(CustomerPhone.findOne).toHaveBeenCalled();
  });

  test('returns null when neither phone nor email is on a customer', async () => {
    expect(await findEnquiryOwner('07700 000000', 'new@example.com')).toBeNull();
  });
});
