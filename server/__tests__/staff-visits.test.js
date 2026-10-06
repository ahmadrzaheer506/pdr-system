jest.mock('../auth', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 3, role: 'STAFF' }; next(); },
  asyncHandler: (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next),
}));
jest.mock('../db', () => ({
  getSetting: jest.fn(),
  DATA_DIR: '/tmp',
  todayStr: () => '2026-10-02',
  plain: (row) => (row && typeof row.toJSON === 'function' ? row.toJSON() : row),
}));
jest.mock('../services/pipeline', () => ({ logActivity: jest.fn(), setStage: jest.fn() }));
jest.mock('../services/timesheets', () => ({
  jobClockInClosed: jest.fn(async () => false),
  paidInvoiceJobIds: jest.fn(async () => new Set()),
}));
jest.mock('../services/taskEngine', () => ({ completeVisit: jest.fn() }));
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
  Appointment: { findAll: jest.fn(), findByPk: jest.fn() },
  AppointmentAssignee: { findAll: jest.fn(), findOne: jest.fn() },
}));

const request = require('supertest');
const express = require('express');
const { Appointment, AppointmentAssignee } = require('../models');
const { logActivity } = require('../services/pipeline');
const { completeVisit } = require('../services/taskEngine');
const staff = require('../routes/staff');

const app = express();
app.use(express.json());
app.use('/api/staff', staff);
app.use((err, req, res, next) => { res.status(500).json({ error: err.message }); });

const VISIT = {
  id: 50,
  title: 'Site visit — Sandra Cole',
  start: new Date('2026-10-03T09:00:00.000Z'),
  end: new Date('2026-10-03T10:00:00.000Z'),
  address: '22 Birch Close',
  notes: 'Look at the valley',
  visit_type: 'site_visit',
  status: 'booked',
  customer_id: 12,
  Customer: { id: 12, name: 'Sandra Cole', stage: 'SITE_VISIT_BOOKED' },
  selectedPhone: { value: '07700 111222' },
  assignees: [{ id: 3, name: 'Jamie Fisher', role: 'STAFF' }],
};

describe('GET /api/staff/visits', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AppointmentAssignee.findAll.mockResolvedValue([]);
    Appointment.findAll.mockResolvedValue([]);
  });

  test('returns an empty list when nothing is assigned', async () => {
    const res = await request(app).get('/api/staff/visits');
    expect(res.status).toBe(200);
    expect(res.body.visits).toEqual([]);
    expect(Appointment.findAll).not.toHaveBeenCalled();
  });

  test('lists assigned visits with customer name and no money fields', async () => {
    AppointmentAssignee.findAll.mockResolvedValue([{ appointment_id: 50 }]);
    Appointment.findAll.mockResolvedValue([VISIT]);
    const res = await request(app).get('/api/staff/visits?from=2026-10-02&to=2026-10-15');
    expect(res.status).toBe(200);
    expect(res.body.visits).toEqual([expect.objectContaining({
      id: 50,
      title: 'Site visit — Sandra Cole',
      customer_name: 'Sandra Cole',
      customer_phone: '07700 111222',
      assignee_name: 'Jamie Fisher',
      status: 'booked',
    })]);
    expect(res.body.visits[0].customer_id).toBeUndefined();
  });
});

describe('GET/POST /api/staff/visits/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns an assigned visit', async () => {
    Appointment.findByPk.mockResolvedValue(VISIT);
    AppointmentAssignee.findOne.mockResolvedValue({ appointment_id: 50, user_id: 3 });
    const res = await request(app).get('/api/staff/visits/50');
    expect(res.status).toBe(200);
    expect(res.body.visit.customer_name).toBe('Sandra Cole');
  });

  test('hides visits that are not assigned to the caller', async () => {
    Appointment.findByPk.mockResolvedValue(VISIT);
    AppointmentAssignee.findOne.mockResolvedValue(null);
    const res = await request(app).get('/api/staff/visits/50');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Not your visit');
  });

  test('lets assigned staff tick the visit complete', async () => {
    Appointment.findByPk.mockResolvedValue(VISIT);
    AppointmentAssignee.findOne.mockResolvedValue({ appointment_id: 50, user_id: 3 });
    completeVisit.mockResolvedValue({ already: false, hasQuote: false, taskId: 44 });
    const res = await request(app).post('/api/staff/visits/50/complete');
    expect(res.status).toBe(200);
    expect(completeVisit).toHaveBeenCalled();
    expect(logActivity).toHaveBeenCalledWith(
      12, 3, 'appointment_completed', 'Site visit completed — quote needed', 'appointment', 50,
    );
    expect(res.body.task_id).toBe(44);
  });

  test('stores optional completion remarks from staff', async () => {
    Appointment.findByPk.mockResolvedValue(VISIT);
    AppointmentAssignee.findOne.mockResolvedValue({ appointment_id: 50, user_id: 3 });
    completeVisit.mockResolvedValue({ already: false, hasQuote: false, taskId: 44 });
    const res = await request(app).post('/api/staff/visits/50/complete').send({ complete_note: 'Measured the valley' });
    expect(res.status).toBe(200);
    expect(completeVisit).toHaveBeenCalledWith(expect.anything(), expect.anything(), 3, 'Measured the valley');
    expect(logActivity).toHaveBeenCalledWith(
      12, 3, 'appointment_completed', 'Site visit completed — quote needed. Remarks: Measured the valley', 'appointment', 50,
    );
  });
});
