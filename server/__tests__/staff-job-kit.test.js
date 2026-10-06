jest.mock('../auth', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 3, role: 'STAFF' }; next(); },
  asyncHandler: (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next),
}));
jest.mock('../db', () => ({
  getSetting: jest.fn(),
  DATA_DIR: '/tmp',
  todayStr: () => '2026-09-24',
  plain: (row) => (row && typeof row.toJSON === 'function' ? row.toJSON() : row),
}));
jest.mock('../services/pipeline', () => ({ logActivity: jest.fn() }));
jest.mock('../services/timesheets', () => ({
  jobClockInClosed: jest.fn(async () => false),
  paidInvoiceJobIds: jest.fn(async () => new Set()),
}));
jest.mock('../models', () => ({
  Job: { findByPk: jest.fn(), findAll: jest.fn() },
  Customer: {},
  User: {},
  JobAssignment: { findOne: jest.fn(), findAll: jest.fn() },
  JobDayAssignment: { findOne: jest.fn(), findAll: jest.fn().mockResolvedValue([]) },
  JobMessage: { findAll: jest.fn(), create: jest.fn() },
  HolidayRequest: { findAll: jest.fn() },
  Timesheet: {},
  JobMaterialLine: { findAll: jest.fn(), findOne: jest.fn(), create: jest.fn(), max: jest.fn() },
  JobChecklistItem: { findAll: jest.fn(), findOne: jest.fn(), create: jest.fn(), max: jest.fn() },
  JobFile: { findAll: jest.fn().mockResolvedValue([]), findOne: jest.fn(), create: jest.fn() },
}));

const request = require('supertest');
const express = require('express');
const { Job, JobDayAssignment, JobMaterialLine } = require('../models');
const staff = require('../routes/staff');

const app = express();
app.use(express.json());
app.use('/api/staff', staff);
app.use((err, req, res, next) => { res.status(500).json({ error: err.message }); });

describe('staff job kit (requirement 7.3)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('assigned staff can add a materials line', async () => {
    Job.findByPk.mockResolvedValue({ id: 8, customer_id: 7, title: 'Porch' });
    JobDayAssignment.findOne.mockResolvedValue({ job_id: 8, user_id: 3 });
    JobMaterialLine.max.mockResolvedValue(-1);
    JobMaterialLine.create.mockResolvedValue({
      id: 2, job_id: 8, description: 'EPDM', qty: 8, unit: 'm²', status: 'needed', sort_order: 0,
    });
    const res = await request(app).post('/api/staff/jobs/8/materials').send({ description: 'EPDM', qty: 8, unit: 'm²' });
    expect(res.status).toBe(200);
    expect(res.body.line.description).toBe('EPDM');
  });

  test('unassigned staff cannot change materials', async () => {
    Job.findByPk.mockResolvedValue({ id: 8, customer_id: 7, title: 'Porch' });
    JobDayAssignment.findOne.mockResolvedValue(null);
    const res = await request(app).post('/api/staff/jobs/8/materials').send({ description: 'EPDM' });
    expect(res.status).toBe(403);
    expect(JobMaterialLine.create).not.toHaveBeenCalled();
  });
});
