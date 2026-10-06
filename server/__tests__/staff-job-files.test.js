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
jest.mock('../jobFiles', () => ({
  attachJobFiles: jest.fn(async (job) => ({ ...job, files: job.files || [] })),
  handleUpload: (req, res, next) => next(),
  addFile: jest.fn(),
  updateStage: jest.fn(),
  removeFile: jest.fn(),
  getFileRow: jest.fn(),
  sendStoredFile: jest.fn(),
  sendResult: (res, result) => {
    if (result?.sent) return undefined;
    if (result?.error) return res.status(result.status || 400).json({ error: result.error });
    return res.json(result);
  },
  normaliseJobNotes: (raw) => {
    if (raw == null) return null;
    const text = String(raw).trim();
    return text || null;
  },
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
  JobFile: { findAll: jest.fn(), findOne: jest.fn(), create: jest.fn() },
}));

const request = require('supertest');
const express = require('express');
const { Job, JobDayAssignment } = require('../models');
const jobFiles = require('../jobFiles');
const staff = require('../routes/staff');

const app = express();
app.use(express.json());
app.use('/api/staff', staff);
app.use((err, req, res, next) => { res.status(500).json({ error: err.message }); });

describe('staff job files (requirement 7.4)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('assigned staff can upload a photo and save notes', async () => {
    Job.findByPk.mockResolvedValue({
      id: 8, customer_id: 7, title: 'Porch',
      update: jest.fn(),
    });
    JobDayAssignment.findOne.mockResolvedValue({ job_id: 8, user_id: 3 });
    jobFiles.addFile.mockResolvedValue({
      file: { id: 5, stage: 'during', mime: 'image/jpeg' },
    });

    const photo = await request(app).post('/api/staff/jobs/8/files').send({ stage: 'during' });
    expect(photo.status).toBe(200);
    expect(jobFiles.addFile).toHaveBeenCalledWith(8, 3, undefined, 'during');

    const notes = await request(app).put('/api/staff/jobs/8').send({ notes: 'Tiles on' });
    expect(notes.status).toBe(200);
  });

  test('unassigned staff cannot upload or edit notes', async () => {
    Job.findByPk.mockResolvedValue({ id: 8, customer_id: 7, title: 'Porch', update: jest.fn() });
    JobDayAssignment.findOne.mockResolvedValue(null);
    const photo = await request(app).post('/api/staff/jobs/8/files').send({ stage: 'before' });
    const notes = await request(app).put('/api/staff/jobs/8').send({ notes: 'nope' });
    expect(photo.status).toBe(403);
    expect(notes.status).toBe(403);
    expect(jobFiles.addFile).not.toHaveBeenCalled();
  });
});
