jest.mock('../models', () => ({
  Task: { findAll: jest.fn(), findOne: jest.fn(), create: jest.fn(), update: jest.fn() },
  Appointment: { findAll: jest.fn() },
  Customer: {},
  Job: { findAll: jest.fn() },
  Invoice: { findAll: jest.fn() },
  Quote: { findAll: jest.fn() },
  User: {},
}));
jest.mock('../db', () => ({
  todayStr: () => '2026-09-26',
  plain: (row) => row,
}));
jest.mock('../calendarSync', () => ({
  syncTask: jest.fn(async () => {}),
}));
jest.mock('../notifications', () => ({
  safeNotify: jest.fn(async (fn) => fn()),
  notifyOffice: jest.fn(async () => []),
  notifyUsers: jest.fn(async () => []),
}));

const { Task } = require('../models');
const { notifyOffice, notifyUsers } = require('../notifications');
const { scanTaskReminders } = require('../services/taskEngine');

describe('scanTaskReminders (requirement 13.1)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('reminds the assignee when a task is due today', async () => {
    Task.findAll.mockResolvedValue([
      { id: 24, title: 'Follow up quote Q-2026-0023', due_date: '2026-09-26', assignee_id: 2, status: 'open' },
    ]);
    await scanTaskReminders();
    expect(notifyUsers).toHaveBeenCalledWith([2], expect.objectContaining({
      kind: 'task_reminder',
      entity_id: 24,
    }), { dedupe: true });
    expect(notifyOffice).not.toHaveBeenCalled();
  });

  test('reminds every assigned office and field staff user', async () => {
    Task.findAll.mockResolvedValue([
      {
        id: 11,
        title: 'Site photos',
        due_date: '2026-09-26',
        assignee_id: 2,
        assignees: [{ id: 2 }, { id: 3 }],
        status: 'open',
      },
    ]);
    await scanTaskReminders();
    expect(notifyUsers).toHaveBeenCalledWith([2, 3], expect.objectContaining({
      kind: 'task_reminder',
      entity_id: 11,
    }), { dedupe: true });
    expect(notifyOffice).not.toHaveBeenCalled();
  });

  test('reminds office when the due task is unassigned', async () => {
    Task.findAll.mockResolvedValue([
      { id: 87, title: 'Produce quote for Dave', due_date: '2026-09-26', assignee_id: null, status: 'open' },
    ]);
    await scanTaskReminders();
    expect(notifyOffice).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'task_reminder',
      entity_id: 87,
    }), { dedupe: true });
  });
});
