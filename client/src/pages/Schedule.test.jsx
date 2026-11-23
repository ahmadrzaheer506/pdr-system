import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Schedule from './Schedule.jsx';
import { api } from '../lib/api';
import { addIsoDays, localIsoDate, startOfWeekMonday } from '../lib/schedule';

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

vi.mock('../components/AiAssistant.jsx', () => ({
  default: () => <div>AI assistant</div>,
}));

vi.mock('../components/UnscheduledQueue.jsx', () => ({
  default: () => <div>Unscheduled queue</div>,
}));

vi.mock('../components/JobModal.jsx', () => ({
  default: () => null,
}));

function otherDayInWeek() {
  const today = localIsoDate();
  const monday = localIsoDate(startOfWeekMonday(new Date()));
  return today === monday ? addIsoDays(monday, 1) : monday;
}

function openDayLabel(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  const heading = new Date(year, month - 1, day).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
  });
  return new RegExp(`open ${heading}`, 'i');
}

describe('Schedule page availability sync', () => {
  const pickIso = otherDayInWeek();

  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation(async (path) => {
      if (String(path).startsWith('/jobs?')) {
        return {
          jobs: [{
            id: 8,
            title: 'Guttering',
            customer_name: 'Helen',
            start_date: pickIso,
            end_date: pickIso,
            day_assignments: [{ work_date: pickIso, user_id: 2, name: 'Ryan' }],
          }],
        };
      }
      if (String(path).startsWith('/holidays/calendar')) return { holidays: [] };
      if (path === '/jobs/unscheduled') return { jobs: [] };
      if (path === '/settings/users') {
        return {
          users: [
            { id: 1, name: 'Callum Ashworth', role: 'STAFF', skills: ['labourer'] },
            { id: 2, name: 'Ryan Kaczmarek', role: 'STAFF', skills: ['roofer'] },
          ],
        };
      }
      if (path === '/skills') return { skills: [] };
      if (path === '/job-types') return { job_types: [] };
      return {};
    });
  });

  it('moves team availability onto the weekday that was opened', async () => {
    const user = userEvent.setup();
    render(<Schedule />);
    expect(await screen.findByRole('heading', { name: /team availability today/i })).toBeInTheDocument();
    expect(await screen.findByText('2 available')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: openDayLabel(pickIso) }));
    expect(await screen.findByRole('heading', { name: 'Day view' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /week view/i })).toBeInTheDocument();
    const [year, month, day] = pickIso.split('-').map(Number);
    const boardDate = new Date(year, month - 1, day).toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
    });
    expect(screen.getByText(new RegExp(`${boardDate} - who can take work`, 'i'))).toBeInTheDocument();
    expect(screen.getByText('1 available')).toBeInTheDocument();
    expect(screen.getByText('1 on a job')).toBeInTheDocument();
    expect(screen.getAllByText('Guttering').length).toBeGreaterThan(0);
  });

  it('keeps availability on that day after returning to week view, then Today resets it', async () => {
    const user = userEvent.setup();
    render(<Schedule />);
    await screen.findByText('2 available');
    await user.click(screen.getByRole('button', { name: openDayLabel(pickIso) }));
    expect(await screen.findByText('1 on a job')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /week view/i }));
    expect(screen.getByRole('heading', { name: 'Week view' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: openDayLabel(pickIso) })).toHaveAttribute('aria-current', 'date');
    expect(screen.getByText('1 on a job')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^today$/i }));
    expect(await screen.findByRole('heading', { name: /team availability today/i })).toBeInTheDocument();
    expect(screen.getByText('2 available')).toBeInTheDocument();
  });
});
