import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Tasks from './Tasks.jsx';
import { api } from '../lib/api';
import { pickDate } from '../test/datePicker.js';
import { localToday } from '../lib/taskList.js';

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() },
  fmtDate: (d) => d || '',
}));

const COUNTS = { open: 3, overdue: 1, today: 1, due: 1, done: 4 };

const PEOPLE = [
  { id: 1, name: 'Paul Douglas', role: 'ADMIN', active: true },
  { id: 2, name: 'Lisa Grant', role: 'OFFICE', active: true },
  { id: 3, name: 'Jamie Fisher', role: 'STAFF', active: true },
];

const LEADS = [
  { id: 9, name: 'Dave Whitfield', address: '12 Harbour Road', phone: '07700 111222' },
  { id: 12, name: 'Helen Ackroyd', address: '4 Ridge Lane', email: 'helen@example.com' },
];

const OPEN_TASKS = [
  {
    id: 87,
    title: 'Produce quote for Dave',
    detail: 'Site visit completed — quotation needs producing.',
    type: 'system',
    priority: 'high',
    due_date: '2026-09-26',
    status: 'open',
    entity_type: 'customer',
    lead_id: 9,
    lead_name: 'Dave Whitfield',
    assignees: [{ id: 2, name: 'Lisa Grant', role: 'OFFICE' }],
    assignee_ids: [2],
  },
  {
    id: 88,
    title: 'Follow up quote Q-2026-0004',
    detail: 'Call Helen about the ridge line.',
    type: 'system',
    priority: 'normal',
    due_date: '2026-09-22',
    status: 'open',
    lead_id: 12,
    lead_name: 'Helen Ackroyd',
    assignees: [{ id: 3, name: 'Jamie Fisher', role: 'STAFF' }],
    assignee_ids: [3],
  },
  { id: 24, title: 'Follow up quote Q-2026-0023', type: 'system', priority: 'normal', due_date: '2099-01-01', status: 'open' },
];

