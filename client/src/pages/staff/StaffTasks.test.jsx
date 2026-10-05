import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import StaffTasks from './StaffTasks.jsx';
import { api } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  api: { get: vi.fn(), put: vi.fn() },
  fmtDate: (d) => d || '',
}));

const COUNTS = { open: 2, overdue: 1, today: 1, due: 0, done: 1 };

const OPEN_TASKS = [
  {
    id: 87,
    title: 'Site photos for Dave',
    detail: 'Take ridge shots',
    type: 'manual',
    priority: 'high',
    due_date: '2026-09-22',
    status: 'open',
    lead_name: 'Dave Whitfield',
    assignees: [{ id: 3, name: 'Jamie Fisher', role: 'STAFF' }],
  },
  {
    id: 88,
    title: 'Collect leftover tiles',
    type: 'manual',
    priority: 'normal',
    due_date: '2026-09-30',
    status: 'open',
    lead_name: 'Helen Ackroyd',
    assignees: [{ id: 3, name: 'Jamie Fisher', role: 'STAFF' }],
  },
];

function renderStaffTasks(path = '/staff/tasks') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/staff/tasks" element={<StaffTasks />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('StaffTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
    api.get.mockImplementation(async (path) => {
      const p = String(path);
      if (p.includes('when=done')) {
        return {
          tasks: [{ id: 9, title: 'Old chase', type: 'manual', priority: 'high', due_date: '2026-09-01', status: 'done' }],
          counts: COUNTS,
        };
      }
      return { tasks: OPEN_TASKS, counts: COUNTS };
    });
  });

  it('lists assigned tasks without office edit or add controls', async () => {
    renderStaffTasks();
    expect(await screen.findByText('Site photos for Dave')).toBeInTheDocument();
    expect(screen.getByText('Lead: Dave Whitfield')).toBeInTheDocument();
    expect(screen.getAllByText('Assigned to').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Jamie Fisher').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Field staff').length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /lead: dave whitfield/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /add task/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /edit site photos for dave/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /delete site photos for dave/i })).toBeNull();
    expect(api.get).toHaveBeenCalledWith('/staff/tasks?status=open');
    expect(screen.getByRole('button', { name: /all open/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('asks before marking a task done', async () => {
    const user = userEvent.setup();
    api.put.mockResolvedValue({ ok: true });
    renderStaffTasks();
    expect(await screen.findByText('Site photos for Dave')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /mark "site photos for dave" done/i }));
    expect(screen.getByRole('heading', { name: /mark task done/i })).toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /^mark done$/i }));
    expect(api.put).toHaveBeenCalledWith('/staff/tasks/87', { status: 'done' });
  });

  it('highlights the task from ?when=&task= on that view', async () => {
    renderStaffTasks('/staff/tasks?when=overdue&task=87');
    expect(await screen.findByText('Site photos for Dave')).toBeInTheDocument();
    const row = screen.getByText('Site photos for Dave').closest('.card');
    expect(row.className).toMatch(/ring-2/);
  });

  it('opens Done from the chip', async () => {
    const user = userEvent.setup();
    renderStaffTasks();
    expect(await screen.findByText('Site photos for Dave')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /1\s+done/i }));
    expect(await screen.findByText('Old chase')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/staff/tasks?when=done');
  });
});
