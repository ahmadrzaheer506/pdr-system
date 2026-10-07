jest.mock('../auth', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 1, role: 'OFFICE' }; next(); },
  requireOffice: (req, res, next) => next(),
  asyncHandler: (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next),
}));
jest.mock('../db', () => ({
  todayStr: () => '2026-09-26',
  plain: (row) => (row && typeof row.toJSON === 'function' ? row.toJSON() : row),
}));
jest.mock('../calendarSync', () => ({
  syncTask: jest.fn(async () => {}),
  removeTask: jest.fn(async () => {}),
}));
jest.mock('../models', () => ({
  sequelize: { transaction: jest.fn(async (fn) => fn({})) },
  Task: { findAll: jest.fn(), count: jest.fn(), create: jest.fn(), findByPk: jest.fn() },
  User: { findAll: jest.fn() },
  Customer: { findAll: jest.fn(), findByPk: jest.fn() },
  TaskAssignee: { destroy: jest.fn(), bulkCreate: jest.fn() },
}));

const request = require('supertest');
const express = require('express');
const { Op } = require('sequelize');
const { Task, User, Customer, TaskAssignee } = require('../models');
const tasks = require('../routes/tasks');

const app = express();
app.use(express.json());
app.use('/api/tasks', tasks);
app.use((err, req, res, next) => { res.status(500).json({ error: err.message }); });

describe('GET /api/tasks (requirement 12.3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Task.findAll.mockResolvedValue([]);
    Task.count.mockResolvedValue(0);
    Customer.findAll.mockResolvedValue([]);
  });

  test('due view lists open tasks after today and returns all counts', async () => {
    const res = await request(app).get('/api/tasks?status=open&when=due');
    expect(res.status).toBe(200);
    expect(Task.findAll).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'open', due_date: { [Op.gt]: '2026-09-26' } },
    }));
    expect(res.body.counts).toEqual({
      open: 0, overdue: 0, today: 0, due: 0, done: 0,
    });
  });

  test('done view lists completed and dismissed tasks', async () => {
    const res = await request(app).get('/api/tasks?when=done');
    expect(res.status).toBe(200);
    expect(Task.findAll).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: { [Op.in]: ['done', 'dismissed'] } },
    }));
  });

  test('returns lead name and assignees', async () => {
    Task.findAll.mockResolvedValue([{
      entity_type: 'customer',
      entity_id: 9,
      toJSON: () => ({
        id: 7,
        title: 'Call Dave',
        entity_type: 'customer',
        entity_id: 9,
        assignee: { name: 'Lisa Grant' },
        assignees: [{ id: 2, name: 'Lisa Grant', role: 'OFFICE' }, { id: 3, name: 'Jamie Fisher', role: 'STAFF' }],
      }),
    }]);
    Customer.findAll.mockResolvedValue([{ id: 9, name: 'Dave Whitfield', toJSON() { return this; } }]);
    const res = await request(app).get('/api/tasks?status=open');
    expect(res.status).toBe(200);
    expect(res.body.tasks[0]).toMatchObject({
      lead_id: 9,
      lead_name: 'Dave Whitfield',
      assignee_ids: [2, 3],
      assignee_name: 'Lisa Grant, Jamie Fisher',
    });
  });
});

describe('PUT / DELETE /api/tasks/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  test('updates editable fields', async () => {
    const update = jest.fn().mockResolvedValue();
    Task.findByPk.mockResolvedValue({ id: 7, type: 'manual', entity_type: 'customer', update });
    const res = await request(app).put('/api/tasks/7').send({
      title: 'Chase quote',
      detail: 'Call Helen',
      due_date: '2026-10-01',
      priority: 'high',
    });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({
      title: 'Chase quote',
      detail: 'Call Helen',
      due_date: '2026-10-01',
      priority: 'high',
    }, expect.anything());
  });

  test('rejects a new due date in the past', async () => {
    Task.create.mockResolvedValue({ id: 8 });
    const res = await request(app).post('/api/tasks').send({
      title: 'Yesterday',
      due_date: '2026-09-25',
    });
    expect(res.status).toBe(400);
    expect(Task.create).not.toHaveBeenCalled();
  });

  test('creates a manual task on a lead with office and field staff', async () => {
    Customer.findByPk.mockResolvedValue({ id: 9 });
    User.findAll.mockResolvedValue([{ id: 2 }, { id: 3 }]);
    Task.create.mockResolvedValue({ id: 11 });
    TaskAssignee.destroy.mockResolvedValue(1);
    TaskAssignee.bulkCreate.mockResolvedValue([]);
    const res = await request(app).post('/api/tasks').send({
      title: 'Site photos',
      lead_id: 9,
      assignee_ids: [2, 3],
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 11 });
    expect(Task.create).toHaveBeenCalledWith(expect.objectContaining({
      type: 'manual',
      title: 'Site photos',
      entity_type: 'customer',
      entity_id: 9,
      assignee_id: 2,
    }), expect.anything());
    expect(TaskAssignee.bulkCreate).toHaveBeenCalledWith(
      [{ task_id: 11, user_id: 2 }, { task_id: 11, user_id: 3 }],
      expect.anything(),
    );
  });

  test('refuses a director as an assignee', async () => {
    Customer.findByPk.mockResolvedValue({ id: 9 });
    User.findAll.mockResolvedValue([]);
    const res = await request(app).post('/api/tasks').send({
      title: 'Site photos',
      lead_id: 9,
      assignee_ids: [1],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/office or field staff/i);
    expect(Task.create).not.toHaveBeenCalled();
  });

  test('requires a lead', async () => {
    const res = await request(app).post('/api/tasks').send({
      title: 'Site photos',
      assignee_ids: [2],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/lead/i);
  });

  test('updates lead and assignees', async () => {
    const update = jest.fn().mockResolvedValue();
    Task.findByPk.mockResolvedValue({ id: 7, type: 'manual', entity_type: 'customer', update });
    Customer.findByPk.mockResolvedValue({ id: 12 });
    User.findAll.mockResolvedValue([{ id: 2 }, { id: 3 }]);
    TaskAssignee.destroy.mockResolvedValue(1);
    TaskAssignee.bulkCreate.mockResolvedValue([]);
    const res = await request(app).put('/api/tasks/7').send({
      lead_id: 12,
      assignee_ids: [2, 3],
    });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      entity_type: 'customer',
      entity_id: 12,
      assignee_id: 2,
    }), expect.anything());
    expect(TaskAssignee.bulkCreate).toHaveBeenCalledWith(
      [{ task_id: 7, user_id: 2 }, { task_id: 7, user_id: 3 }],
      expect.anything(),
    );
  });

  test('deletes the task', async () => {
    const destroy = jest.fn().mockResolvedValue();
    Task.findByPk.mockResolvedValue({ id: 7, destroy });
    const res = await request(app).delete('/api/tasks/7');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(destroy).toHaveBeenCalled();
  });

  test('delete returns 404 when missing', async () => {
    Task.findByPk.mockResolvedValue(null);
    const res = await request(app).delete('/api/tasks/99');
    expect(res.status).toBe(404);
  });
});
