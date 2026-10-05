jest.mock('../models', () => ({
  Lead: { findAll: jest.fn() },
  Quote: { findOne: jest.fn(), findAll: jest.fn() },
  Customer: { findAll: jest.fn() },
  Job: { findAll: jest.fn() },
  Invoice: { findAll: jest.fn() },
  Timesheet: {},
  User: {},
  InvoicePayment: {},
  Activity: {},
  StageHistory: {},
}));
jest.mock('../invoicePayments', () => ({
  outstanding: (inv) => Math.max(0, Number(inv.due_now || 0) - Number(inv.amount_paid || 0)),
}));

const { Lead, Quote, Customer, Job, Invoice } = require('../models');
const {
  parseReportRange, winRate, leadVolume, winLoss, pipelineValueSnapshot,
  listCustomers, listJobs, listInvoices, listProfitability,
} = require('../reports');

describe('parseReportRange (requirement 14.1)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-28T12:00:00.000Z'));
  });
  afterEach(() => jest.useRealTimers());

  test('defaults to the last 30 days', () => {
    const range = parseReportRange({});
    expect(range.from).toBe('2026-08-29');
    expect(range.to).toBe('2026-09-28');
  });

  test('rejects a lone from or to', () => {
    expect(parseReportRange({ from: '2026-09-01' }).error).toMatch(/together/);
    expect(parseReportRange({ to: '2026-09-01' }).error).toMatch(/together/);
  });

  test('rejects inverted and invalid dates', () => {
    expect(parseReportRange({ from: '2026-09-10', to: '2026-09-01' }).error).toMatch(/on or before/);
    expect(parseReportRange({ from: 'nope', to: '2026-09-01' }).error).toMatch(/Invalid from/);
  });

  test('required range needs both from and to', () => {
    expect(parseReportRange({}, { required: true }).error).toMatch(/required/);
    expect(parseReportRange({ from: '2026-09-01', to: '2026-09-10' }, { required: true }).from).toBe('2026-09-01');
  });
});

describe('winRate', () => {
  test('is null when nothing was decided', () => {
    expect(winRate(0, 0)).toBeNull();
    expect(winRate(2, 2)).toBe(50);
  });
});

describe('winLoss (requirement 14.1)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('counts current WON vs LOST and groups lost reasons', async () => {
    Customer.findAll.mockResolvedValue([
      { id: 1, name: 'Helen', stage: 'WON', lost_reason: null, updated_at: '2026-09-20T10:00:00.000Z', toJSON() { return this; } },
      { id: 2, name: 'Dave', stage: 'LOST', lost_reason: 'Cheaper quote', updated_at: '2026-09-21T10:00:00.000Z', toJSON() { return this; } },
      { id: 3, name: 'Priya', stage: 'LOST', lost_reason: 'Cheaper quote', updated_at: '2026-09-22T10:00:00.000Z', toJSON() { return this; } },
    ]);
    const fromDt = new Date('2026-08-29T00:00:00.000Z');
    const toDt = new Date('2026-09-28T23:59:59.999Z');
    const data = await winLoss(fromDt, toDt);
    expect(Customer.findAll).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        stage: { [require('sequelize').Op.in]: ['WON', 'LOST'] },
      }),
    }));
    expect(data.won).toBe(1);
    expect(data.lost).toBe(2);
    expect(data.winRate).toBe(33.3);
    expect(data.byReason).toEqual([{ reason: 'Cheaper quote', count: 2 }]);
    expect(data.customers).toHaveLength(3);
  });

  test('can omit the customer list for the home summary', async () => {
    Customer.findAll.mockResolvedValue([]);
    const data = await winLoss(new Date(), new Date(), { includeCustomers: false });
    expect(data.customers).toBeUndefined();
    expect(data.won).toBe(0);
  });
});

describe('leadVolume', () => {
  beforeEach(() => jest.clearAllMocks());

  test('sums inbox leads by source', async () => {
    Lead.findAll.mockResolvedValueOnce([
      { source: 'whatsapp', count: '3' },
      { source: 'email', count: '1' },
    ]);
    const data = await leadVolume(new Date(), new Date(), { includeTrend: false });
    expect(data.total).toBe(4);
    expect(data.trend).toBeUndefined();
    expect(data.leads).toBeUndefined();
    expect(Lead.findAll).toHaveBeenCalledTimes(1);
  });

  test('includes lead rows when asked', async () => {
    Lead.findAll
      .mockResolvedValueOnce([{ source: 'phone', count: '1' }])
      .mockResolvedValueOnce([{
        id: 4,
        customer_id: 7,
        source: 'phone',
        subject: null,
        message: 'Need a quote',
        status: 'NEW',
        created_at: '2026-09-21',
        Customer: { id: 7, name: 'Helen Ackroyd' },
        toJSON() { return this; },
      }]);
    const data = await leadVolume(new Date(), new Date(), { includeTrend: false, includeLeads: true });
    expect(data.leads).toEqual([{
      id: 4,
      customer_id: 7,
      customer_name: 'Helen Ackroyd',
      source: 'phone',
      subject: null,
      message: 'Need a quote',
      status: 'NEW',
      created_at: '2026-09-21',
    }]);
    expect(Lead.findAll).toHaveBeenCalledTimes(2);
  });
});

