jest.mock('../models', () => ({
  Task: { findOne: jest.fn(), create: jest.fn(), update: jest.fn() },
  Appointment: { findAll: jest.fn() },
  Customer: {},
  Job: { findAll: jest.fn() },
  Invoice: { findAll: jest.fn() },
  Quote: { findAll: jest.fn() },
}));
jest.mock('../db', () => ({
  todayStr: () => '2026-09-26',
  plain: (row) => row,
}));
jest.mock('../calendarSync', () => ({
  syncTask: jest.fn(async () => {}),
}));
jest.mock('../services/followups', () => ({
  cancelPendingForQuote: jest.fn(async () => 2),
}));

const { Quote, Task } = require('../models');
const { cancelPendingForQuote } = require('../services/followups');
const { scanExpiredQuotes } = require('../services/taskEngine');

describe('scanExpiredQuotes follow-ups (requirement 12.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Task.findOne.mockResolvedValue(null);
    Task.create.mockResolvedValue({ id: 1 });
  });

  test('cancels remaining follow-ups when a sent quote expires', async () => {
    const q = {
      id: 3,
      customer_id: 9,
      ref: 'Q-2026-0003',
      save: jest.fn(),
      Customer: { name: 'Dave Whitfield' },
    };
    Quote.findAll.mockResolvedValue([q]);
    const logActivity = jest.fn();
    const n = await scanExpiredQuotes(logActivity);
    expect(n).toBe(1);
    expect(q.status).toBe('expired');
    expect(cancelPendingForQuote).toHaveBeenCalledWith(3, 'quote expired');
    expect(Task.update).toHaveBeenCalledWith(
      { status: 'done', done_at: expect.any(Date) },
      { where: { rule_key: 'quote_followup:quote:3', status: 'open' } }
    );
  });
});
