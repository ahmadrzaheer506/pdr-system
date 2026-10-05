jest.mock('../auth', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 1, role: 'ADMIN' }; next(); },
  requireOffice: (req, res, next) => next(),
  asyncHandler: (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next),
}));

jest.mock('../db', () => ({
  plain: (row) => (row && typeof row.toJSON === 'function' ? row.toJSON() : row),
}));

jest.mock('../models', () => ({
  Appointment: { create: jest.fn(), findAll: jest.fn(), findByPk: jest.fn() },
  AppointmentAssignee: { findAll: jest.fn(), destroy: jest.fn(), bulkCreate: jest.fn() },
  Customer: {},
  User: { findAll: jest.fn() },
}));

jest.mock('../customerContacts', () => ({
  loadCustomerWithContacts: jest.fn(),
  resolveCustomerContactSelection: jest.fn(),
  formatSite: jest.fn((site) => site?.address || null),
}));

jest.mock('../services/pipeline', () => ({
  setStage: jest.fn(),
  logActivity: jest.fn(),
  resolveLeadForCustomer: jest.fn(async () => null),
}));

jest.mock('../integrations/gcal', () => ({
  createEvent: jest.fn(async () => ({ eventId: 'sim-1', simulated: true })),
  updateEvent: jest.fn(),
  cancelEvent: jest.fn(),
}));
jest.mock('../notifications', () => ({
  safeNotify: jest.fn(async (fn) => { await fn(); return []; }),
  notifyOffice: jest.fn(async () => []),
  notifyUsers: jest.fn(async () => []),
}));
jest.mock('../services/taskEngine', () => ({
  completeVisit: jest.fn(),
}));

const request = require('supertest');
const express = require('express');
const { Op } = require('sequelize');
const { Appointment, AppointmentAssignee, User } = require('../models');
const contacts = require('../customerContacts');
const { setStage, logActivity } = require('../services/pipeline');
const gcal = require('../integrations/gcal');
const { notifyUsers } = require('../notifications');
const { completeVisit } = require('../services/taskEngine');
const appointments = require('../routes/appointments');

const app = express();
app.use(express.json());
app.use('/api/appointments', appointments);
app.use((err, req, res, next) => { res.status(500).json({ error: err.message }); });

const DAVE = { id: 9, name: 'Dave Whitfield', stage: 'ENQUIRY', address: '14 Elm Grove' };
const START = '2026-09-30T09:00:00.000Z';
const END = '2026-09-30T10:00:00.000Z';
const BOOK = { customer_id: 9, start: START, end: END, visit_type: 'site_visit', assignee_ids: [3] };

function mockDaveContacts(overrides = {}) {
  contacts.loadCustomerWithContacts.mockResolvedValue({ ...DAVE, ...overrides });
  contacts.resolveCustomerContactSelection.mockResolvedValue({
    site_id: 1,
    phone_id: 2,
    email_id: 3,
    site: { address: '14 Elm Grove' },
    phone: { value: '07700 900100' },
    email: { value: 'dave@example.com' },
  });
  Appointment.create.mockResolvedValue({ id: 50 });
}

function mockAssignees() {
  User.findAll.mockImplementation(async ({ where }) => {
    const ids = where?.id?.[Op.in] || [];
    if (where.role === 'STAFF') return ids.filter((id) => id === 3).map((id) => ({ id }));
    return ids.map((id) => ({ id }));
  });
  AppointmentAssignee.destroy.mockResolvedValue(1);
  AppointmentAssignee.bulkCreate.mockResolvedValue([]);
  AppointmentAssignee.findAll.mockResolvedValue([]);
}

