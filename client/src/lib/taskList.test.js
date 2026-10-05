import { describe, it, expect } from 'vitest';
import { viewForDueDate, taskHref, staffTaskHref, tasksQueryPath, staffTasksQueryPath, normalizeTaskView, filterTasks, assigneeRoleLabel } from './taskList.js';

describe('taskList helpers (requirement 12.3)', () => {
  it('maps a due date onto overdue, today, or due', () => {
    expect(viewForDueDate('2026-09-22', '2026-09-26')).toBe('overdue');
    expect(viewForDueDate('2026-09-26', '2026-09-26')).toBe('today');
    expect(viewForDueDate('2026-09-28', '2026-09-26')).toBe('due');
    expect(viewForDueDate(null, '2026-09-26')).toBe('ALL');
  });

  it('builds a chip href with when and task', () => {
    expect(taskHref({ id: 88, due_date: '2020-01-01' })).toBe('/tasks?when=overdue&task=88');
    expect(taskHref({ id: 24, due_date: '2099-01-01' })).toBe('/tasks?when=due&task=24');
    expect(staffTaskHref({ id: 88, due_date: '2020-01-01' })).toBe('/staff/tasks?when=overdue&task=88');
  });

  it('builds list query paths', () => {
    expect(tasksQueryPath('ALL')).toBe('/tasks?status=open');
    expect(tasksQueryPath('today')).toBe('/tasks?status=open&when=today');
    expect(tasksQueryPath('done')).toBe('/tasks?when=done');
    expect(staffTasksQueryPath('ALL')).toBe('/staff/tasks?status=open');
    expect(staffTasksQueryPath('today')).toBe('/staff/tasks?status=open&when=today');
    expect(normalizeTaskView('upcoming')).toBe('due');
  });

  it('filters by title, detail, lead, assignee, and exact due date', () => {
    const rows = [
      { id: 1, title: 'Produce quote for Dave', detail: 'Site visit completed', due_date: '2026-09-26', lead_name: 'Dave Whitfield' },
      { id: 2, title: 'Follow up quote', detail: 'Call Helen', due_date: '2026-09-27', assignees: [{ name: 'Lisa Grant' }] },
      { id: 3, title: 'Order ridge kits', detail: null, due_date: '2026-09-26' },
    ];
    expect(filterTasks(rows, { q: 'helen' }).map((t) => t.id)).toEqual([2]);
    expect(filterTasks(rows, { q: 'lisa' }).map((t) => t.id)).toEqual([2]);
    expect(filterTasks(rows, { q: 'whitfield' }).map((t) => t.id)).toEqual([1]);
    expect(filterTasks(rows, { q: 'quote' }).map((t) => t.id)).toEqual([1, 2]);
    expect(filterTasks(rows, { dueDate: '2026-09-26' }).map((t) => t.id)).toEqual([1, 3]);
    expect(filterTasks(rows, { q: 'dave', dueDate: '2026-09-26' }).map((t) => t.id)).toEqual([1]);
    expect(filterTasks(rows, { q: '  ', dueDate: '' })).toHaveLength(3);
  });

  it('labels office and field-staff assignees', () => {
    expect(assigneeRoleLabel('OFFICE')).toBe('Office');
    expect(assigneeRoleLabel('STAFF')).toBe('Field staff');
    expect(assigneeRoleLabel('ADMIN')).toBe('');
  });
});
