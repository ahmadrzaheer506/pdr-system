jest.mock('../auth', () => {
  const state = { user: { id: 1, role: 'ADMIN', financials_restricted: false } };
  return {
    requireAuth: (req, res, next) => { req.user = state.user; next(); },
    requireOffice: (req, res, next) => next(),
    requireAdmin: (req, res, next) => {
      if (req.user && req.user.role === 'ADMIN') return next();
      return res.status(403).json({ error: 'Owner/admin only' });
    },
    asyncHandler: (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next),
    canSeeLabourCosts: (user) => user && (user.role === 'ADMIN' || user.financials_restricted !== true),
    __setUser: (user) => { state.user = user; },
  };
});
jest.mock('../reports', () => ({
  parseReportRange: jest.fn(),
  dashboardHome: jest.fn(),
  leadVolume: jest.fn(),
  winLoss: jest.fn(),
  pipelineValueSnapshot: jest.fn(),
  listCustomers: jest.fn(),
  listJobs: jest.fn(),
  listInvoices: jest.fn(),
  listProfitability: jest.fn(),
}));

const request = require('supertest');
const express = require('express');
const reports = require('../reports');
const { __setUser } = require('../auth');
const dashboard = require('../routes/dashboard');
const reportsRouter = require('../routes/reports');

function appWith(router, mount) {
  const app = express();
  app.use(express.json());
  app.use(mount, router);
  app.use((err, req, res, next) => { res.status(500).json({ error: err.message }); });
  return app;
}

