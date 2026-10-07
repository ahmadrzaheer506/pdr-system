jest.mock('../auth', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 1, role: 'ADMIN' }; next(); },
  requireOffice: (req, res, next) => next(),
  asyncHandler: (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next),
}));
jest.mock('../db', () => ({
  sequelize: {},
  todayStr: () => '2026-09-24',
  plain: (row) => (row && typeof row.toJSON === 'function' ? row.toJSON() : row),
  getSetting: jest.fn(async () => null),
}));
jest.mock('../services/pipeline', () => ({ setStage: jest.fn(), logActivity: jest.fn(), resolveLeadForCustomer: jest.fn(async () => null) }));
jest.mock('../services/schedulerEngine', () => ({ buildContext: jest.fn(), validateProposal: jest.fn(), proposalConflicts: jest.fn(() => []) }));
jest.mock('../integrations/ai', () => ({}));
jest.mock('../customerContacts', () => ({
  loadCustomerWithContacts: jest.fn(),
  resolveCustomerContactSelection: jest.fn(),
  formatSite: jest.fn(),
}));
jest.mock('../geocode', () => ({
  ensureJobSitePoint: jest.fn(async () => null),
  geocodeAddress: jest.fn(async () => null),
}));
jest.mock('../calendarSync', () => ({
  syncJob: jest.fn(async () => {}),
}));
jest.mock('../models', () => ({
  Job: { findByPk: jest.fn(), findAll: jest.fn(), create: jest.fn() },
  Customer: { findByPk: jest.fn() },
  User: { findAll: jest.fn().mockResolvedValue([]) },
  HolidayRequest: { findAll: jest.fn().mockResolvedValue([]) },
  JobAssignment: { destroy: jest.fn(), findOrCreate: jest.fn() },
  JobDayAssignment: { destroy: jest.fn(), findOrCreate: jest.fn(), findAll: jest.fn().mockResolvedValue([]), findOne: jest.fn() },
  JobMessage: { findAll: jest.fn(), create: jest.fn() },
  JobMaterialLine: { findAll: jest.fn(), findOne: jest.fn(), create: jest.fn(), max: jest.fn() },
  JobChecklistItem: {
    findAll: jest.fn(), findOne: jest.fn(), create: jest.fn(), max: jest.fn(),
    destroy: jest.fn(), bulkCreate: jest.fn(),
  },
  JobFile: { findAll: jest.fn().mockResolvedValue([]), findOne: jest.fn(), create: jest.fn() },
  JobVariation: { findAll: jest.fn().mockResolvedValue([]), findOne: jest.fn(), create: jest.fn(), max: jest.fn() },
  Notification: { bulkCreate: jest.fn().mockResolvedValue([]) },
  Invoice: { findOne: jest.fn().mockResolvedValue(null) },
  AiProposal: {},
}));

const request = require('supertest');
const express = require('express');
const { Job } = require('../models');
const jobs = require('../routes/jobs');

const app = express();
app.use(express.json());
app.use('/api/jobs', jobs);
app.use((err, req, res, next) => { res.status(500).json({ error: err.message }); });

describe('PUT /api/jobs/:id/status (requirement 7.2)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('allows skipping ahead', async () => {
    const row = {
      id: 4,
      title: 'Re-roof',
      status: 'PENDING',
      customer_id: 9,
      completed_at: null,
      update: jest.fn(async function patch(fields) { Object.assign(this, fields); }),
    };
    Job.findByPk.mockResolvedValue(row);
    const { Customer } = require('../models');
    Customer.findByPk.mockResolvedValue({ stage: 'WON' });

    const res = await request(app).put('/api/jobs/4/status').send({ status: 'IN_PROGRESS' });
    expect(res.status).toBe(200);
    expect(row.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'IN_PROGRESS' }));
  });

  test('rejects moving backwards', async () => {
    Job.findByPk.mockResolvedValue({
      id: 4,
      title: 'Re-roof',
      status: 'COMPLETED',
      customer_id: 9,
      update: jest.fn(),
    });
    const res = await request(app).put('/api/jobs/4/status').send({ status: 'SCHEDULED' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Job status can only move forward');
  });
});

