jest.mock('../models', () => ({
  Notification: { bulkCreate: jest.fn() },
  JobDayAssignment: {},
  User: { findAll: jest.fn().mockResolvedValue([]) },
}));
jest.mock('../integrations/email', () => ({ send: jest.fn() }));
jest.mock('../db', () => ({
  plain: (row) => (row && typeof row.toJSON === 'function' ? row.toJSON() : row),
}));

const { Notification, User } = require('../models');
const { diffUserIds, notifyCrewChange } = require('../crewNotifications');

describe('crewNotifications (requirement 8.3)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('diffs added and removed people', () => {
    expect(diffUserIds([2, 3], [3, 4])).toEqual({ added: [4], removed: [2] });
  });

  test('writes rows for assigned staff who were added or removed', async () => {
    Notification.bulkCreate.mockResolvedValue([]);
    User.findAll.mockResolvedValue([
      { id: 4, role: 'STAFF', email: 'jamie@example.com', notification_prefs: { in_app: { crew_added: true, crew_removed: true }, email: {} } },
      { id: 3, role: 'STAFF', email: 'sam@example.com', notification_prefs: { in_app: { crew_added: true, crew_removed: true }, email: {} } },
    ]);
    const rows = await notifyCrewChange({
      job: { id: 8, title: 'Porch roof rebuild' },
      workDate: '2026-09-22',
      previousIds: [3],
      nextIds: [4],
    });
    expect(rows.map((r) => r.kind)).toEqual(['crew_added', 'crew_removed']);
    expect(rows[0]).toMatchObject({ user_id: 4, kind: 'crew_added', job_id: 8, work_date: '2026-09-22' });
    expect(rows[1]).toMatchObject({ user_id: 3, kind: 'crew_removed' });
    expect(Notification.bulkCreate).toHaveBeenCalled();
  });

  test('skips a no-op crew save', async () => {
    const rows = await notifyCrewChange({
      job: { id: 8, title: 'Porch' },
      workDate: '2026-09-22',
      previousIds: [3],
      nextIds: [3],
    });
    expect(rows).toEqual([]);
    expect(Notification.bulkCreate).not.toHaveBeenCalled();
  });
});
