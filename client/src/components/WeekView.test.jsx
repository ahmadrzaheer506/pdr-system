import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WeekView from './WeekView.jsx';

describe('WeekView (requirement 8.1)', () => {
  it('opens a day when the weekday heading is clicked', async () => {
    const user = userEvent.setup();
    const onDayClick = vi.fn();
    render(
      <WeekView
        anchorDate={new Date(2026, 8, 21)}
        jobs={[{
          id: 1,
          title: 'Porch roof rebuild',
          customer_name: 'Helen',
          start_date: '2026-09-21',
          end_date: '2026-09-21',
          priority: 'normal',
          day_assignments: [],
        }]}
        holidays={[]}
        onJobClick={() => {}}
        onDayClick={onDayClick}
      />,
    );
    expect(screen.getByText('Porch roof rebuild')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /open mon 21/i }));
    expect(onDayClick).toHaveBeenCalledWith('2026-09-21');
  });

  it('shows the full title and customer on hover, without ellipsis', async () => {
    const user = userEvent.setup();
    render(
      <WeekView
        anchorDate={new Date(2026, 9, 6)}
        jobs={[{
          id: 1,
          title: 'Flat roof overlay — hall extension',
          customer_name: 'Community Hall Trust',
          start_date: '2026-10-06',
          end_date: '2026-10-06',
          priority: 'high',
          day_assignments: [],
        }]}
        holidays={[]}
        onJobClick={() => {}}
        onDayClick={() => {}}
      />,
    );
    await user.hover(screen.getByRole('button', { name: /flat roof overlay — hall extension/i }));
    const tip = await screen.findByRole('tooltip');
    expect(tip).toHaveTextContent('Flat roof overlay — hall extension');
    expect(tip).toHaveTextContent('Community Hall Trust');
    expect(tip.textContent).not.toMatch(/\.\.\./);
  });

  it('shows every assigned crew member on the job card', () => {
    const crew = [
      { work_date: '2026-10-06', user_id: 1, name: 'Ryan Kaczmarek', color: '#1d4ed8' },
      { work_date: '2026-10-06', user_id: 2, name: 'Jamie Fisher', color: '#16a34a' },
      { work_date: '2026-10-06', user_id: 3, name: 'Liam Ozturk', color: '#d97706' },
      { work_date: '2026-10-06', user_id: 4, name: 'Nathan Wren', color: '#0f766e' },
      { work_date: '2026-10-06', user_id: 5, name: 'Connor Blake', color: '#7c3aed' },
      { work_date: '2026-10-06', user_id: 6, name: 'Callum Ashworth', color: '#db2777' },
      { work_date: '2026-10-06', user_id: 7, name: 'sahilmubeen', color: '#ea580c' },
    ];
    render(
      <WeekView
        anchorDate={new Date(2026, 9, 6)}
        jobs={[{
          id: 1,
          title: 'Guttering & fascia replacement',
          customer_name: 'Alan & Denise Fitch',
          start_date: '2026-10-06',
          end_date: '2026-10-06',
          priority: 'urgent',
          day_assignments: crew,
        }]}
        holidays={[]}
        onJobClick={() => {}}
        onDayClick={() => {}}
      />,
    );
    expect(screen.getByText('Urgent')).toBeInTheDocument();
    crew.forEach((member) => {
      expect(screen.getAllByTitle(member.name).length).toBeGreaterThan(0);
    });
  });

  it('marks assigned crew who are on holiday or another job (requirement 8.2)', () => {
    render(
      <WeekView
        anchorDate={new Date(2026, 8, 22)}
        jobs={[
          {
            id: 1,
            title: 'Porch roof rebuild',
            customer_name: 'Helen',
            start_date: '2026-09-22',
            end_date: '2026-09-22',
            priority: 'normal',
            day_assignments: [{ work_date: '2026-09-22', user_id: 3, name: 'Jamie', color: '#16a34a' }],
          },
          {
            id: 2,
            title: 'Guttering',
            customer_name: 'Helen',
            start_date: '2026-09-22',
            end_date: '2026-09-22',
            priority: 'normal',
            day_assignments: [{ work_date: '2026-09-22', user_id: 3, name: 'Jamie', color: '#16a34a' }],
          },
        ]}
        holidays={[{ id: 9, user_id: 4, user_name: 'Liam Ozturk', start_date: '2026-09-22', end_date: '2026-09-22' }]}
        onJobClick={() => {}}
        onDayClick={() => {}}
      />,
    );
    expect(screen.getAllByText('Already booked').length).toBeGreaterThan(0);
    expect(screen.getByText(/Liam off/i)).toBeInTheDocument();
  });

  it('shows missing skill and driver notes on a job card (requirement 8.3)', () => {
    render(
      <WeekView
        anchorDate={new Date(2026, 8, 22)}
        jobs={[{
          id: 1,
          title: 'Porch roof rebuild',
          customer_name: 'Helen',
          start_date: '2026-09-22',
          end_date: '2026-09-22',
          priority: 'normal',
          required_skills: ['slate'],
          needs_driver: true,
          day_assignments: [{ work_date: '2026-09-22', user_id: 4, name: 'Liam', color: '#d97706', skills: ['labourer'], is_driver: false }],
        }]}
        holidays={[]}
        onJobClick={() => {}}
        onDayClick={() => {}}
      />,
    );
    expect(screen.getByText(/nobody covering: slate/i)).toBeInTheDocument();
    expect(screen.getByText(/needs a driver — nobody assigned can drive/i)).toBeInTheDocument();
  });

  it('caps a busy day column and scrolls extra jobs', () => {
    const jobs = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      title: `Busy job ${i + 1}`,
      customer_name: 'Helen',
      start_date: '2026-09-22',
      end_date: '2026-09-22',
      priority: 'normal',
      day_assignments: [],
    }));
    render(
      <WeekView
        anchorDate={new Date(2026, 8, 22)}
        jobs={jobs}
        holidays={[]}
        onJobClick={() => {}}
        onDayClick={() => {}}
      />,
    );
    const list = screen.getByRole('region', { name: /jobs on tue 22/i });
    expect(list.className).toMatch(/overflow-y-auto/);
    expect(list.className).toMatch(/max-h-\[28rem\]/);
    expect(list.parentElement.className).not.toMatch(/h-\[32rem\]/);
    expect(screen.getByText('Busy job 10')).toBeInTheDocument();
  });

  it('keeps an empty day column short', () => {
    render(
      <WeekView
        anchorDate={new Date(2026, 8, 28)}
        jobs={[]}
        holidays={[]}
        onJobClick={() => {}}
        onDayClick={() => {}}
      />,
    );
    const list = screen.getByRole('region', { name: /jobs on mon 28/i });
    expect(list.parentElement.className).not.toMatch(/h-\[32rem\]/);
    expect(list.className).toMatch(/max-h-\[28rem\]/);
    expect(screen.getAllByText('—').length).toBe(7);
  });
});
