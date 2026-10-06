import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DayView from './DayView.jsx';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: { put: vi.fn() },
}));

const STAFF = [
  { id: 3, name: 'Jamie Fisher', color: '#16a34a', skills: ['roofer'] },
  { id: 4, name: 'Liam Ozturk', color: '#d97706', skills: ['labourer'] },
];

describe('DayView (requirement 8.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.put.mockResolvedValue({ ok: true, warnings: [] });
  });

  it('lists that day’s jobs and can go back to week view', async () => {
    const user = userEvent.setup();
    const onBackToWeek = vi.fn();
    render(
      <DayView
        dateIso="2026-09-22"
        jobs={[{
          id: 1,
          title: 'Porch roof rebuild',
          customer_name: 'Helen',
          start_date: '2026-09-22',
          end_date: '2026-09-22',
          priority: 'normal',
          day_assignments: [{ work_date: '2026-09-22', user_id: 3, name: 'Callum', color: '#db2777' }],
        }]}
        holidays={[]}
        onJobClick={() => {}}
        onDateChange={() => {}}
        onBackToWeek={onBackToWeek}
      />,
    );
    expect(screen.getByText('Porch roof rebuild')).toBeInTheDocument();
    expect(screen.getByText(/tuesday 22 sep/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /week view/i }));
    expect(onBackToWeek).toHaveBeenCalled();
  });

  it('caps the day board and scrolls when many jobs are listed', () => {
    const jobs = Array.from({ length: 8 }, (_, i) => ({
      id: i + 1,
      title: `Day job ${i + 1}`,
      customer_name: 'Helen',
      start_date: '2026-09-22',
      end_date: '2026-09-22',
      priority: 'normal',
      day_assignments: [],
    }));
    render(
      <DayView
        dateIso="2026-09-22"
        jobs={jobs}
        holidays={[]}
        onJobClick={() => {}}
        onDateChange={() => {}}
        onBackToWeek={() => {}}
      />,
    );
    const list = screen.getByRole('region', { name: /jobs on tuesday 22 sep/i });
    expect(list.className).toMatch(/overflow-y-auto/);
    expect(list.className).toMatch(/max-h-\[32rem\]/);
    expect(list.parentElement.className).not.toMatch(/h-\[36rem\]/);
    expect(screen.getByText('Day job 8')).toBeInTheDocument();
  });

  it('assigns crew for the open day from the board (requirement 8.2)', async () => {
    const user = userEvent.setup();
    const onCrewAssigned = vi.fn();
    render(
      <DayView
        dateIso="2026-09-22"
        jobs={[{
          id: 1,
          title: 'Porch roof rebuild',
          customer_name: 'Helen',
          start_date: '2026-09-22',
          end_date: '2026-09-22',
          priority: 'normal',
          day_assignments: [],
        }]}
        holidays={[{ id: 9, user_id: 4, user_name: 'Liam Ozturk', start_date: '2026-09-22', end_date: '2026-09-22' }]}
        staff={STAFF}
        onJobClick={() => {}}
        onDateChange={() => {}}
        onBackToWeek={() => {}}
        onCrewAssigned={onCrewAssigned}
      />,
    );
    expect(screen.getByLabelText(/Liam Ozturk on holiday/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Liam Ozturk on holiday/i }));
    expect(api.put).not.toHaveBeenCalled();
    expect(await screen.findByRole('heading', { name: /assign with conflicts/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /assign anyway/i }));
    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/jobs/1/assignments', {
        work_date: '2026-09-22', user_ids: [4], confirm_conflicts: true,
      });
    });
  });

  it('assigns available crew without a confirm prompt', async () => {
    const user = userEvent.setup();
    const onCrewAssigned = vi.fn();
    render(
      <DayView
        dateIso="2026-09-22"
        jobs={[{
          id: 1,
          title: 'Porch roof rebuild',
          customer_name: 'Helen',
          start_date: '2026-09-22',
          end_date: '2026-09-22',
          priority: 'normal',
          day_assignments: [],
        }]}
        holidays={[{ id: 9, user_id: 4, user_name: 'Liam Ozturk', start_date: '2026-09-22', end_date: '2026-09-22' }]}
        staff={STAFF}
        onJobClick={() => {}}
        onDateChange={() => {}}
        onBackToWeek={() => {}}
        onCrewAssigned={onCrewAssigned}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Jamie Fisher/i }));
    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/jobs/1/assignments', { work_date: '2026-09-22', user_ids: [3] });
    });
  });

  it('opens a job with the day being viewed', async () => {
    const user = userEvent.setup();
    const onJobClick = vi.fn();
    render(
      <DayView
        dateIso="2026-10-08"
        jobs={[{
          id: 12,
          title: 'Flat roof overlay',
          customer_name: 'Community Hall',
          start_date: '2026-10-06',
          end_date: '2026-10-08',
          priority: 'high',
          day_assignments: [],
        }]}
        holidays={[]}
        staff={STAFF}
        onJobClick={onJobClick}
        onDateChange={() => {}}
        onBackToWeek={() => {}}
      />,
    );
    await user.click(screen.getByRole('button', { name: /flat roof overlay/i }));
    expect(onJobClick).toHaveBeenCalledWith(12, '2026-10-08');
  });
});