describe('POST /api/jobs/:id/unschedule', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns scheduled jobs to pending, clears dates and crew', async () => {
    const row = {
      id: 4,
      title: 'Re-roof',
      status: 'SCHEDULED',
      customer_id: 9,
      lead_id: 2,
      start_date: '2026-10-08',
      end_date: '2026-10-09',
      update: jest.fn(async function patch(fields) { Object.assign(this, fields); }),
    };
    Job.findByPk.mockResolvedValue(row);
    const { Customer, JobDayAssignment } = require('../models');
    JobDayAssignment.findAll.mockResolvedValue([{ work_date: '2026-10-08', user_id: 3 }]);
    JobDayAssignment.destroy.mockResolvedValue(1);
    Customer.findByPk.mockResolvedValue({ stage: 'SCHEDULED' });

    const res = await request(app).post('/api/jobs/4/unschedule').send();
    expect(res.status).toBe(200);
    expect(JobDayAssignment.destroy).toHaveBeenCalledWith({ where: { job_id: 4 }, transaction: undefined });
    expect(row.update).toHaveBeenCalledWith({ status: 'PENDING', start_date: null, end_date: null });
    const { setStage, logActivity } = require('../services/pipeline');
    expect(setStage).toHaveBeenCalledWith(9, 'WON', 1, expect.stringMatching(/unscheduled/i), { leadId: 2 });
    expect(logActivity).toHaveBeenCalledWith(9, 1, 'job_unscheduled', expect.any(String), 'job', 4);
  });

  test('rejects jobs that are not scheduled or in progress', async () => {
    Job.findByPk.mockResolvedValue({
      id: 4,
      title: 'Re-roof',
      status: 'COMPLETED',
      customer_id: 9,
      update: jest.fn(),
    });
    const res = await request(app).post('/api/jobs/4/unschedule').send();
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/scheduled or in-progress/i);
  });
});

describe('PUT /api/jobs/:id required_skills (requirement 7.2)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('stores allowed skills and drops unknown values', async () => {
    const row = { id: 4, title: 'Re-roof', customer_id: 9, update: jest.fn() };
    Job.findByPk.mockResolvedValue(row);
    const res = await request(app).put('/api/jobs/4').send({ required_skills: ['slate', 'wizard'] });
    expect(res.status).toBe(200);
    expect(row.update).toHaveBeenCalledWith({ required_skills: ['slate'] });
  });
});