function renderTasks(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/tasks" element={<Tasks />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Tasks views (requirement 12.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
    api.get.mockImplementation(async (path) => {
      const p = String(path);
      if (p.startsWith('/settings/users')) return { users: PEOPLE };
      if (p === '/customers' || p.startsWith('/customers?')) return { customers: LEADS };
      if (p.includes('when=due')) {
        return {
          tasks: [{ id: 24, title: 'Follow up quote Q-2026-0023', type: 'system', priority: 'normal', due_date: '2026-09-27', status: 'open' }],
          counts: COUNTS,
        };
      }
      if (p.includes('when=done')) {
        return {
          tasks: [{ id: 9, title: 'Old chase', type: 'system', priority: 'high', due_date: '2026-09-01', status: 'done' }],
          counts: COUNTS,
        };
      }
      return { tasks: OPEN_TASKS, counts: COUNTS };
    });
  });

  it('highlights the task from ?when=&task= on that view', async () => {
    renderTasks('/tasks?when=due&task=24');
    expect(await screen.findByText('Follow up quote Q-2026-0023')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/tasks?status=open&when=due');
    const row = screen.getByText('Follow up quote Q-2026-0023').closest('.card');
    expect(row.className).toMatch(/ring-2/);
  });

  it('puts when in the URL when only ?task= is present', async () => {
    renderTasks('/tasks?task=24');
    expect(await screen.findByText('Follow up quote Q-2026-0023')).toBeInTheDocument();
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/tasks?status=open&when=due');
    });
  });

  it('opens Done when ?task= is not in the open list', async () => {
    renderTasks('/tasks?task=9');
    expect(await screen.findByText('Old chase')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/tasks?when=done');
  });

  it('lists overdue, today, due, and done chips and opens Done', async () => {
    const user = userEvent.setup();
    renderTasks('/tasks');
    expect(await screen.findByText('Produce quote for Dave')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Due')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /4\s+done/i }));
    expect(await screen.findByText('Old chase')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/tasks?when=done');
  });

  it('asks before marking a task done', async () => {
    const user = userEvent.setup();
    api.put.mockResolvedValue({ ok: true });
    renderTasks('/tasks');
    expect(await screen.findByText('Produce quote for Dave')).toBeInTheDocument();
    expect(screen.queryByRole('radio')).toBeNull();
    await user.click(screen.getByRole('button', { name: /mark "produce quote for dave" done/i }));
    expect(screen.getByRole('heading', { name: /mark task done/i })).toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /^mark done$/i }));
    expect(api.put).toHaveBeenCalledWith('/tasks/87', { status: 'done' });
  });

  it('asks before deleting a task instead of dismissing it', async () => {
    const user = userEvent.setup();
    api.del.mockResolvedValue({ ok: true });
    renderTasks('/tasks');
    expect(await screen.findByText('Produce quote for Dave')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /delete produce quote for dave/i }));
    expect(screen.getByRole('heading', { name: /delete task/i })).toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();
    expect(api.del).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(api.del).toHaveBeenCalledWith('/tasks/87');
    expect(api.put).not.toHaveBeenCalled();
  });

  it('lets an office user edit any task', async () => {
    const user = userEvent.setup();
    api.put.mockResolvedValue({ ok: true });
    renderTasks('/tasks');
    expect(await screen.findByText('Produce quote for Dave')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /edit produce quote for dave/i }));
    expect(screen.getByRole('heading', { name: /edit task/i })).toBeInTheDocument();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Dave Whitfield')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /^change$/i })).toBeInTheDocument();
    expect(within(dialog).getByText('Lisa Grant')).toBeInTheDocument();
    const title = screen.getByLabelText(/^title$/i);
    await user.clear(title);
    await user.type(title, 'Produce quote for Dave — updated');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(api.put).toHaveBeenCalledWith('/tasks/87', expect.objectContaining({
      title: 'Produce quote for Dave — updated',
      priority: 'high',
      lead_id: 9,
      assignee_ids: [2],
    }));
  });

  it('creates a task on a lead assigned to office and field staff', async () => {
    const user = userEvent.setup();
    api.post.mockResolvedValue({ id: 101 });
    renderTasks('/tasks');
    await user.click(await screen.findByRole('button', { name: /add task/i }));
    expect(await screen.findByRole('heading', { name: /add a task/i })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^title$/i), 'Site photos');
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/customers'));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/settings/users'));

    await user.click(screen.getByLabelText(/^lead$/i));
    expect(await screen.findByRole('option', { name: /dave whitfield/i })).toBeInTheDocument();
    expect(screen.getByText('12 Harbour Road · 07700 111222')).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: /dave whitfield/i }));

    await user.click(screen.getByLabelText(/^assigned to$/i));
    expect(await screen.findByRole('option', { name: /lisa grant/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /office/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /jamie fisher/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /field staff/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /paul douglas/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/^owner$/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('option', { name: /lisa grant/i }));
    await user.click(screen.getByRole('option', { name: /jamie fisher/i }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^add task$/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/tasks', expect.objectContaining({
        title: 'Site photos',
        lead_id: 9,
        assignee_ids: [2, 3],
      }));
    });
  });

  it('filters the list by title or detail', async () => {
    const user = userEvent.setup();
    renderTasks('/tasks');
    expect(await screen.findByText('Produce quote for Dave')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/search tasks/i), 'helen');
    expect(screen.getByText('Follow up quote Q-2026-0004')).toBeInTheDocument();
    expect(screen.queryByText('Produce quote for Dave')).not.toBeInTheDocument();
    expect(screen.getByText(/showing 1 of 3/i)).toBeInTheDocument();
  });

  it('filters the list to tasks due on the picked date', async () => {
    const user = userEvent.setup();
    renderTasks('/tasks');
    expect(await screen.findByText('Produce quote for Dave')).toBeInTheDocument();
    await pickDate(user, /filter by due date/i, '2026-09-26');
    expect(screen.getByText('Produce quote for Dave')).toBeInTheDocument();
    expect(screen.queryByText('Follow up quote Q-2026-0004')).not.toBeInTheDocument();
    expect(screen.queryByText('Follow up quote Q-2026-0023')).not.toBeInTheDocument();
  });

  it('does not let a new task pick a due date in the past', async () => {
    const user = userEvent.setup();
    renderTasks('/tasks');
    await user.click(await screen.findByRole('button', { name: /add task/i }));
    expect(screen.getByLabelText(/^due date$/i)).toHaveAttribute('min', localToday());
  });

  it('shows a centred empty card when the view has no tasks', async () => {
    api.get.mockImplementation(async (path) => {
      const p = String(path);
      if (p.startsWith('/settings/users')) return { users: PEOPLE };
      if (p === '/customers' || p.startsWith('/customers?')) return { customers: LEADS };
      if (p.includes('when=today')) {
        return { tasks: [], counts: { ...COUNTS, today: 0 } };
      }
      return { tasks: [], counts: COUNTS };
    });
    renderTasks('/tasks?when=today');
    const title = await screen.findByText('All clear');
    expect(screen.getByText('Nothing outstanding right now.')).toBeInTheDocument();
    expect(title.closest('.card')).toBeTruthy();
  });
});
