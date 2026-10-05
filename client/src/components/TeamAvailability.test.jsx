import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TeamAvailability from './TeamAvailability.jsx';

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
    expect(screen.getByText('Full re-roof — semi-detached')).toBeInTheDocument();
    expect(screen.getByText('Driver')).toBeInTheDocument();
    expect(screen.getAllByText('Roofer').length).toBeGreaterThan(0);
  });

  it('empty staff shows a quiet empty state', () => {
    render(<TeamAvailability staff={[]} holidays={[]} jobs={[]} today="2026-10-02" />);
    expect(screen.getByText('No field staff to show.')).toBeInTheDocument();
  });
});
