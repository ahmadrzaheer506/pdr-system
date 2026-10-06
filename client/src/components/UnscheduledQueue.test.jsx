import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UnscheduledQueue from './UnscheduledQueue.jsx';
import { api } from '../lib/api';
import { pickDate } from '../test/datePicker.js';
import { addIsoDays, localIsoDate, shortUkDate } from '../lib/schedule';

vi.mock('../lib/api', () => ({
  api: { put: vi.fn(), get: vi.fn() },
  fmtDate: (d) => d || '—',
}));

const STAFF = [
  { id: 3, name: 'Jamie Fisher', color: '#16a34a', skills: ['roofer'] },
  { id: 4, name: 'Liam Ozturk', color: '#d97706', skills: ['labourer'] },
];

describe('UnscheduledQueue (requirement 8.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.put.mockResolvedValue({ ok: true });
    api.get.mockResolvedValue({ holidays: [], bookings: [] });
  });

  it('places a PENDING job with start and optional end date', async () => {
    const user = userEvent.setup();
    const onPlaced = vi.fn();
    render(
      <UnscheduledQueue
        jobs={[{ id: 12, title: 'Guttering', customer_name: 'Helen', priority: 'high' }]}
        onPlaced={onPlaced}
        onError={() => {}}
        onOpen={() => {}}
      />,
    );
    const start = localIsoDate();
    const end = addIsoDays(start, 1);
    expect(screen.getByLabelText(/start date for guttering/i)).toHaveAttribute('min', start);
    expect(screen.getByLabelText(/end date for guttering/i)).toHaveAttribute('min', start);
    await pickDate(user, /start date for guttering/i, start);
    await pickDate(user, /end date for guttering/i, end);
    await user.click(screen.getByRole('button', { name: /place guttering/i }));
    expect(api.put).toHaveBeenCalledWith('/jobs/12', {
      start_date: start,
      end_date: end,
    });
    expect(onPlaced).toHaveBeenCalled();
  });

  it('shows staff chips after a start date and confirms booked crew like JobModal', async () => {
    const user = userEvent.setup();
    const onPlaced = vi.fn();
    const start = localIsoDate();
    render(
      <UnscheduledQueue
        jobs={[{ id: 12, title: 'Porch roof rebuild', customer_name: 'Helen Ackroyd', priority: 'normal' }]}
        staff={STAFF}
        holidays={[]}
        weekJobs={[{
          id: 9,
          title: 'Hall extension',
          start_date: start,
          end_date: start,
          day_assignments: [{ work_date: start, user_id: 3, name: 'Jamie Fisher' }],
        }]}
        onPlaced={onPlaced}
        onError={() => {}}
        onOpen={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: /jamie fisher/i })).not.toBeInTheDocument();
    await pickDate(user, /start date for porch roof rebuild/i, start);
    expect(await screen.findByRole('button', { name: /jamie fisher already on hall extension/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /liam ozturk/i })).toBeInTheDocument();
    await user.hover(screen.getByRole('button', { name: /jamie fisher already on hall extension/i }));
    expect(await screen.findByRole('tooltip', { name: /Jamie Fisher is already booked on “Hall extension”\. You can still book/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /jamie fisher already on hall extension/i }));
    await user.click(screen.getByRole('button', { name: /place porch roof rebuild/i }));
    expect(api.put).not.toHaveBeenCalled();
    expect(await screen.findByRole('heading', { name: /assign with conflicts/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Jamie Fisher is already booked on “Hall extension”/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /assign anyway/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /assign anyway/i }));
    expect(api.put).toHaveBeenCalledWith('/jobs/12', {
      start_date: start,
      end_date: start,
    });
    expect(api.put).toHaveBeenCalledWith('/jobs/12/assignments', {
      work_date: start,
      work_dates: [start],
      user_ids: [3],
      confirm_conflicts: true,
    });
    expect(onPlaced).toHaveBeenCalled();
  });

  it('checks later days of a multi-day place for booked crew', async () => {
    const user = userEvent.setup();
    const onPlaced = vi.fn();
    const start = localIsoDate();
    const later = addIsoDays(start, 2);
    render(
      <UnscheduledQueue
        jobs={[{ id: 12, title: 'Porch roof rebuild', customer_name: 'Helen Ackroyd' }]}
        staff={STAFF}
        holidays={[]}
        weekJobs={[{
          id: 9,
          title: 'Hall extension',
          start_date: later,
          end_date: later,
          day_assignments: [{ work_date: later, user_id: 3, name: 'Jamie Fisher' }],
        }]}
        onPlaced={onPlaced}
        onError={() => {}}
        onOpen={() => {}}
      />,
    );
    await pickDate(user, /start date for porch roof rebuild/i, start);
    await pickDate(user, /end date for porch roof rebuild/i, later);
    expect(await screen.findByRole('button', { name: /jamie fisher already on hall extension/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /jamie fisher already on hall extension/i }));
    expect(await screen.findByText(`Jamie Fisher is already booked on “Hall extension” on ${shortUkDate(later)}.`)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /place porch roof rebuild/i }));
    expect(await screen.findByRole('heading', { name: /assign with conflicts/i })).toBeInTheDocument();
    expect(screen.getAllByText(shortUkDate(later)).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: /assign anyway/i }));
    expect(api.put).toHaveBeenCalledWith('/jobs/12/assignments', {
      work_date: start,
      work_dates: [start, addIsoDays(start, 1), later],
      user_ids: [3],
      confirm_conflicts: true,
    });
    expect(onPlaced).toHaveBeenCalled();
  });
});
