const { Op } = require('sequelize');
const { listWhere } = require('../taskList');
const { cronExpression, parseAutomation } = require('../automationSchedule');

describe('task list filters (requirement 12.3)', () => {
  test('overdue / today / due are open tasks split by due_date vs today', () => {
    expect(listWhere({ when: 'overdue' }, '2026-09-26')).toEqual({
      status: 'open',
      due_date: { [Op.lt]: '2026-09-26' },
    });
    expect(listWhere({ when: 'today' }, '2026-09-26')).toEqual({
      status: 'open',
      due_date: '2026-09-26',
    });
    expect(listWhere({ when: 'due' }, '2026-09-26')).toEqual({
      status: 'open',
      due_date: { [Op.gt]: '2026-09-26' },
    });
  });

  test('done includes completed and dismissed', () => {
    expect(listWhere({ when: 'done' }, '2026-09-26')).toEqual({
      status: { [Op.in]: ['done', 'dismissed'] },
    });
  });

  test('all open has no due_date filter', () => {
    expect(listWhere({ status: 'open' }, '2026-09-26')).toEqual({ status: 'open' });
  });
});

describe('automation cron expression (requirement 12.3)', () => {
  test('maps interval minutes onto a cron expression', () => {
    expect(cronExpression(1)).toBe('* * * * *');
    expect(cronExpression(5)).toBe('*/5 * * * *');
    expect(cronExpression(10)).toBe('*/10 * * * *');
  });

  test('parseAutomation requires a whole number of minutes from 1 to 60', () => {
    expect(parseAutomation({ interval_minutes: 15 }).value).toEqual({ interval_minutes: 15 });
    expect(parseAutomation({ interval_minutes: 0 }).error).toMatch(/1 to 60/);
    expect(parseAutomation({ interval_minutes: 7.5 }).error).toMatch(/whole number/);
  });
});
