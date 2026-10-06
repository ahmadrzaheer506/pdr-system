jest.mock('../auth', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 3, role: 'STAFF' }; next(); },
  asyncHandler: (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next),
}));
jest.mock('../db', () => ({
  getSetting: jest.fn(),
  DATA_DIR: '/tmp',
  todayStr: () => '2026-09-26',
  plain: (row) => (row && typeof row.toJSON === 'function' ? row.toJSON() : row),
}));
jest.mock('../services/pipeline', () => ({ logActivity: jest.fn() }));
jest.mock('../services/timesheets', () => ({
  jobClockInClosed: jest.fn(async () => false),
  paidInvoiceJobIds: jest.fn(async () => new Set()),
}));
jest.mock('../models', () => ({
  Job: { findByPk: jest.fn(), findAll: jest.fn() },
  Customer: { findAll: jest.fn() },
  User: {},
  JobAssignment: { findOne: jest.fn(), findAll: jest.fn() },
  JobDayAssignment: { findOne: jest.fn(), findAll: jest.fn().mockResolvedValue([]) },
  JobMessage: { findAll: jest.fn(), create: jest.fn() },
  HolidayRequest: { findAll: jest.fn() },
  Timesheet: {},
  Task: { findAll: jest.fn(), findByPk: jest.fn(), count: jest.fn() },
  TaskAssignee: { findAll: jest.fn(), findOne: jest.fn() },
}));

const request = require('supertest');
const express = require('express');
const { Op } = require('sequelize');
const { Task, TaskAssignee, Customer } = require('../models');
const staff = require('../routes/staff');

const app = express();
app.use(express.json());
app.use('/api/staff', staff);
app.use((err, req, res, next) => { res.status(500).json({ error: err.message }); });

describe('GET /api/staff/tasks (requirement 12.3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Task.findAll.mockResolvedValue([]);
    Task.count.mockResolvedValue(0);
    Customer.findAll.mockResolvedValue([]);
    TaskAssignee.findAll.mockResolvedValue([]);
  });

  test('returns an empty list when nothing is assigned', async () => {
    const res = await request(app).get('/api/staff/tasks?status=open');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      tasks: [],
      counts: { open: 0, overdue: 0, today: 0, due: 0, done: 0 },
    });
    expect(Task.findAll).not.toHaveBeenCalled();
  });

  test('lists only assigned tasks with lead name and no lead_id', async () => {
    TaskAssignee.findAll.mockResolvedValue([{ task_id: 87 }, { task_id: 88 }]);
    Task.findAll.mockResolvedValue([{
      entity_type: 'customer',
      entity_id: 9,
      toJSON: () => ({
        id: 87,
        title: 'Site photos for Dave',
        detail: 'Take ridge shots',
        due_date: '2026-09-26',
        priority: 'high',
        status: 'open',
        type: 'manual',
        entity_type: 'customer',
        entity_id: 9,
        assignees: [{ id: 3, name: 'Jamie Fisher', role: 'STAFF' }],
      }),
    }]);
    Customer.findAll.mockResolvedValue([{ id: 9, name: 'Dave Whitfield', toJSON() { return this; } }]);
    const res = await request(app).get('/api/staff/tasks?status=open');
    expect(res.status).toBe(200);
    expect(Task.findAll).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { [Op.in]: [87, 88] }, status: 'open' },
    }));
    expect(res.body.tasks[0]).toEqual({
      id: 87,
      title: 'Site photos for Dave',
      detail: 'Take ridge shots',
      due_date: '2026-09-26',
      priority: 'high',
      status: 'open',
      type: 'manual',
      lead_name: 'Dave Whitfield',
      assignees: [{ id: 3, name: 'Jamie Fisher', role: 'STAFF' }],
      assignee_name: 'Jamie Fisher',
    });
    expect(res.body.tasks[0].lead_id).toBeUndefined();
    expect(res.body.tasks[0].entity_id).toBeUndefined();
  });
});

describe('PUT /api/staff/tasks/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  test('lets assigned staff mark a task done', async () => {
    TaskAssignee.findOne.mockResolvedValue({ task_id: 87, user_id: 3 });
    const update = jest.fn().mockResolvedValue();
    Task.findByPk.mockResolvedValue({ id: 87, update });
    const res = await request(app).put('/api/staff/tasks/87').send({ status: 'done' });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ status: 'done', done_at: expect.any(Date) });
  });

  test('hides tasks that are not assigned to the caller', async () => {
    TaskAssignee.findOne.mockResolvedValue(null);
    const res = await request(app).put('/api/staff/tasks/87').send({ status: 'done' });
    expect(res.status).toBe(404);
    expect(Task.findByPk).not.toHaveBeenCalled();
  });

  test('refuses edits other than marking done', async () => {
    TaskAssignee.findOne.mockResolvedValue({ task_id: 87, user_id: 3 });
    const update = jest.fn();
    Task.findByPk.mockResolvedValue({ id: 87, update });
    const res = await request(app).put('/api/staff/tasks/87').send({ title: 'Nope' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/mark a task done/i);
    expect(update).not.toHaveBeenCalled();
  });
});
