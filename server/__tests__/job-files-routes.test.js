jest.mock('../auth', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 1, role: 'ADMIN' }; next(); },
  requireOffice: (req, res, next) => next(),
  asyncHandler: (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next),
}));
jest.mock('../db', () => ({
  sequelize: {},
  todayStr: () => '2026-09-24',
  DATA_DIR: '/tmp',
  plain: (row) => (row && typeof row.toJSON === 'function' ? row.toJSON() : row),
}));
jest.mock('../services/pipeline', () => ({ setStage: jest.fn(), logActivity: jest.fn() }));
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
  Job: { findByPk: jest.fn(), findAll: jest.fn(), create: jest.fn() },
  Customer: { findByPk: jest.fn() },
  User: {},
  JobAssignment: { destroy: jest.fn(), findOrCreate: jest.fn() },
  JobDayAssignment: { destroy: jest.fn(), findOrCreate: jest.fn(), findAll: jest.fn().mockResolvedValue([]), findOne: jest.fn() },
  JobMessage: { findAll: jest.fn(), create: jest.fn() },
  JobMaterialLine: { findAll: jest.fn(), findOne: jest.fn(), create: jest.fn(), max: jest.fn() },
  JobChecklistItem: {
    findAll: jest.fn(), findOne: jest.fn(), create: jest.fn(), max: jest.fn(),
    destroy: jest.fn(), bulkCreate: jest.fn(),
  },
  JobFile: { findAll: jest.fn(), findOne: jest.fn(), create: jest.fn() },
  JobVariation: { findAll: jest.fn().mockResolvedValue([]), findOne: jest.fn(), create: jest.fn(), max: jest.fn() },
  Invoice: { findOne: jest.fn().mockResolvedValue(null) },
  AiProposal: {},
}));

const request = require('supertest');
const express = require('express');
const { Job } = require('../models');
const { logActivity } = require('../services/pipeline');
const jobFiles = require('../jobFiles');
const jobs = require('../routes/jobs');

const app = express();
app.use(express.json());
app.use('/api/jobs', jobs);
app.use((err, req, res, next) => { res.status(500).json({ error: err.message }); });

describe('job files and progress notes (requirement 7.4)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('POST /files stores a tagged photo', async () => {
    Job.findByPk.mockResolvedValue({ id: 8, title: 'Porch', customer_id: 9 });
    jobFiles.addFile.mockResolvedValue({
      file: { id: 3, original_name: 'porch.jpg', mime: 'image/jpeg', stage: 'before' },
    });
    const res = await request(app).post('/api/jobs/8/files').send({ stage: 'before' });
    expect(res.status).toBe(200);
    expect(res.body.file.stage).toBe('before');
    expect(jobFiles.addFile).toHaveBeenCalledWith(8, 1, undefined, 'before');
    expect(logActivity).toHaveBeenCalledWith(9, 1, 'job_file', expect.any(String), 'job', 8);
  });

  test('PUT notes trims a blank string to null', async () => {
    const row = { id: 8, title: 'Porch', customer_id: 9, update: jest.fn() };
    Job.findByPk.mockResolvedValue(row);
    const res = await request(app).put('/api/jobs/8').send({ notes: '  ' });
    expect(res.status).toBe(200);
    expect(row.update).toHaveBeenCalledWith({ notes: null });
  });

  test('DELETE /files removes the job attachment', async () => {
    Job.findByPk.mockResolvedValue({ id: 8, title: 'Porch', customer_id: 9 });
    jobFiles.removeFile.mockResolvedValue({ ok: true });
    const res = await request(app).delete('/api/jobs/8/files/3');
    expect(res.status).toBe(200);
    expect(jobFiles.removeFile).toHaveBeenCalledWith(8, 3);
  });
});
