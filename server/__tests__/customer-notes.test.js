jest.mock('../models', () => ({
  CustomerNote: { create: jest.fn(), findByPk: jest.fn(), findAll: jest.fn(), findOne: jest.fn() },
  User: {},
  Lead: { findByPk: jest.fn() },
  Job: { findByPk: jest.fn() },
  Quote: { findByPk: jest.fn() },
  Invoice: { findByPk: jest.fn() },
}));
jest.mock('../db', () => ({
  plain: (row) => (row && typeof row.toJSON === 'function' ? row.toJSON() : row),
}));
jest.mock('../customerFiles', () => ({
  addFile: jest.fn(async () => ({ file: { id: 88, source: 'clock' } })),
}));

const { CustomerNote, Lead, Job } = require('../models');
const files = require('../customerFiles');
const { addNote, copyTaskRemark, copyClockOutHandover } = require('../customerNotes');

describe('customer notes (requirement 2.4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('rejects a blank note and never writes a row', async () => {
    const res = await addNote(9, 1, '   ');
    expect(res.error).toBe('Note is required');
    expect(CustomerNote.create).not.toHaveBeenCalled();
  });

  test('stores a general note against the enquiry', async () => {
    CustomerNote.create.mockResolvedValue({ id: 4 });
    CustomerNote.findByPk.mockResolvedValue({
      toJSON: () => ({ id: 4, body: 'Scaffold Monday', source: 'general', lead_id: 40, User: { name: 'Paul' } }),
    });
    const res = await addNote(9, 1, 'Scaffold Monday', { source: 'general', leadId: 40 });
    expect(res.note).toMatchObject({
      id: 4,
      body: 'Scaffold Monday',
      source: 'general',
      lead_id: 40,
      user_name: 'Paul',
    });
    expect(CustomerNote.create).toHaveBeenCalledWith(expect.objectContaining({
      customer_id: 9,
      source: 'general',
      lead_id: 40,
    }));
  });

  test('copies a task remark onto the customer from an enquiry task', async () => {
    Lead.findByPk.mockResolvedValue({ id: 40, customer_id: 9 });
    CustomerNote.create.mockResolvedValue({ id: 5 });
    CustomerNote.findByPk.mockResolvedValue({
      toJSON: () => ({ id: 5, body: 'Called Helen', source: 'task', lead_id: 40, User: null }),
    });
    const res = await copyTaskRemark(
      { entity_type: 'lead', entity_id: 40 },
      1,
      'Called Helen',
    );
    expect(res.note.source).toBe('task');
    expect(CustomerNote.create).toHaveBeenCalledWith(expect.objectContaining({
      customer_id: 9,
      source: 'task',
      lead_id: 40,
      body: 'Called Helen',
    }));
  });

  test('copies a job-task remark using the job lead', async () => {
    Job.findByPk.mockResolvedValue({ customer_id: 9, lead_id: 5 });
    CustomerNote.create.mockResolvedValue({ id: 6 });
    CustomerNote.findByPk.mockResolvedValue({
      toJSON: () => ({ id: 6, body: 'Dates agreed', source: 'task', lead_id: 5, User: null }),
    });
    await copyTaskRemark({ entity_type: 'job', entity_id: 12 }, 1, 'Dates agreed');
    expect(CustomerNote.create).toHaveBeenCalledWith(expect.objectContaining({
      customer_id: 9,
      source: 'task',
      lead_id: 5,
      body: 'Dates agreed',
    }));
  });

  test('copies clock-out notes and photo onto the job lead', async () => {
    Job.findByPk.mockResolvedValue({ customer_id: 9, lead_id: 40 });
    CustomerNote.create.mockResolvedValue({ id: 7 });
    CustomerNote.findByPk.mockResolvedValue({
      toJSON: () => ({ id: 7, body: 'Ridge to finish tomorrow', source: 'clock', lead_id: 40, User: { name: 'Jamie' } }),
    });
    const buf = Buffer.from('fake-jpg');
    const res = await copyClockOutHandover(3, { job_id: 12 }, {
      notes: 'Ridge to finish tomorrow',
      photoBuffer: buf,
      mime: 'image/jpeg',
    });
    expect(res.note.note.source).toBe('clock');
    expect(CustomerNote.create).toHaveBeenCalledWith(expect.objectContaining({
      customer_id: 9,
      source: 'clock',
      lead_id: 40,
      body: 'Ridge to finish tomorrow',
    }));
    expect(files.addFile).toHaveBeenCalledWith(
      9,
      3,
      expect.objectContaining({ buffer: buf, mimetype: 'image/jpeg' }),
      { source: 'clock', leadId: 40 },
    );
  });

  test('skips clock-out copy when the shift has no job', async () => {
    const res = await copyClockOutHandover(3, { job_id: null }, { notes: 'Yard tidy' });
    expect(res).toEqual({ skipped: true });
    expect(Job.findByPk).not.toHaveBeenCalled();
  });
});
