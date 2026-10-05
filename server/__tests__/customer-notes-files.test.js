jest.mock('../models', () => {
  const emptyFind = () => ({
    findAll: jest.fn().mockResolvedValue([]),
    findByPk: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    destroy: jest.fn(),
    count: jest.fn(),
  });
  return {
    sequelize: { transaction: jest.fn(async (fn) => fn({})) },
    Customer: { create: jest.fn(), findByPk: jest.fn(), findAll: jest.fn(), update: jest.fn() },
    CustomerSite: emptyFind(),
    CustomerPhone: emptyFind(),
    CustomerEmail: emptyFind(),
    CustomerNote: emptyFind(),
    CustomerFile: emptyFind(),
    Quote: { findAll: jest.fn().mockResolvedValue([]) },
    Task: emptyFind(),
    Message: { findAll: jest.fn().mockResolvedValue([]) },
    Activity: { findAll: jest.fn().mockResolvedValue([]) },
    Job: { findAll: jest.fn().mockResolvedValue([]), update: jest.fn() },
    JobAssignment: {},
    User: {},
    Invoice: { findAll: jest.fn().mockResolvedValue([]) },
    Appointment: { findAll: jest.fn().mockResolvedValue([]), update: jest.fn() },
    Lead: { findAll: jest.fn().mockResolvedValue([]) },
    Followup: { findAll: jest.fn().mockResolvedValue([]) },
    StageHistory: { findAll: jest.fn().mockResolvedValue([]) },
  };
});
jest.mock('../services/pipeline', () => ({
  STAGES: ['ENQUIRY'],
  STAGE_LABELS: { ENQUIRY: 'Enquiry' },
  setStage: jest.fn(),
  logActivity: jest.fn(),
}));
jest.mock('../services/messenger', () => ({
  sendToCustomer: jest.fn(),
}));
jest.mock('../db', () => ({
  DATA_DIR: '/tmp',
  plain: (row) => (row && typeof row.toJSON === 'function' ? row.toJSON() : row),
}));
jest.mock('../auth', () => {
  const actual = jest.requireActual('../auth');
  const state = { user: { id: 1, role: 'ADMIN', name: 'Paul' } };
  return {
    ...actual,
    requireAuth: (req, res, next) => { req.user = state.user; next(); },
    __setUser: (user) => { state.user = user; },
  };
});
jest.mock('../customerNotes', () => ({
  listNotes: jest.fn(async () => []),
  addNote: jest.fn(),
  removeNote: jest.fn(),
}));
jest.mock('../customerFiles', () => ({
  listFiles: jest.fn(async () => []),
  addFile: jest.fn(),
  removeFile: jest.fn(),
  getFileRow: jest.fn(),
  diskPath: jest.fn(),
  handleUpload: (req, res, next) => next(),
}));

const request = require('supertest');
const express = require('express');
const { Customer, Message } = require('../models');
const { sendToCustomer } = require('../services/messenger');
const { __setUser } = require('../auth');
const notes = require('../customerNotes');
const files = require('../customerFiles');
const customers = require('../routes/customers');

const app = express();
app.use(express.json());
app.use('/api/customers', customers);
app.use((err, req, res, next) => { res.status(500).json({ error: err.message }); });

describe('customer internal notes and files (requirement 2.4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __setUser({ id: 1, role: 'ADMIN', name: 'Paul' });
    Customer.findByPk.mockResolvedValue({ id: 9, name: 'Dave Whitfield', customer_type: 'domestic' });
    notes.listNotes.mockResolvedValue([]);
    files.listFiles.mockResolvedValue([]);
    Message.findAll.mockResolvedValue([]);
  });

  test('GET detail returns internal_notes and files, and drops message notes from the timeline', async () => {
    notes.listNotes.mockResolvedValue([{ id: 3, body: 'Scaffold booking', user_name: 'Paul' }]);
    files.listFiles.mockResolvedValue([{ id: 8, original_name: 'photos.pdf', mime: 'application/pdf' }]);
    Message.findAll.mockResolvedValue([
      { id: 1, channel: 'whatsapp', body: 'Hi', direction: 'in', status: 'received', created_at: '2026-01-02T10:00:00Z', User: null },
      { id: 2, channel: 'note', body: 'Do not mix me', direction: 'out', status: 'logged', created_at: '2026-01-03T11:00:00Z', User: { name: 'Paul' } },
    ]);

    const res = await request(app).get('/api/customers/9');
    expect(res.status).toBe(200);
    expect(res.body.internal_notes).toEqual([expect.objectContaining({ body: 'Scaffold booking' })]);
    expect(res.body.files).toEqual([expect.objectContaining({ original_name: 'photos.pdf' })]);
    expect(res.body.timeline.some((t) => t.type === 'note')).toBe(false);
    expect(res.body.timeline.some((t) => t.type === 'message')).toBe(true);
  });

  test('POST /notes creates an internal note; empty body is rejected', async () => {
    notes.addNote.mockResolvedValue({ note: { id: 1, body: 'Keep off the tiles' } });
    const res = await request(app).post('/api/customers/9/notes').send({ body: 'Keep off the tiles' });
    expect(res.status).toBe(200);
    expect(notes.addNote).toHaveBeenCalledWith(9, 1, 'Keep off the tiles');

    notes.addNote.mockResolvedValue({ error: 'Note is required', status: 400 });
    const empty = await request(app).post('/api/customers/9/notes').send({ body: '  ' });
    expect(empty.status).toBe(400);
  });

  test('POST /messages with channel note is rejected so notes stay out of Conversation', async () => {
    const res = await request(app).post('/api/customers/9/messages').send({ channel: 'note', body: 'secret' });
    expect(res.status).toBe(400);
    expect(sendToCustomer).not.toHaveBeenCalled();
  });

  test('OFFICE may add a file; STAFF is 403 on notes and files', async () => {
    files.addFile.mockResolvedValue({ file: { id: 4, original_name: 'roof.jpg' } });
    __setUser({ id: 2, role: 'OFFICE', name: 'Lisa' });
    const ok = await request(app).post('/api/customers/9/files');
    expect(ok.status).toBe(200);
    expect(files.addFile).toHaveBeenCalled();

    __setUser({ id: 3, role: 'STAFF', name: 'Jamie' });
    const note = await request(app).post('/api/customers/9/notes').send({ body: 'nope' });
    const file = await request(app).post('/api/customers/9/files');
    const get = await request(app).get('/api/customers/9');
    expect(note.status).toBe(403);
    expect(file.status).toBe(403);
    expect(get.status).toBe(403);
    expect(notes.addNote).not.toHaveBeenCalled();
  });

  test('DELETE file removes the customer attachment only', async () => {
    files.removeFile.mockResolvedValue({ ok: true });
    const res = await request(app).delete('/api/customers/9/files/4');
    expect(res.status).toBe(200);
    expect(files.removeFile).toHaveBeenCalledWith(9, 4);
  });
});
