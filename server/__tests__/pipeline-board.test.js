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
    Customer: { create: jest.fn(), findByPk: jest.fn(), findAll: jest.fn(), update: jest.fn() },
    CustomerSite: contactModel(),
    CustomerPhone: contactModel(),
    CustomerEmail: contactModel(),
    CustomerNote: contactModel(),
    CustomerFile: contactModel(),
    Quote: {},
    Task: {},
    Message: {},
    Activity: { create: jest.fn() },
    Job: { update: jest.fn() },
    JobAssignment: {},
    User: { findAll: jest.fn(), findByPk: jest.fn() },
    Invoice: {},
    Appointment: { update: jest.fn() },
    Lead: { findAll: jest.fn(), findOne: jest.fn(), update: jest.fn() },
    Followup: {},
    StageHistory: { create: jest.fn() },
  };
});
jest.mock('../services/messenger', () => ({ sendToCustomer: jest.fn() }));
jest.mock('../db', () => ({
  plain: (row) => {
    if (row == null) return null;
    if (Array.isArray(row)) {
      return row.map((r) => (r && typeof r.toJSON === 'function' ? r.toJSON() : r));
    }
    return typeof row.toJSON === 'function' ? row.toJSON() : row;
  },
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
const { Customer, User, Lead } = require('../models');
const { STAGES } = require('../services/pipeline');
const { __setUser } = require('../auth');
const customers = require('../routes/customers');

const app = express();
app.use(express.json());
app.use('/api/customers', customers);
app.use((err, req, res, next) => { res.status(500).json({ error: err.message }); });

describe('GET /api/customers/pipeline/board (requirement 4.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __setUser({ id: 1, role: 'ADMIN', name: 'Paul' });
    Lead.findAll.mockResolvedValue([
      { toJSON: () => ({
        id: 11, customer_id: 1, stage: 'ENQUIRY', source: 'whatsapp',
        latest_quote_total: 2400, open_tasks: 2,
        Customer: { id: 1, name: 'Dave Whitfield' },
      }) },
      { toJSON: () => ({
        id: 22, customer_id: 2, stage: 'PAID', source: 'referral',
        latest_quote_total: 8900, open_tasks: 0,
        Customer: { id: 2, name: 'Helen Ackroyd' },
      }) },
    ]);
    Customer.findAll.mockResolvedValue([
      { toJSON: () => ({ id: 1, name: 'Dave Whitfield', company_name: null }) },
      { toJSON: () => ({ id: 2, name: 'Helen Ackroyd', company_name: null }) },
    ]);
    User.findAll.mockResolvedValue([
      { id: 1, name: 'Paul Douglas' },
      { id: 2, name: 'Lisa Grant' },
    ]);
  });

  test('returns every current column including Paid', async () => {
    const res = await request(app).get('/api/customers/pipeline/board');
    expect(res.status).toBe(200);
    expect(res.body.stages).toEqual(STAGES);
    expect(res.body.stages).toHaveLength(12);
    expect(res.body.stages[11]).toBe('PAID');
    expect(res.body.labels.PAID).toBe('Paid');
    expect(res.body.board.ENQUIRY.map((c) => c.name)).toEqual(['Dave Whitfield']);
    expect(res.body.board.PAID.map((c) => c.name)).toEqual(['Helen Ackroyd']);
    expect(res.body.board.INVOICED).toEqual([]);
    expect(res.body.owners).toEqual([
      { id: 1, name: 'Paul Douglas' },
      { id: 2, name: 'Lisa Grant' },
    ]);
    expect(res.body.customers).toEqual([
      { id: 1, name: 'Dave Whitfield', company_name: null },
      { id: 2, name: 'Helen Ackroyd', company_name: null },
    ]);
    expect(Lead.findAll).toHaveBeenCalledWith(expect.objectContaining({
      order: [['board_order', 'ASC'], ['id', 'ASC']],
    }));
  });

  test('STAFF cannot open the board', async () => {
    __setUser({ id: 3, role: 'STAFF', name: 'Jamie' });
    const res = await request(app).get('/api/customers/pipeline/board');
    expect(res.status).toBe(403);
    expect(Lead.findAll).not.toHaveBeenCalled();
  });
});

