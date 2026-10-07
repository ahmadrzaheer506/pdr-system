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
  cancelPendingForQuote: jest.fn(),
}));

const { Task } = require('../models');
const { ensureQuoteFollowupTask, quoteFollowupRuleKey } = require('../services/taskEngine');

describe('quote follow-up tasks (requirement 12.2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Task.create.mockResolvedValue({ id: 44 });
  });

  test('opens one unassigned task per quote due on the first step date', async () => {
    Task.findOne.mockResolvedValue(null);
    const due = new Date('2026-09-22T10:00:00.000Z');
    const id = await ensureQuoteFollowupTask({ id: 4, ref: 'Q-2026-0004' }, due);
    expect(id).toBe(44);
    expect(quoteFollowupRuleKey(4)).toBe('quote_followup:quote:4');
    expect(Task.create).toHaveBeenCalledWith(expect.objectContaining({
      type: 'system',
      rule_key: 'quote_followup:quote:4',
      title: 'Follow up quote Q-2026-0004',
      due_date: '2026-09-22',
      priority: 'normal',
      assignee_id: null,
      entity_type: 'quote',
      entity_id: 4,
    }));
  });

  test('resend updates the open task due date instead of duplicating', async () => {
    const existing = { id: 44, update: jest.fn() };
    Task.findOne.mockResolvedValue(existing);
    const id = await ensureQuoteFollowupTask({ id: 4, ref: 'Q-2026-0004' }, new Date('2026-09-28T10:00:00.000Z'));
    expect(id).toBe(44);
    expect(Task.create).not.toHaveBeenCalled();
    expect(existing.update).toHaveBeenCalledWith(expect.objectContaining({
      due_date: '2026-09-28',
      entity_id: 4,
    }));
  });
});