describe('pipelineValueSnapshot (requirement 4.5 / 14.1)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns live totals and a zero-filled Enquiry → Follow-up breakdown', async () => {
    Customer.findAll.mockResolvedValue([
      { stage: 'QUOTED', pipeline_value: 900 },
      { stage: 'QUOTED', pipeline_value: 600 },
      { stage: 'ENQUIRY', pipeline_value: 0 },
    ]);
    const data = await pipelineValueSnapshot();
    expect(data.pipelineValue).toBe(1500);
    expect(data.pipelineCount).toBe(2);
    expect(data.byStage.find((s) => s.stage === 'QUOTED').value).toBe(1500);
    expect(data.byStage.find((s) => s.stage === 'ENQUIRY').value).toBe(0);
    expect(data.byStage.map((s) => s.stage)).not.toContain('WON');
    expect(Quote.findOne).not.toHaveBeenCalled();
  });

  test('does not double-count extra draft quotes on the same customer', async () => {
    Customer.findAll.mockResolvedValue([
      { stage: 'ENQUIRY', pipeline_value: 60 },
    ]);
    const data = await pipelineValueSnapshot();
    expect(data.pipelineValue).toBe(60);
    expect(data.pipelineCount).toBe(1);
    expect(data.byStage.find((s) => s.stage === 'ENQUIRY').value).toBe(60);
  });
});

describe('list reports (requirement 14.2)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('listCustomers filters on created_at', async () => {
    Customer.findAll.mockResolvedValue([
      { id: 7, name: 'Helen', customer_type: 'domestic', stage: 'ENQUIRY', source: 'phone', lost_reason: null, created_at: '2026-09-10T10:00:00.000Z', toJSON() { return this; } },
    ]);
    const fromDt = new Date('2026-08-29T00:00:00.000Z');
    const toDt = new Date('2026-09-28T23:59:59.999Z');
    const rows = await listCustomers(fromDt, toDt);
    expect(Customer.findAll).toHaveBeenCalledWith(expect.objectContaining({
      where: { created_at: { [require('sequelize').Op.between]: [fromDt, toDt] } },
    }));
    expect(rows[0].name).toBe('Helen');
    expect(rows[0].lost_reason).toBeNull();
  });

  test('listJobs includes customer name and schedule dates, not costing', async () => {
    Job.findAll.mockResolvedValue([
      {
        id: 3, title: 'Rear slope', status: 'SCHEDULED', customer_id: 7,
        start_date: '2026-09-22', end_date: '2026-09-22', created_at: '2026-09-11T10:00:00.000Z',
        Customer: { id: 7, name: 'Helen' },
        toJSON() { return { ...this, Customer: this.Customer }; },
      },
    ]);
    const rows = await listJobs(new Date(), new Date());
    expect(rows[0]).toMatchObject({
      title: 'Rear slope', customer_name: 'Helen', start_date: '2026-09-22', end_date: '2026-09-22',
    });
    expect(rows[0].labour_cost).toBeUndefined();
    expect(rows[0].value).toBeUndefined();
  });

  test('listInvoices omits totals when includeTotals is false', async () => {
    Invoice.findAll.mockResolvedValue([
      {
        id: 9, ref: 'INV-1', status: 'sent', total: 120, amount_paid: 20, due_now: 100,
        created_at: '2026-09-12T10:00:00.000Z', customer_id: 7, Customer: { name: 'Helen' },
        toJSON() { return { ...this, Customer: this.Customer }; },
      },
    ]);
    const hidden = await listInvoices(new Date(), new Date(), { includeTotals: false });
    expect(hidden[0].total).toBeUndefined();
    expect(hidden[0].amount_due).toBeUndefined();
    const shown = await listInvoices(new Date(), new Date(), { includeTotals: true });
    expect(shown[0].total).toBe(120);
    expect(shown[0].amount_due).toBe(80);
  });
});

describe('listProfitability (requirement 14.3)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('filters jobs on created_at and groups labour by operative', async () => {
    Job.findAll.mockResolvedValue([
      {
        id: 3, title: 'Rear slope', status: 'SCHEDULED', value: 1200, customer_id: 7,
        created_at: '2026-09-11T10:00:00.000Z',
        Customer: { id: 7, name: 'Helen' },
        Timesheets: [
          { user_id: 4, worked_minutes: 480, labour_cost: 196, User: { id: 4, name: 'Jamie Fisher' } },
          { user_id: 5, worked_minutes: 240, labour_cost: 80, User: { id: 5, name: 'Liam Ozturk' } },
        ],
        toJSON() { return { ...this, Customer: this.Customer, Timesheets: this.Timesheets }; },
      },
      {
        id: 4, title: 'No hours yet', status: 'PENDING', value: 500, customer_id: 7,
        created_at: '2026-09-12T10:00:00.000Z',
        Customer: { id: 7, name: 'Helen' },
        Timesheets: [],
        toJSON() { return { ...this, Customer: this.Customer, Timesheets: [] }; },
      },
    ]);
    const fromDt = new Date('2026-08-29T00:00:00.000Z');
    const toDt = new Date('2026-09-28T23:59:59.999Z');
    const data = await listProfitability(fromDt, toDt);
    expect(Job.findAll).toHaveBeenCalledWith(expect.objectContaining({
      where: { created_at: { [require('sequelize').Op.between]: [fromDt, toDt] } },
    }));
    expect(data.jobs).toHaveLength(1);
    expect(data.jobs[0].title).toBe('Rear slope');
    expect(data.jobs[0].net_value).toBe(1000);
    expect(data.jobs[0].actual_hours).toBe(12);
    expect(data.jobs[0].actual_labour_cost).toBe(276);
    expect(data.labour).toEqual([
      { user_id: 4, name: 'Jamie Fisher', hours: 8, labour_cost: 196 },
      { user_id: 5, name: 'Liam Ozturk', hours: 4, labour_cost: 80 },
    ]);
  });
});