describe('GET /api/customers/pipeline/board filters (requirement 4.4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __setUser({ id: 1, role: 'ADMIN', name: 'Paul' });
    Lead.findAll.mockResolvedValue([]);
    Customer.findAll.mockResolvedValue([]);
    User.findAll.mockResolvedValue([{ id: 1, name: 'Paul Douglas' }]);
  });

  test('ANDs source (multi), owner, created_at, and latest-quote value', async () => {
    const res = await request(app).get(
      '/api/customers/pipeline/board?source=whatsapp&source=email&owner_id=1&created_from=2026-01-01&created_to=2026-09-23&value_min=1000&value_max=9000',
    );
    expect(res.status).toBe(200);
    const leadCall = Lead.findAll.mock.calls[0][0];
    const and = leadCall.where[Op.and];
    expect(and).toEqual(expect.arrayContaining([
      { source: { [Op.in]: ['whatsapp', 'email'] } },
      { created_at: { [Op.gte]: '2026-01-01T00:00:00.000Z', [Op.lte]: '2026-09-23T23:59:59.999Z' } },
    ]));
    expect(leadCall.include[0].where[Op.and]).toEqual(expect.arrayContaining([{ owner_id: 1 }]));
    expect(and.some((c) => c.val && /q\.total/.test(c.val) && />= 1000/.test(c.val))).toBe(true);
    expect(and.some((c) => c.val && /COALESCE/.test(c.val) && /<= 9000/.test(c.val))).toBe(true);
  });

  test('filters unassigned owners', async () => {
    const res = await request(app).get('/api/customers/pipeline/board?owner_id=unassigned');
    expect(res.status).toBe(200);
    expect(Lead.findAll.mock.calls[0][0].include[0].where[Op.and]).toEqual(
      expect.arrayContaining([{ owner_id: null }]),
    );
  });

  test('filters a single customer', async () => {
    const res = await request(app).get('/api/customers/pipeline/board?customer_id=9');
    expect(res.status).toBe(200);
    expect(Lead.findAll.mock.calls[0][0].where[Op.and]).toEqual(
      expect.arrayContaining([{ customer_id: 9 }]),
    );
  });

  test('rejects an inverted quote range', async () => {
    const res = await request(app).get('/api/customers/pipeline/board?value_min=5000&value_max=1000');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('value_min must be on or below value_max');
    expect(Lead.findAll).not.toHaveBeenCalled();
  });
});

describe('GET /api/customers/pipeline/board totals (requirement 4.5)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __setUser({ id: 1, role: 'ADMIN', name: 'Paul' });
    User.findAll.mockResolvedValue([]);
  });

  test('sums sent/draft quote value on Enquiry → Follow-up and ignores Paid', async () => {
    Lead.findAll.mockResolvedValue([
      { toJSON: () => ({ id: 1, customer_id: 1, name: 'Dave', stage: 'ENQUIRY', pipeline_value: 1000, Customer: { name: 'Dave' } }) },
      { toJSON: () => ({ id: 2, customer_id: 2, name: 'Grace', stage: 'QUOTED', pipeline_value: 400, Customer: { name: 'Grace' } }) },
      { toJSON: () => ({ id: 3, customer_id: 3, name: 'Helen', stage: 'PAID', pipeline_value: 8000, Customer: { name: 'Helen' } }) },
    ]);
    Customer.findAll.mockResolvedValue([]);
    const res = await request(app).get('/api/customers/pipeline/board');
    expect(res.status).toBe(200);
    expect(res.body.totals.board).toBe(1400);
    expect(res.body.totals.byStage.ENQUIRY).toBe(1000);
    expect(res.body.totals.byStage.QUOTED).toBe(400);
    expect(res.body.totals.byStage.PAID).toBeNull();
    expect(res.body.totals.byStage.LOST).toBeNull();
    const include = Lead.findAll.mock.calls[0][0].attributes.include;
    expect(include.some((col) => Array.isArray(col) && col[1] === 'pipeline_value')).toBe(true);
    const pipelineCol = include.find((col) => Array.isArray(col) && col[1] === 'pipeline_value');
    expect(String(pipelineCol[0].val || pipelineCol[0])).toMatch(/ORDER BY q\.id DESC LIMIT 1/);
    expect(String(pipelineCol[0].val || pipelineCol[0])).toMatch(/q\.lead_id/);
    expect(String(pipelineCol[0].val || pipelineCol[0])).not.toMatch(/SUM\(/);
  });

  test('returns one card per enquiry even when they share a customer', async () => {
    Lead.findAll.mockResolvedValue([
      { toJSON: () => ({ id: 40, customer_id: 27, stage: 'ENQUIRY', Customer: { name: 'M Iman' } }) },
      { toJSON: () => ({ id: 41, customer_id: 27, stage: 'LOST', Customer: { name: 'M Iman' } }) },
    ]);
    Customer.findAll.mockResolvedValue([]);
    const res = await request(app).get('/api/customers/pipeline/board');
    expect(res.status).toBe(200);
    expect(res.body.board.ENQUIRY).toEqual([expect.objectContaining({
      id: 40, lead_id: 40, customer_id: 27, name: 'M Iman', stage: 'ENQUIRY',
    })]);
    expect(res.body.board.LOST).toEqual([expect.objectContaining({
      id: 41, lead_id: 41, customer_id: 27, name: 'M Iman', stage: 'LOST',
    })]);
  });
});
