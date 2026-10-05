import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import StaffJobs from './StaffJobs.jsx';
import { api } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  api: { get: vi.fn() },
  fmtDate: (d, opts) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', opts),
}));

describe('StaffJobs (requirement 9.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 2, 1, 19, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists a job on the assigned work date, even when that day is not today', async () => {
    api.get.mockResolvedValue({
      jobs: [{
        id: 12,
        title: 'test',
        address: '25 Feet Bazaar, Gujranwala',
        start_date: '2026-10-04',
        end_date: '2026-10-04',
        start_time: '08:00',
        end_time: '16:30',
        priority: 'normal',
        crew: ['Liam Ozturk', 'newtest1122'],
        work_dates: ['2026-10-04'],
      }],
    });
    render(
      <MemoryRouter>
        <StaffJobs />
      </MemoryRouter>,
    );
    expect(await screen.findByText('test')).toBeInTheDocument();
    expect(screen.getByText(/sunday 4 oct/i)).toBeInTheDocument();
    expect(screen.queryByText(/^today$/i)).toBeNull();
    expect(screen.getByText(/with liam ozturk, newtest1122/i)).toBeInTheDocument();
  });
});
