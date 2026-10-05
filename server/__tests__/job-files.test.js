jest.mock('fs', () => ({
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  existsSync: jest.fn(() => true),
  unlinkSync: jest.fn(),
}));
jest.mock('../models', () => ({
  JobFile: { findAll: jest.fn(), findOne: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
  User: {},
}));
jest.mock('../db', () => ({
  DATA_DIR: '/tmp',
  plain: (row) => (row && typeof row.toJSON === 'function' ? row.toJSON() : { ...row }),
}));

const fs = require('fs');
const { JobFile } = require('../models');
const jobFiles = require('../jobFiles');

describe('jobFiles (requirement 7.4)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects an untagged photo and a tagged PDF', () => {
    expect(jobFiles.resolveStage('image/jpeg', '')).toMatchObject({
      error: 'Photos must be tagged before, during, or after',
      status: 400,
    });
    expect(jobFiles.resolveStage('application/pdf', 'before')).toMatchObject({
      error: 'PDFs cannot be tagged before, during, or after',
      status: 400,
    });
    expect(jobFiles.resolveStage('application/pdf', '')).toEqual({ stage: null });
    expect(jobFiles.resolveStage('image/png', 'during')).toEqual({ stage: 'during' });
  });

  test('creates a before photo and allows retagging to after', async () => {
    JobFile.create.mockResolvedValue({ id: 1 });
    JobFile.findByPk.mockResolvedValue({
      id: 1, job_id: 8, original_name: 'porch.jpg', mime: 'image/jpeg',
      size_bytes: 4, stage: 'before', user_id: 2, User: { name: 'Lisa' },
    });
    const created = await jobFiles.addFile(8, 2, {
      buffer: Buffer.from('img'),
      mimetype: 'image/jpeg',
      originalname: 'porch.jpg',
      size: 4,
    }, 'before');
    expect(created.file.stage).toBe('before');
    expect(created.file.stored_name).toBeUndefined();
    expect(fs.writeFileSync).toHaveBeenCalled();

    const row = {
      id: 1, job_id: 8, mime: 'image/jpeg', stage: 'before',
      update: jest.fn(async function patch(fields) { Object.assign(this, fields); }),
    };
    JobFile.findOne.mockResolvedValue(row);
    JobFile.findByPk.mockResolvedValue({
      id: 1, job_id: 8, original_name: 'porch.jpg', mime: 'image/jpeg',
      size_bytes: 4, stage: 'after', User: { name: 'Lisa' },
    });
    const moved = await jobFiles.updateStage(8, 1, 'after');
    expect(row.update).toHaveBeenCalledWith({ stage: 'after' });
    expect(moved.file.stage).toBe('after');
  });

  test('stores a PDF with no stage', async () => {
    JobFile.create.mockResolvedValue({ id: 2 });
    JobFile.findByPk.mockResolvedValue({
      id: 2, job_id: 8, original_name: 'spec.pdf', mime: 'application/pdf',
      size_bytes: 3, stage: null, User: null,
    });
    const created = await jobFiles.addFile(8, 1, {
      buffer: Buffer.from('pdf'),
      mimetype: 'application/pdf',
      originalname: 'spec.pdf',
      size: 3,
    }, '');
    expect(created.file.stage).toBeNull();
    expect(JobFile.create.mock.calls[0][0].stage).toBeNull();
  });

  test('trims progress notes to null when blank', () => {
    expect(jobFiles.normaliseJobNotes('  Ridge on  ')).toBe('Ridge on');
    expect(jobFiles.normaliseJobNotes('   ')).toBeNull();
    expect(jobFiles.normaliseJobNotes(null)).toBeNull();
  });
});
