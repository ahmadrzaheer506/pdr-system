import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TeamAvailability from './TeamAvailability.jsx';

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(async () => ({ skills: [] })) },
}));

const staff = [
  { id: 1, name: 'Ryan Kaczmarek', color: '#f59e0b', skills: ['roofer', 'slate'], is_driver: true },
  { id: 2, name: 'Callum Ashworth', color: '#ec4899', skills: ['labourer'] },
  { id: 3, name: 'Jamie Fisher', color: '#22c55e', skills: ['roofer'] },
];

const jobs = [
  {
    id: 8,
    title: 'Full re-roof — semi-detached',
    day_assignments: [{ work_date: '2026-10-02', user_id: 1, name: 'Ryan' }],
  },
];

const holidays = [{ user_id: 3, start_date: '2026-10-02', end_date: '2026-10-02' }];

describe('TeamAvailability', () => {
  it('groups available, on-job, and holiday people into status columns', () => {
    render(<TeamAvailability staff={staff} holidays={holidays} jobs={jobs} today="2026-10-02" />);
    expect(screen.getByRole('heading', { name: 'Team availability today' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Available' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'On a job' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'On holiday' })).toBeInTheDocument();
    expect(screen.getByText('1 available')).toBeInTheDocument();
    expect(screen.getByText('1 on a job')).toBeInTheDocument();
    expect(screen.getByText('1 on holiday')).toBeInTheDocument();
    expect(screen.getByText('Callum Ashworth')).toBeInTheDocument();
    expect(screen.getByText('Ryan Kaczmarek')).toBeInTheDocument();
    expect(screen.getByText('Jamie Fisher')).toBeInTheDocument();
    expect(screen.getByText('Job assignee')).toBeInTheDocument();
    expect(screen.getByText('Assigned job')).toBeInTheDocument();
    expect(screen.getByText('Full re-roof — semi-detached')).toBeInTheDocument();
    expect(screen.getByText('Driver')).toBeInTheDocument();
    expect(screen.getAllByText('Roofer').length).toBeGreaterThan(0);
  });

  it('shows skill names instead of ids and expands the rest from Show more', async () => {
    const user = userEvent.setup();
    const catalogue = [
      { id: 1, name: 'Roofing' },
      { id: 2, name: 'Flat Roofing' },
      { id: 3, name: 'Lead Work' },
      { id: 4, name: 'Guttering & Plastics' },
      { id: 5, name: 'Brickwork & Masonry' },
      { id: 6, name: 'Joinery & Carpentry' },
    ];
    render(
      <TeamAvailability
        catalogue={catalogue}
        staff={[{
          id: 9,
          name: 'Daley',
          color: '#2563eb',
          skills: [
            { skill_id: 1, level: 'advanced' },
            { skill_id: 2, level: 'advanced' },
            { skill_id: 3, level: 'competent' },
            { skill_id: 4, level: 'trainee' },
            { skill_id: 5, level: 'trainee' },
            { skill_id: 6, level: 'competent' },
          ],
        }]}
        holidays={[]}
        jobs={[]}
        today="2026-10-02"
      />,
    );
    expect(screen.getByText('Roofing — Advanced')).toBeInTheDocument();
    expect(screen.getByText('Flat Roofing — Advanced')).toBeInTheDocument();
    expect(screen.queryByText('1 — Advanced')).not.toBeInTheDocument();
    expect(screen.queryByText('Brickwork & Masonry — Trainee')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /show all 6 skills for daley/i }));
    expect(screen.getByText('Brickwork & Masonry — Trainee')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /hide extra skills for daley/i })).toBeInTheDocument();
  });

  it('empty staff shows a quiet empty state', () => {
    render(<TeamAvailability staff={[]} holidays={[]} jobs={[]} today="2026-10-02" />);
    expect(screen.getByText('No field staff to show.')).toBeInTheDocument();
  });
});
