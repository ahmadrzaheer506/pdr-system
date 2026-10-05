import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StaffHolidays from './StaffHolidays.jsx';
import { api } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), del: vi.fn() },
  fmtDate: (d) => d,
}));

describe('StaffHolidays (requirement 10.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation(async (path) => {
      if (path === '/staff/holidays/mine') return { holidays: [], notice_days: 28, allowance: 28, used: 0, remaining: 28, year: 2026 };
      if (path === '/staff/holidays/team') return { holidays: [] };
      return {};
    });
  });

  it('blocks dates inside the notice window on the date picker', async () => {
    const user = userEvent.setup();
    render(<StaffHolidays />);
    await user.click(await screen.findByRole('button', { name: /request holiday/i }));
    const expected = new Date(Date.now() + 28 * 86400000).toISOString().slice(0, 10);
    expect(screen.getByRole('radio', { name: /single day/i })).toHaveAttribute('aria-checked', 'true');
    expect(await screen.findByLabelText(/^date$/i)).toHaveAttribute('min', expected);
  });

  it('lets staff withdraw a pending request', async () => {
    api.get.mockImplementation(async (path) => {
      if (path === '/staff/holidays/mine') {
        return {
          holidays: [{
            id: 11, start_date: '2026-10-23', end_date: '2026-10-24', days: 2,
            reason: 'Family', status: 'pending',
          }],
          notice_days: 28, allowance: 28, used: 2, remaining: 26, year: 2026,
        };
      }
      if (path === '/staff/holidays/team') return { holidays: [] };
      return {};
    });
    api.del.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<StaffHolidays />);
    await user.click(await screen.findByRole('button', { name: /^withdraw$/i }));
    expect(api.del).toHaveBeenCalledWith('/holidays/11');
  });

  it('shows used and remaining allowance', async () => {
    api.get.mockImplementation(async (path) => {
      if (path === '/staff/holidays/mine') {
        return { holidays: [], notice_days: 28, allowance: 28, used: 5, remaining: 23, year: 2026 };
      }
      if (path === '/staff/holidays/team') return { holidays: [] };
      return {};
    });
    render(<StaffHolidays />);
    expect(await screen.findByText(/5 used · 23 of 28 left in 2026/i)).toBeInTheDocument();
  });
});