describe('GET /api/dashboard (requirement 14.1 summary)', () => {
  const app = appWith(dashboard, '/api/dashboard');

  beforeEach(() => {
    jest.clearAllMocks();
    __setUser({ id: 1, role: 'ADMIN', financials_restricted: false });
    reports.parseReportRange.mockReturnValue({
      from: '2026-08-29', to: '2026-09-28',
      fromDt: new Date('2026-08-29T00:00:00.000Z'),
      toDt: new Date('2026-09-28T23:59:59.999Z'),
    });
    reports.leadVolume.mockResolvedValue({ total: 4, bySource: [] });
    reports.winLoss.mockResolvedValue({ won: 1, lost: 1, winRate: 50, byReason: [] });
    reports.pipelineValueSnapshot.mockResolvedValue({ pipelineValue: 1200, pipelineCount: 3, byStage: [] });
    reports.dashboardHome.mockResolvedValue({
      leads: { total: 4, bySource: [], trend: [] },
      visits: 2,
      quotesSent: 3,
      quotesValue: 900,
      won: 1,
      lost: 1,
      winRate: 50,
      avgJobValue: 400,
      pipelineValue: 1200,
      pipelineCount: 3,
      customersByStage: [],
      tasks: { open: 2, overdue: 1 },
      invoices: { outstanding: 200, overdue: 80, overdue_count: 1 },
    });
  });

  test('returns 14.1 metrics plus visits, quotes, charts, and balances', async () => {
    const res = await request(app).get('/api/dashboard').query({ from: '2026-08-29', to: '2026-09-28' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      leads: { total: 4 },
      won: 1,
      lost: 1,
      winRate: 50,
      pipelineValue: 1200,
      pipelineCount: 3,
      visits: 2,
      quotesSent: 3,
    });
    expect(reports.dashboardHome).toHaveBeenCalledWith(expect.any(Date), expect.any(Date), {
      from: '2026-08-29',
      to: '2026-09-28',
    });
  });

  test('rejects a bad range', async () => {
    reports.parseReportRange.mockReturnValue({ error: 'from must be on or before to' });
    const res = await request(app).get('/api/dashboard').query({ from: '2026-09-10', to: '2026-09-01' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/reports (requirement 14.1)', () => {
  const app = appWith(reportsRouter, '/api/reports');

  beforeEach(() => {
    jest.clearAllMocks();
    __setUser({ id: 1, role: 'ADMIN', financials_restricted: false });
    reports.parseReportRange.mockReturnValue({
      from: '2026-08-29', to: '2026-09-28',
      fromDt: new Date('2026-08-29T00:00:00.000Z'),
      toDt: new Date('2026-09-28T23:59:59.999Z'),
    });
    reports.leadVolume.mockResolvedValue({ total: 2, bySource: [{ source: 'phone', count: 2 }], trend: [] });
    reports.winLoss.mockResolvedValue({
      won: 1, lost: 0, winRate: 100, byReason: [],
      customers: [{ id: 7, name: 'Helen', stage: 'WON', lost_reason: null }],
    });
    reports.pipelineValueSnapshot.mockResolvedValue({
      pipelineValue: 500, pipelineCount: 1, byStage: [{ stage: 'ENQUIRY', value: 500 }],
    });
  });

  test('lead-volume uses the date window and includes trend', async () => {
    const res = await request(app).get('/api/reports/lead-volume').query({ from: '2026-08-29', to: '2026-09-28' });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(reports.leadVolume).toHaveBeenCalledWith(expect.any(Date), expect.any(Date), {
      includeTrend: true,
      includeLeads: true,
    });
  });

  test('win-loss includes customers currently WON or LOST', async () => {
    const res = await request(app).get('/api/reports/win-loss');
    expect(res.status).toBe(200);
    expect(res.body.customers[0].name).toBe('Helen');
    expect(reports.winLoss).toHaveBeenCalledWith(expect.any(Date), expect.any(Date), { includeCustomers: true });
  });

  test('pipeline-value ignores query dates', async () => {
    const res = await request(app).get('/api/reports/pipeline-value').query({ from: '2026-01-01', to: '2026-01-02' });
    expect(res.status).toBe(200);
    expect(res.body.pipelineValue).toBe(500);
    expect(reports.parseReportRange).not.toHaveBeenCalled();
    expect(reports.pipelineValueSnapshot).toHaveBeenCalled();
  });
});

describe('GET /api/reports CSV and generate lists (requirement 14.2)', () => {
  const app = appWith(reportsRouter, '/api/reports');

  beforeEach(() => {
    jest.clearAllMocks();
    __setUser({ id: 1, role: 'ADMIN', financials_restricted: false });
    reports.parseReportRange.mockReturnValue({
      from: '2026-08-29', to: '2026-09-28',
      fromDt: new Date('2026-08-29T00:00:00.000Z'),
      toDt: new Date('2026-09-28T23:59:59.999Z'),
    });
    reports.leadVolume.mockResolvedValue({ total: 2, bySource: [{ source: 'phone', count: 2 }], trend: [] });
    reports.winLoss.mockResolvedValue({
      won: 1, lost: 0, winRate: 100, byReason: [],
      customers: [{ id: 7, name: 'Helen', stage: 'WON', lost_reason: null, updated_at: '2026-09-20' }],
    });
    reports.pipelineValueSnapshot.mockResolvedValue({
      pipelineValue: 500, pipelineCount: 1,
      byStage: [{ stage: 'ENQUIRY', label: 'Enquiry', value: 500 }],
    });
    reports.listCustomers.mockResolvedValue([
      { id: 7, name: 'Helen', customer_type: 'domestic', stage: 'ENQUIRY', source: 'phone', lost_reason: null, created_at: '2026-09-10T10:00:00.000Z' },
    ]);
    reports.listJobs.mockResolvedValue([
      { id: 3, title: 'Rear slope', status: 'SCHEDULED', customer_id: 7, customer_name: 'Helen', start_date: '2026-09-22', end_date: '2026-09-22', created_at: '2026-09-11T10:00:00.000Z' },
    ]);
    reports.listInvoices.mockResolvedValue([
      { id: 9, ref: 'INV-2026-0010', status: 'sent', customer_id: 7, customer_name: 'Helen', total: 120, amount_due: 40, created_at: '2026-09-12T10:00:00.000Z' },
    ]);
  });

  test('lead-volume.csv uses the date window', async () => {
    const res = await request(app).get('/api/reports/lead-volume.csv').query({ from: '2026-08-29', to: '2026-09-28' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/lead-volume-2026-08-29-to-2026-09-28\.csv/);
    expect(res.text).toContain('source,count');
    expect(res.text).toContain('phone,2');
  });

  test('pipeline-value.csv exports the live snapshot without parsing dates', async () => {
    const res = await request(app).get('/api/reports/pipeline-value.csv').query({ from: '2026-01-01', to: '2026-01-02' });
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/pipeline-value-live\.csv/);
    expect(res.text).toContain('stage,label,value');
    expect(res.text).toContain('ENQUIRY,Enquiry,500');
    expect(reports.parseReportRange).not.toHaveBeenCalled();
  });

  test('customers JSON requires from and to', async () => {
    reports.parseReportRange.mockReturnValue({ error: 'from and to are required' });
    const res = await request(app).get('/api/reports/customers');
    expect(res.status).toBe(400);
    expect(reports.parseReportRange).toHaveBeenCalledWith(expect.anything(), { required: true });
    expect(reports.listCustomers).not.toHaveBeenCalled();
  });

  test('customers.csv lists created_at rows in range', async () => {
    const res = await request(app).get('/api/reports/customers.csv').query({ from: '2026-08-29', to: '2026-09-28' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('name,type,stage,source,lost_reason,created_at');
    expect(res.text).toContain('Helen,domestic,ENQUIRY,phone');
    expect(reports.listCustomers).toHaveBeenCalled();
  });

  test('jobs.csv has schedule dates and no costing columns', async () => {
    const res = await request(app).get('/api/reports/jobs.csv').query({ from: '2026-08-29', to: '2026-09-28' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('title,status,customer,start_date,end_date,created_at');
    expect(res.text).toContain('Rear slope,SCHEDULED,Helen,2026-09-22,2026-09-22');
    expect(res.text).not.toMatch(/labour|cost|profit/i);
  });

  test('invoices include totals for unrestricted office', async () => {
    const res = await request(app).get('/api/reports/invoices').query({ from: '2026-08-29', to: '2026-09-28' });
    expect(res.status).toBe(200);
    expect(res.body.include_totals).toBe(true);
    expect(res.body.invoices[0].total).toBe(120);
    expect(reports.listInvoices).toHaveBeenCalledWith(expect.any(Date), expect.any(Date), { includeTotals: true });
  });

  test('restricted OFFICE invoice CSV omits total and amount due', async () => {
    __setUser({ id: 2, role: 'OFFICE', financials_restricted: true });
    reports.listInvoices.mockResolvedValue([
      { id: 9, ref: 'INV-2026-0010', status: 'sent', customer_id: 7, customer_name: 'Helen', created_at: '2026-09-12T10:00:00.000Z' },
    ]);
    const res = await request(app).get('/api/reports/invoices.csv').query({ from: '2026-08-29', to: '2026-09-28' });
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/^ref,status,customer,created_at/);
    expect(res.text).not.toMatch(/total|amount_due/);
    expect(reports.listInvoices).toHaveBeenCalledWith(expect.any(Date), expect.any(Date), { includeTotals: false });
  });
});

describe('GET /api/reports/profitability (requirement 14.3)', () => {
  const app = appWith(reportsRouter, '/api/reports');

  beforeEach(() => {
    jest.clearAllMocks();
    __setUser({ id: 1, role: 'ADMIN', financials_restricted: false });
    reports.parseReportRange.mockReturnValue({
      from: '2026-08-29', to: '2026-09-28',
      fromDt: new Date('2026-08-29T00:00:00.000Z'),
      toDt: new Date('2026-09-28T23:59:59.999Z'),
    });
    reports.listProfitability.mockResolvedValue({
      jobs: [{
        id: 3, title: 'Rear slope', customer_name: 'Helen', net_value: 1000,
        actual_hours: 8, actual_labour_cost: 196, gross_profit: 804, margin_percent: 80.4,
        created_at: '2026-09-11T10:00:00.000Z',
      }],
      labour: [{ user_id: 4, name: 'Jamie Fisher', hours: 8, labour_cost: 196 }],
    });
  });

  test('requires from and to', async () => {
    reports.parseReportRange.mockReturnValue({ error: 'from and to are required' });
    const res = await request(app).get('/api/reports/profitability');
    expect(res.status).toBe(400);
    expect(reports.parseReportRange).toHaveBeenCalledWith(expect.anything(), { required: true });
    expect(reports.listProfitability).not.toHaveBeenCalled();
  });

  test('ADMIN gets jobs and labour tables', async () => {
    const res = await request(app).get('/api/reports/profitability').query({ from: '2026-08-29', to: '2026-09-28' });
    expect(res.status).toBe(200);
    expect(res.body.jobs[0].title).toBe('Rear slope');
    expect(res.body.labour[0].name).toBe('Jamie Fisher');
  });

  test('OFFICE is 403 even when unrestricted', async () => {
    __setUser({ id: 2, role: 'OFFICE', financials_restricted: false });
    const res = await request(app).get('/api/reports/profitability').query({ from: '2026-08-29', to: '2026-09-28' });
    expect(res.status).toBe(403);
    expect(reports.listProfitability).not.toHaveBeenCalled();
  });

  test('jobs CSV and labour CSV', async () => {
    const jobs = await request(app).get('/api/reports/profitability.csv').query({ from: '2026-08-29', to: '2026-09-28' });
    expect(jobs.status).toBe(200);
    expect(jobs.headers['content-disposition']).toMatch(/profitability-2026-08-29-to-2026-09-28\.csv/);
    expect(jobs.text).toContain('title,customer,quoted_ex_vat,hours,labour_cost,after_labour,margin_percent,created_at');
    expect(jobs.text).toContain('Rear slope,Helen,1000,8,196,804,80.4');

    const labour = await request(app).get('/api/reports/profitability-labour.csv').query({ from: '2026-08-29', to: '2026-09-28' });
    expect(labour.status).toBe(200);
    expect(labour.headers['content-disposition']).toMatch(/profitability-labour-2026-08-29-to-2026-09-28\.csv/);
    expect(labour.text).toContain('name,hours,labour_cost');
    expect(labour.text).toContain('Jamie Fisher,8,196');
  });
});
