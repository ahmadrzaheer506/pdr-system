jest.mock('../auth', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 4, role: 'STAFF' }; next(); },
  asyncHandler: (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next),
}));
jest.mock('../db', () => ({
  todayStr: () => '2026-09-26',
  plain: (row) => (row && typeof row.toJSON === 'function' ? row.toJSON() : row),
}));
jest.mock('../models', () => ({
  Notification: {
    findAll: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    findOne: jest.fn(),
    bulkCreate: jest.fn(),
  },
  User: { findAll: jest.fn(), findByPk: jest.fn() },
}));
jest.mock('../integrations/email', () => ({ send: jest.fn() }));

const request = require('supertest');
const express = require('express');
const { Notification, User } = require('../models');
const notifications = require('../routes/notifications');

const app = express();
app.use(express.json());
app.use('/api/notifications', notifications);
app.use((err, req, res, next) => { res.status(500).json({ error: err.message }); });

describe('GET/PUT /api/notifications (requirement 13.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Notification.count.mockResolvedValue(1);
    Notification.update.mockResolvedValue([1]);
  });

  test('lists the signed-in user\'s rows and unread count', async () => {
    Notification.findAll.mockResolvedValue([{
      id: 11,
      kind: 'crew_added',
      message: 'You\'ve been assigned to "Porch" on 2026-09-22',
      job_id: 8,
      work_date: '2026-09-22',
      entity_type: 'job',
      entity_id: 8,
      read_at: null,
      created_at: '2026-09-26T10:00:00.000Z',
      toJSON() { return this; },
    }]);
    const res = await request(app).get('/api/notifications');
    expect(res.status).toBe(200);
    expect(res.body.unread).toBe(1);
    expect(res.body.notifications[0]).toMatchObject({
      id: 11,
      title: 'Assigned to a job',
      href: '/staff/jobs/8',
    });
    expect(Notification.findAll).toHaveBeenCalledWith(expect.objectContaining({
      where: { user_id: 4 },
    }));
  });

  test('marks one owned row as read', async () => {
    const row = { id: 11, user_id: 4, read_at: null, update: jest.fn() };
    Notification.findOne.mockResolvedValue(row);
    const res = await request(app).put('/api/notifications/11/read');
    expect(res.status).toBe(200);
    expect(row.update).toHaveBeenCalledWith(expect.objectContaining({ read_at: expect.any(Date) }));
  });

  test('marks all unread as read', async () => {
    const res = await request(app).put('/api/notifications/read-all');
    expect(res.status).toBe(200);
    expect(Notification.update).toHaveBeenCalledWith(
      { read_at: expect.any(Date) },
      { where: { user_id: 4, read_at: null } },
    );
  });

  test('does not mark another user\'s row', async () => {
    Notification.findOne.mockResolvedValue(null);
    const res = await request(app).put('/api/notifications/99/read');
    expect(res.status).toBe(404);
  });
});

describe('GET/PUT /api/notifications/preferences (requirement 13.2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns kinds for the signed-in role with everything off', async () => {
    User.findByPk.mockResolvedValue({
      id: 4,
      role: 'STAFF',
      notification_prefs: { in_app: {}, email: {} },
    });
    const res = await request(app).get('/api/notifications/preferences');
    expect(res.status).toBe(200);
    expect(res.body.preferences.in_app.crew_added).toBe(false);
    expect(res.body.preferences.in_app.visit_booked).toBe(true);
    expect(res.body.preferences.email.crew_added).toBe(false);
    const crew = res.body.kinds.find((k) => k.id === 'crew_added');
    expect(crew.email).toBe(true);
    expect(res.body.kinds.find((k) => k.id === 'new_enquiry')).toBeUndefined();
  });

  test('saves in-app and crew email flags for staff', async () => {
    const update = jest.fn().mockResolvedValue(true);
    User.findByPk.mockResolvedValue({ id: 4, role: 'STAFF', update });
    const res = await request(app).put('/api/notifications/preferences').send({
      in_app: { crew_added: true },
      email: { crew_added: true, crew_removed: false },
    });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({
      notification_prefs: expect.objectContaining({
        in_app: expect.objectContaining({ crew_added: true, crew_removed: false }),
        email: { crew_added: true, crew_removed: false },
      }),
    });
  });

  test('rejects office email flags', async () => {
    User.findByPk.mockResolvedValue({ id: 4, role: 'STAFF', update: jest.fn() });
    const res = await request(app).put('/api/notifications/preferences').send({
      email: { new_enquiry: true },
    });
    expect(res.status).toBe(400);
  });
});