describe('POST /api/appointments (requirement 5.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDaveContacts();
    mockAssignees();
  });

  test('requires customer_id and start', async () => {
    const res = await request(app).post('/api/appointments').send({ start: START });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/customer_id and start required/);
    expect(Appointment.create).not.toHaveBeenCalled();
  });

  test('returns 404 when the customer does not exist', async () => {
    contacts.loadCustomerWithContacts.mockResolvedValue(null);
    const res = await request(app).post('/api/appointments').send({
      customer_id: 99, start: START, visit_type: 'site_visit', assignee_ids: [3],
    });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Customer not found');
  });

  test('rejects an invalid start time', async () => {
    const res = await request(app).post('/api/appointments').send({ customer_id: 9, start: 'not-a-date', visit_type: 'site_visit' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid start');
    expect(Appointment.create).not.toHaveBeenCalled();
  });

  test('stores the visit on the customer with site, phone, and email', async () => {
    const res = await request(app).post('/api/appointments').send({
      ...BOOK,
      notes: 'Look at the valley',
      site_id: 1,
      phone_id: 2,
      email_id: 3,
    });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(50);
    expect(Appointment.create).toHaveBeenCalledTimes(1);
    expect(Appointment.create.mock.calls[0][0]).toMatchObject({
      customer_id: 9,
      title: 'Site visit — Dave Whitfield',
      address: '14 Elm Grove',
      notes: 'Look at the valley',
      created_by: 1,
      site_id: 1,
      phone_id: 2,
      email_id: 3,
      visit_type: 'site_visit',
    });
    expect(Appointment.create.mock.calls[0][0].start).toEqual(new Date(START));
    expect(gcal.createEvent).toHaveBeenCalledWith(expect.objectContaining({
      customerName: 'Dave Whitfield',
      userId: 1,
    }));
    expect(logActivity).toHaveBeenCalledWith(
      9, 1, 'appointment_booked', expect.stringMatching(/Site visit booked/), 'appointment', 50,
    );
    expect(notifyUsers).toHaveBeenCalledWith([3], expect.objectContaining({
      kind: 'visit_booked',
      entity_type: 'appointment',
      entity_id: 50,
    }));
  });

  test('advances Enquiry to Site visit booked', async () => {
    const res = await request(app).post('/api/appointments').send(BOOK);
    expect(res.status).toBe(200);
    expect(setStage).toHaveBeenCalledWith(9, 'SITE_VISIT_BOOKED', 1, 'Site visit booked');
  });

  test('does not change stage when the customer is already past Enquiry', async () => {
    mockDaveContacts({ stage: 'QUOTED' });
    const res = await request(app).post('/api/appointments').send(BOOK);
    expect(res.status).toBe(200);
    expect(setStage).not.toHaveBeenCalled();
  });

  test('allows more than one visit on the same customer', async () => {
    Appointment.create.mockResolvedValueOnce({ id: 50 }).mockResolvedValueOnce({ id: 51 });
    const first = await request(app).post('/api/appointments').send(BOOK);
    const second = await request(app).post('/api/appointments').send({
      customer_id: 9,
      start: '2026-10-01T09:00:00.000Z',
      end: '2026-10-01T10:00:00.000Z',
      visit_type: 'follow_up',
      assignee_ids: [3],
    });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(Appointment.create).toHaveBeenCalledTimes(2);
  });

  test('requires an assignee', async () => {
    const res = await request(app).post('/api/appointments').send({
      customer_id: 9, start: START, end: END, visit_type: 'site_visit',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/assign at least one/i);
    expect(Appointment.create).not.toHaveBeenCalled();
  });

  test('requires a visit type (requirement 5.3)', async () => {
    const res = await request(app).post('/api/appointments').send({ customer_id: 9, start: START, end: END });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Select a visit type');
    expect(Appointment.create).not.toHaveBeenCalled();
  });

  test('rejects an invalid visit type', async () => {
    const res = await request(app).post('/api/appointments').send({ ...BOOK, visit_type: 'inspection' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid visit type');
  });

  test('stores Measure with a Measure title', async () => {
    const res = await request(app).post('/api/appointments').send({ ...BOOK, visit_type: 'measure' });
    expect(res.status).toBe(200);
    expect(Appointment.create.mock.calls[0][0]).toMatchObject({
      visit_type: 'measure',
      title: 'Measure — Dave Whitfield',
    });
  });
});

function futureAppointment(overrides = {}) {
  const start = new Date(Date.now() + 2 * 86400000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const row = {
    id: 50,
    customer_id: 9,
    title: 'Site visit — Dave Whitfield',
    start,
    end,
    address: '14 Elm Grove',
    notes: null,
    status: 'booked',
    visit_type: 'site_visit',
    gcal_event_id: 'g-1',
    created_by: 1,
    site_id: 1,
    phone_id: 2,
    email_id: 3,
    update: jest.fn(async function update(fields) { Object.assign(this, fields); }),
    ...overrides,
  };
  Appointment.findByPk.mockResolvedValue(row);
  return row;
}

describe('PUT /api/appointments/:id (requirement 5.3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDaveContacts();
    mockAssignees();
  });

  test('returns 404 when the visit does not exist', async () => {
    Appointment.findByPk.mockResolvedValue(null);
    const res = await request(app).put('/api/appointments/99').send({ start: START });
    expect(res.status).toBe(404);
  });

  test('reschedules a booked visit that has not ended', async () => {
    const row = futureAppointment();
    const nextStart = '2026-10-02T09:00:00.000Z';
    const nextEnd = '2026-10-02T10:30:00.000Z';
    const res = await request(app).put('/api/appointments/50').send({
      start: nextStart,
      end: nextEnd,
      visit_type: 'follow_up',
      notes: 'Moved',
    });
    expect(res.status).toBe(200);
    expect(row.update).toHaveBeenCalledWith(expect.objectContaining({
      start: new Date(nextStart),
      end: new Date(nextEnd),
      visit_type: 'follow_up',
      notes: 'Moved',
      status: 'booked',
      title: 'Follow-up — Dave Whitfield',
    }));
    expect(gcal.updateEvent).toHaveBeenCalledWith(
      'g-1',
      expect.objectContaining({ title: 'Follow-up — Dave Whitfield' }),
      1,
    );
    expect(setStage).not.toHaveBeenCalled();
    expect(logActivity).toHaveBeenCalledWith(9, 1, 'appointment_updated', 'Site visit updated', 'appointment', 50);
  });

  test('notifies newly assigned field staff', async () => {
    futureAppointment();
    AppointmentAssignee.findAll.mockResolvedValue([{ user_id: 2 }]);
    const res = await request(app).put('/api/appointments/50').send({ assignee_ids: [2, 3] });
    expect(res.status).toBe(200);
    expect(notifyUsers).toHaveBeenCalledWith([3], expect.objectContaining({
      kind: 'visit_booked',
      entity_type: 'appointment',
      entity_id: 50,
    }));
  });

  test('cancels without changing pipeline stage', async () => {
    const row = futureAppointment();
    const res = await request(app).put('/api/appointments/50').send({
      status: 'cancelled',
      cancel_note: 'Customer away',
    });
    expect(res.status).toBe(200);
    expect(row.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }));
    expect(gcal.cancelEvent).toHaveBeenCalledWith('g-1', 1);
    expect(setStage).not.toHaveBeenCalled();
    expect(logActivity).toHaveBeenCalledWith(
      9, 1, 'appointment_updated', 'Site visit cancelled: Customer away', 'appointment', 50,
    );
  });

  test('rejects a visit that has already ended', async () => {
    futureAppointment({
      start: new Date('2026-01-01T09:00:00.000Z'),
      end: new Date('2026-01-01T10:00:00.000Z'),
    });
    const res = await request(app).put('/api/appointments/50').send({ status: 'cancelled' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('This visit has already ended');
    expect(gcal.cancelEvent).not.toHaveBeenCalled();
  });

  test('rejects a visit that is not booked', async () => {
    futureAppointment({ status: 'cancelled' });
    const res = await request(app).put('/api/appointments/50').send({ start: START });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Only a booked visit can be changed');
  });
});

describe('POST /api/appointments/:id/complete', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('ticks a booked visit complete', async () => {
    futureAppointment();
    completeVisit.mockResolvedValue({ already: false, hasQuote: false, taskId: 44 });
    const res = await request(app).post('/api/appointments/50/complete');
    expect(res.status).toBe(200);
    expect(completeVisit).toHaveBeenCalled();
    expect(logActivity).toHaveBeenCalledWith(
      9, 1, 'appointment_completed', 'Site visit completed — quote needed', 'appointment', 50,
    );
    expect(res.body).toEqual({ ok: true, already: false, has_quote: false, task_id: 44 });
  });

  test('records optional completion remarks on activity', async () => {
    futureAppointment();
    completeVisit.mockResolvedValue({ already: false, hasQuote: false, taskId: 44 });
    const res = await request(app).post('/api/appointments/50/complete').send({ complete_note: 'Valley is sound' });
    expect(res.status).toBe(200);
    expect(completeVisit).toHaveBeenCalledWith(expect.anything(), expect.anything(), 1, 'Valley is sound');
    expect(logActivity).toHaveBeenCalledWith(
      9, 1, 'appointment_completed', 'Site visit completed — quote needed. Remarks: Valley is sound', 'appointment', 50,
    );
  });

  test('does not write a second activity when the visit was already done', async () => {
    futureAppointment({ status: 'done' });
    completeVisit.mockResolvedValue({ already: true, hasQuote: null, taskId: null });
    const res = await request(app).post('/api/appointments/50/complete');
    expect(res.status).toBe(200);
    expect(logActivity).not.toHaveBeenCalled();
  });
});
