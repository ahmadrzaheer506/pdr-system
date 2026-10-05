jest.mock('../models', () => ({
  Timesheet: { count: jest.fn(), findAll: jest.fn(), findByPk: jest.fn() },
  User: { findByPk: jest.fn() },
  Job: {},
  Customer: {},
}));
jest.mock('../db', () => ({
  sequelize: { transaction: async (fn) => fn({}) },
  plain: (row) => (row && typeof row.toJSON === 'function' ? row.toJSON() : { ...row }),
}));
jest.mock('../services/timesheets', () => ({
  listTimesheets: jest.fn(),
  weeklyTotals: jest.fn(),
  jobCosting: jest.fn(),
  clockOut: jest.fn(),
  liveBoard: jest.fn(),
  correctShift: jest.fn(),
  approveShift: jest.fn(),
  approveBatch: jest.fn(),
  rejectShift: jest.fn(),
}));
jest.mock('../auth', () => {
  const actual = jest.requireActual('../auth');
  const state = { user: { id: 1, role: 'ADMIN', financials_restricted: false, name: 'Paul' } };
  return {
    ...actual,
    requireAuth: (req, res, next) => { req.user = state.user; next(); },
    __setUser: (user) => { state.user = user; },
  };
});

const request = require('supertest');
const express = require('express');
const { Timesheet } = require('../models');
const ts = require('../services/timesheets');
const { __setUser, canSeeLabourCosts } = require('../auth');
const timesheets = require('../routes/timesheets');

const app = express();
app.use(express.json());
app.use('/api/timesheets', timesheets);
app.use((err, req, res, next) => { res.status(500).json({ error: err.message }); });

describe('canSeeLabourCosts (requirement 1.6)', () => {
  test('ADMIN always sees costing even if the flag is on', () => {
    expect(canSeeLabourCosts({ role: 'ADMIN', financials_restricted: true })).toBe(true);
  });

  test('unrestricted OFFICE sees costing; restricted OFFICE does not', () => {
    expect(canSeeLabourCosts({ role: 'OFFICE', financials_restricted: false })).toBe(true);
    expect(canSeeLabourCosts({ role: 'OFFICE' })).toBe(true);
    expect(canSeeLabourCosts({ role: 'OFFICE', financials_restricted: true })).toBe(false);
  });
});

describe('timesheet labour-cost restriction (requirement 1.6)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Timesheet.count.mockResolvedValue(0);
    ts.listTimesheets.mockResolvedValue([
      { id: 1, status: 'completed', labour_cost: 196, cost_rate: 24.5, worked_minutes: 480 },
    ]);
    ts.weeklyTotals.mockResolvedValue([
      { user_id: 3, name: 'Liam', hours: 8, cost: 132, hourly_cost: 16.5 },
    ]);
    ts.jobCosting.mockResolvedValue([{ id: 9, actual_labour_cost: 400, net_value: 1000 }]);
    ts.liveBoard.mockResolvedValue({
      work_date: '2026-09-25',
      active: [{ id: 1, labour_cost: 12, cost_rate: 16, user_name: 'Jamie', worked_minutes: null }],
      not_clocked_in: [{ user_id: 5, user_name: 'Ryan', color: '#000', jobs: ['Hall'] }],
    });
    ts.correctShift.mockResolvedValue({ worked_minutes: 480, labour_cost: 196 });
    ts.approveShift.mockResolvedValue({ ok: true });
    ts.approveBatch.mockResolvedValue({ ok: true, approved: 1 });
    ts.rejectShift.mockResolvedValue({ ok: true });
  });

  test('restricted OFFICE is 403 on /costing', async () => {
    __setUser({ id: 2, role: 'OFFICE', financials_restricted: true, name: 'Lisa' });
    const res = await request(app).get('/api/timesheets/costing');
    expect(res.status).toBe(403);
    expect(ts.jobCosting).not.toHaveBeenCalled();
  });

  test('unrestricted OFFICE and ADMIN can load /costing', async () => {
    __setUser({ id: 2, role: 'OFFICE', financials_restricted: false, name: 'Lisa' });
    expect((await request(app).get('/api/timesheets/costing')).status).toBe(200);
    __setUser({ id: 1, role: 'ADMIN', financials_restricted: true, name: 'Paul' });
    expect((await request(app).get('/api/timesheets/costing')).status).toBe(200);
  });

  test('restricted OFFICE list omits labour_cost but keeps the timesheet', async () => {
    __setUser({ id: 2, role: 'OFFICE', financials_restricted: true, name: 'Lisa' });
    const res = await request(app).get('/api/timesheets');
    expect(res.status).toBe(200);
    expect(res.body.timesheets[0].id).toBe(1);
    expect(res.body.timesheets[0].labour_cost).toBeUndefined();
    expect(res.body.timesheets[0].cost_rate).toBeUndefined();
    expect(res.body.timesheets[0].worked_minutes).toBe(480);
  });

  test('restricted OFFICE totals omit cost but keep hourly_cost (requirement 1.8)', async () => {
    __setUser({ id: 2, role: 'OFFICE', financials_restricted: true, name: 'Lisa' });
    const res = await request(app).get('/api/timesheets/totals');
    expect(res.status).toBe(200);
    expect(res.body.totals[0].cost).toBeUndefined();
    expect(res.body.totals[0].hourly_cost).toBe(16.5);
    expect(res.body.totals[0].hours).toBe(8);
  });

  test('unrestricted OFFICE list includes labour_cost', async () => {
    __setUser({ id: 2, role: 'OFFICE', financials_restricted: false, name: 'Lisa' });
    const res = await request(app).get('/api/timesheets');
    expect(res.body.timesheets[0].labour_cost).toBe(196);
  });

  test('restricted OFFICE live board omits labour_cost but keeps the shift', async () => {
    __setUser({ id: 2, role: 'OFFICE', financials_restricted: true, name: 'Lisa' });
    const res = await request(app).get('/api/timesheets/live');
    expect(res.status).toBe(200);
    expect(res.body.active[0].id).toBe(1);
    expect(res.body.active[0].labour_cost).toBeUndefined();
    expect(res.body.active[0].cost_rate).toBeUndefined();
    expect(res.body.not_clocked_in[0].user_name).toBe('Ryan');
  });

  test('restricted OFFICE CSV omits rate and cost columns (requirement 1.6)', async () => {
    __setUser({ id: 2, role: 'OFFICE', financials_restricted: true, name: 'Lisa' });
    const res = await request(app).get('/api/timesheets/export.csv?from=2026-09-19&to=2026-09-25');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/^Date,Staff/);
    expect(res.text).not.toMatch(/Rate/);
    expect(res.text).not.toMatch(/Cost/);
    expect(res.text).not.toMatch(/196/);
  });

  test('CSV approved-only passes status through (requirement 9.4)', async () => {
    __setUser({ id: 2, role: 'OFFICE', financials_restricted: false, name: 'Lisa' });
    await request(app).get('/api/timesheets/export.csv?from=2026-09-19&to=2026-09-25&status=approved');
    expect(ts.listTimesheets).toHaveBeenCalledWith({ from: '2026-09-19', to: '2026-09-25', status: 'approved', userId: null });
  });

  test('restricted OFFICE edit response omits labour_cost', async () => {
    __setUser({ id: 2, role: 'OFFICE', financials_restricted: true, name: 'Lisa' });
    const res = await request(app).put('/api/timesheets/1').send({ edit_reason: 'Adjusted finish' });
    expect(res.status).toBe(200);
    expect(res.body.worked_minutes).toBe(480);
    expect(res.body.labour_cost).toBeUndefined();
  });
});
