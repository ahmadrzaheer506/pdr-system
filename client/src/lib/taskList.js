import { ROLES } from './roles';

/** Task list views (requirement 12.3). */
export const TASK_VIEWS = [
  { id: 'ALL', label: 'All open', countKey: 'open' },
  { id: 'overdue', label: 'Overdue', countKey: 'overdue' },
  { id: 'today', label: 'Today', countKey: 'today' },
  { id: 'due', label: 'Due', countKey: 'due' },
  { id: 'done', label: 'Done', countKey: 'done' },
];

export function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function viewForDueDate(dueDate, today = localToday()) {
  if (!dueDate) return 'ALL';
  const day = String(dueDate).slice(0, 10);
  if (day < today) return 'overdue';
  if (day === today) return 'today';
  return 'due';
}

export function normalizeTaskView(raw) {
  if (!raw || raw === 'ALL' || raw === 'all') return 'ALL';
  if (raw === 'upcoming') return 'due';
  if (['overdue', 'today', 'due', 'done'].includes(raw)) return raw;
  return 'ALL';
}

function tasksQueryPathFor(when, base) {
  const view = normalizeTaskView(when);
  if (view === 'done') return `${base}?when=done`;
  if (view === 'ALL') return `${base}?status=open`;
  return `${base}?status=open&when=${view}`;
}

export function tasksQueryPath(when) {
  return tasksQueryPathFor(when, '/tasks');
}

export function staffTasksQueryPath(when) {
  return tasksQueryPathFor(when, '/staff/tasks');
}

function taskHrefFor(task, base) {
  if (!task || task.id == null) return base;
  const when = viewForDueDate(task.due_date);
  const params = new URLSearchParams();
  if (when !== 'ALL') params.set('when', when);
  params.set('task', String(task.id));
  return `${base}?${params.toString()}`;
}

export function taskHref(task) {
  return taskHrefFor(task, '/tasks');
}

export function staffTaskHref(task) {
  return taskHrefFor(task, '/staff/tasks');
}

export function isOverdueTask(task) {
  return task.status === 'open' && task.due_date && new Date(task.due_date) < new Date(new Date().toDateString());
}

export function assigneeRoleLabel(role) {
  if (role === ROLES.OFFICE) return 'Office';
  if (role === ROLES.STAFF) return 'Field staff';
  return '';
}

export function taskPeople(task) {
  if (Array.isArray(task.assignees) && task.assignees.length) {
    return task.assignees.filter((person) => person?.name);
  }
  if (task.assignee_name) {
    return String(task.assignee_name)
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => ({ name }));
  }
  return [];
}

/** Client-side title/detail search and exact due-date match. */
export function filterTasks(tasks, { q = '', dueDate = '' } = {}) {
  const needle = String(q || '').trim().toLowerCase();
  const day = dueDate ? String(dueDate).slice(0, 10) : '';
  return (tasks || []).filter((task) => {
    if (day && String(task.due_date || '').slice(0, 10) !== day) return false;
    if (!needle) return true;
    const title = String(task.title || '').toLowerCase();
    const detail = String(task.detail || '').toLowerCase();
    const lead = String(task.lead_name || '').toLowerCase();
    const assignees = (task.assignees || []).map((a) => String(a.name || '').toLowerCase()).join(' ');
    return title.includes(needle) || detail.includes(needle) || lead.includes(needle) || assignees.includes(needle);
  });
}
