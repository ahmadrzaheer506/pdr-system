import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import StaffHours from './StaffHours.jsx';
import { api } from '../../lib/api';
import { formatClockTime } from '../../lib/clockTime';

vi.mock('../../lib/api', () => ({
  api: { get: vi.fn() },
  fmtDate: () => 'Fri 2 Oct',
}));

vi.mock('../../components/ClockWidget.jsx', () => ({ default: () => null }));

describe('StaffHours clock times', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows clock in and out in local time instead of UTC ISO digits', async () => {
    const clockIn = '2026-10-02T14:29:00.000Z';
    const clockOut = '2026-10-02T14:47:00.000Z';
    api.get.mockResolvedValue({
      timesheets: [{
        id: 1,
        job_title: 'General',
        customer_name: '',
        work_date: '2026-10-02',
        clock_in: clockIn,
        clock_out: clockOut,
        break_minutes: 0,
        worked_minutes: 8,
        status: 'completed',
      }],
      total_hours: 0.1,
    });
    render(<StaffHours />);
    const localRange = `${formatClockTime(clockIn)} – ${formatClockTime(clockOut)}`;
    expect(await screen.findByText('General')).toBeInTheDocument();
    expect(screen.getByText(localRange)).toBeInTheDocument();
    if (localRange !== '14:29 – 14:47') {
      expect(screen.queryByText('14:29 – 14:47')).not.toBeInTheDocument();
    }
  });
});