describe('GET /api/jobs/availability (requirement 8.2)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns approved holidays and live bookings', async () => {
    const { HolidayRequest, JobDayAssignment } = require('../models');
    HolidayRequest.findAll.mockResolvedValue([{
      id: 7, user_id: 3, start_date: '2026-09-22', end_date: '2026-09-22', User: { name: 'Jamie Fisher' },
    }]);
    JobDayAssignment.findAll.mockResolvedValue([{
      user_id: 4, job_id: 8, work_date: '2026-09-22',
      User: { name: 'Liam Ozturk' },
      Job: { id: 8, title: 'Porch roof rebuild', status: 'SCHEDULED' },
    }]);
    const res = await request(app).get('/api/jobs/availability?from=2026-09-22&to=2026-09-22');
    expect(res.status).toBe(200);
    expect(res.body.holidays[0].user_name).toBe('Jamie Fisher');
    expect(res.body.bookings[0].job_title).toBe('Porch roof rebuild');
  });

  test('rejects a missing from date', async () => {
    const res = await request(app).get('/api/jobs/availability');
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/jobs/:id/assignments (requirement 8.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { HolidayRequest } = require('../models');
    HolidayRequest.findAll.mockResolvedValue([]);
  });

  test('assigns crew for a work date without checking required skills', async () => {
    const { JobDayAssignment } = require('../models');
    Job.findByPk.mockResolvedValue({
      id: 4, title: 'Re-roof', customer_id: 9, required_skills: ['slate'],
      start_date: '2026-09-24', end_date: '2026-09-24',
    });
    JobDayAssignment.destroy.mockResolvedValue(1);
    JobDayAssignment.findOrCreate.mockResolvedValue([{}, true]);
    const res = await request(app).put('/api/jobs/4/assignments').send({ work_date: '2026-09-24', user_ids: [99] });
    expect(res.status).toBe(200);
    expect(JobDayAssignment.findOrCreate).toHaveBeenCalledWith({
      where: { job_id: 4, work_date: '2026-09-24', user_id: 99 },
      transaction: undefined,
    });
  });

  test('moves a one-day job when crew is saved on another date', async () => {
    const { JobDayAssignment } = require('../models');
    const row = {
      id: 4, title: 'Re-roof', customer_id: 9,
      start_date: '2026-09-24', end_date: '2026-09-24',
      update: jest.fn().mockResolvedValue(true),
    };
    Job.findByPk.mockResolvedValue(row);
    JobDayAssignment.findAll.mockResolvedValue([]);
    JobDayAssignment.destroy.mockResolvedValue(1);
    JobDayAssignment.findOrCreate.mockResolvedValue([{}, true]);
    const res = await request(app).put('/api/jobs/4/assignments').send({ work_date: '2026-09-26', user_ids: [99] });
    expect(res.status).toBe(200);
    expect(row.update).toHaveBeenCalledWith(
      { start_date: '2026-09-26', end_date: '2026-09-26' },
      expect.anything(),
    );
    expect(JobDayAssignment.findOrCreate).toHaveBeenCalledWith({
      where: { job_id: 4, work_date: '2026-09-26', user_id: 99 },
      transaction: undefined,
    });
  });

  test('asks for confirmation when crew is on approved holiday', async () => {
    const { JobDayAssignment, HolidayRequest, User } = require('../models');
    Job.findByPk.mockResolvedValue({
      id: 4, title: 'Re-roof', customer_id: 9,
      start_date: '2026-09-24', end_date: '2026-09-24',
    });
    HolidayRequest.findAll.mockResolvedValue([{ user_id: 99 }]);
    User.findAll.mockResolvedValue([{ id: 99, name: 'Jamie Fisher' }]);

    const res = await request(app).put('/api/jobs/4/assignments').send({ work_date: '2026-09-24', user_ids: [99] });
    expect(res.status).toBe(409);
    expect(res.body.needs_confirm).toBe(true);
    expect(res.body.conflicts[0].message).toMatch(/approved holiday/);
    expect(JobDayAssignment.findOrCreate).not.toHaveBeenCalled();
  });

  test('saves holiday crew after confirmation', async () => {
    const { JobDayAssignment, HolidayRequest, User } = require('../models');
    Job.findByPk.mockResolvedValue({
      id: 4, title: 'Re-roof', customer_id: 9,
      start_date: '2026-09-24', end_date: '2026-09-24',
    });
    HolidayRequest.findAll.mockResolvedValue([{ user_id: 99 }]);
    User.findAll.mockResolvedValue([{ id: 99, name: 'Jamie Fisher' }]);
    JobDayAssignment.findAll.mockResolvedValue([]);
    JobDayAssignment.destroy.mockResolvedValue(0);
    JobDayAssignment.findOrCreate.mockResolvedValue([{}, true]);

    const res = await request(app).put('/api/jobs/4/assignments').send({
      work_date: '2026-09-24', user_ids: [99], confirm_conflicts: true,
    });
    expect(res.status).toBe(200);
    expect(JobDayAssignment.findOrCreate).toHaveBeenCalled();
  });

  test('assigns crew on every work_date for a multi-day job', async () => {
    const { JobDayAssignment } = require('../models');
    Job.findByPk.mockResolvedValue({
      id: 4, title: 'Re-roof', customer_id: 9,
      start_date: '2026-10-07', end_date: '2026-10-09',
    });
    JobDayAssignment.findAll.mockResolvedValue([]);
    JobDayAssignment.destroy.mockResolvedValue(0);
    JobDayAssignment.findOrCreate.mockResolvedValue([{}, true]);
    const res = await request(app).put('/api/jobs/4/assignments').send({
      work_date: '2026-10-07',
      work_dates: ['2026-10-07', '2026-10-08', '2026-10-09'],
      user_ids: [99],
    });
    expect(res.status).toBe(200);
    expect(JobDayAssignment.findOrCreate).toHaveBeenCalledTimes(3);
    expect(res.body.work_dates).toEqual(['2026-10-07', '2026-10-08', '2026-10-09']);
  });

  test('rejects crew before the job has dates', async () => {
    Job.findByPk.mockResolvedValue({ id: 4, title: 'Re-roof', customer_id: 9, start_date: null });
    const res = await request(app).put('/api/jobs/4/assignments').send({ work_date: '2026-09-24', user_ids: [99] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Place this job on the schedule before assigning crew');
  });

  test('saves crew without a required skill or driver and notifies staff (requirement 8.3)', async () => {
    const { JobDayAssignment, Notification, User, HolidayRequest } = require('../models');
    Job.findByPk.mockResolvedValue({
      id: 4, title: 'Re-roof', customer_id: 9,
      start_date: '2026-09-24', end_date: '2026-09-24',
      required_skills: ['slate'], needs_driver: true,
    });
    JobDayAssignment.findAll.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    JobDayAssignment.destroy.mockResolvedValue(0);
    JobDayAssignment.findOrCreate.mockResolvedValue([{}, true]);
    User.findAll.mockResolvedValue([{
      id: 4, name: 'Liam Ozturk', skills: ['labourer'], is_driver: false, role: 'STAFF',
      notification_prefs: { in_app: { crew_added: true, crew_removed: true }, email: {} },
    }]);
    HolidayRequest.findAll.mockResolvedValue([]);
    Notification.bulkCreate.mockResolvedValue([]);

    const res = await request(app).put('/api/jobs/4/assignments').send({ work_date: '2026-09-24', user_ids: [4] });
    expect(res.status).toBe(200);
    expect(res.body.warnings.map((w) => w.type)).toEqual(['skill', 'driver']);
    expect(Notification.bulkCreate.mock.calls[0][0][0]).toMatchObject({
      user_id: 4, kind: 'crew_added', job_id: 4, work_date: '2026-09-24',
    });
  });
});

describe('PUT /api/jobs/:id needs_driver (requirement 8.3)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('stores the job-level driver toggle', async () => {
    const row = { id: 4, title: 'Re-roof', customer_id: 9, update: jest.fn() };
    Job.findByPk.mockResolvedValue(row);
    const res = await request(app).put('/api/jobs/4').send({ needs_driver: true });
    expect(res.status).toBe(200);
    expect(row.update).toHaveBeenCalledWith({ needs_driver: true });
  });
});

describe('PUT /api/jobs/:id priority', () => {
  beforeEach(() => jest.clearAllMocks());

  test('stores a valid priority', async () => {
    const row = { id: 4, title: 'Re-roof', customer_id: 9, priority: 'normal', update: jest.fn() };
    Job.findByPk.mockResolvedValue(row);
    const res = await request(app).put('/api/jobs/4').send({ priority: 'high' });
    expect(res.status).toBe(200);
    expect(row.update).toHaveBeenCalledWith({ priority: 'high' });
  });

  test('rejects an unknown priority', async () => {
    Job.findByPk.mockResolvedValue({ id: 4, title: 'Re-roof', customer_id: 9, update: jest.fn() });
    const res = await request(app).put('/api/jobs/4').send({ priority: 'critical' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/low, normal, high, or urgent/i);
  });
});

describe('PUT /api/jobs/:id dates (requirement 8.1)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects an end date before the start date', async () => {
    Job.findByPk.mockResolvedValue({
      id: 4, title: 'Re-roof', customer_id: 9, start_date: null, end_date: null, status: 'PENDING', update: jest.fn(),
    });
    const res = await request(app).put('/api/jobs/4').send({ start_date: '2026-09-26', end_date: '2026-09-25' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('End date cannot be before the start date');
  });

  test('stores a blank end date as null', async () => {
    const row = {
      id: 4, title: 'Re-roof', customer_id: 9, start_date: '2026-09-26', end_date: '2026-09-28',
      status: 'SCHEDULED', update: jest.fn(), reload: jest.fn(),
    };
    Job.findByPk.mockResolvedValue(row);
    const res = await request(app).put('/api/jobs/4').send({ end_date: '' });
    expect(res.status).toBe(200);
    expect(row.update).toHaveBeenCalledWith({ end_date: null });
  });
});

describe('job materials and checklists (requirement 7.3)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('lists seeded checklist templates', async () => {
    const res = await request(app).get('/api/jobs/checklist-templates');
    expect(res.status).toBe(200);
    expect(res.body.templates.map((t) => t.id)).toEqual(['generic', 're_roof', 'felt', 'guttering']);
  });

  test('adds a materials line starting as needed', async () => {
    const { JobMaterialLine } = require('../models');
    Job.findByPk.mockResolvedValue({ id: 4, title: 'Re-roof', customer_id: 9 });
    JobMaterialLine.max.mockResolvedValue(-1);
    JobMaterialLine.create.mockResolvedValue({
      id: 11, job_id: 4, description: 'Slate', qty: 20, unit: 'm²', status: 'needed', sort_order: 0,
    });
    const res = await request(app).post('/api/jobs/4/materials').send({ description: 'Slate', qty: 20, unit: 'm²' });
    expect(res.status).toBe(200);
    expect(res.body.line.status).toBe('needed');
  });

  test('applies a template onto the job', async () => {
    const { JobChecklistItem } = require('../models');
    Job.findByPk.mockResolvedValue({ id: 4, title: 'Re-roof', customer_id: 9, update: jest.fn() });
    JobChecklistItem.destroy.mockResolvedValue(0);
    JobChecklistItem.bulkCreate.mockResolvedValue([]);
    JobChecklistItem.findAll.mockResolvedValue([]);
    const res = await request(app).post('/api/jobs/4/checklist/apply').send({ template_id: 're_roof' });
    expect(res.status).toBe(200);
    expect(res.body.checklist_template).toBe('re_roof');
  });
});

describe('job variations (requirement 7.5)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('adds an office-only priced line', async () => {
    const { JobVariation } = require('../models');
    Job.findByPk.mockResolvedValue({ id: 4, title: 'Re-roof', customer_id: 9 });
    JobVariation.max.mockResolvedValue(-1);
    JobVariation.create.mockResolvedValue({
      id: 2, job_id: 4, description: 'Lead soakers', amount: 180, sort_order: 0,
    });
    const res = await request(app).post('/api/jobs/4/variations').send({ description: 'Lead soakers', amount: 180 });
    expect(res.status).toBe(200);
    expect(res.body.line.amount).toBe(180);
    const { logActivity } = require('../services/pipeline');
    expect(logActivity).toHaveBeenCalledWith(9, 1, 'job_variation', expect.any(String), 'job', 4);
  });
});
