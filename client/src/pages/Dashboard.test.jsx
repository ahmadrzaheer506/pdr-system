import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from './Dashboard.jsx';
import { api } from '../lib/api';

vi.mock('../lib/auth.jsx', () => ({
  useAuth: () => ({ user: { name: 'Paul Douglas', role: 'ADMIN' } }),
}));

vi.mock('../lib/api', () => ({
  api: { get: vi.fn() },
  money: (n) => `£${Number(n || 0).toFixed(2)}`,
  fmtDate: (d) => d || '',
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  AreaChart: () => null,
  Area: () => null,
  BarChart: () => null,
  Bar: () => null,
  PieChart: () => null,
  Pie: () => null,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
}));

const HOME = {
  range: { from: '2026-08-29', to: '2026-09-28' },
  leads: {
    total: 6,
    bySource: [{ source: 'whatsapp', count: 3 }, { source: 'phone', count: 2 }, { source: 'email', count: 1 }],
    trend: [{ day: '2026-09-01', leads: 1 }, { day: '2026-09-22', leads: 2 }],
  },
  visits: 9,
  quotesSent: 8,
  quotesValue: 14318.4,
  won: 2,
  lost: 2,
  winRate: 50,
  avgJobValue: 2063.04,
  pipelineValue: 2400,
  pipelineCount: 4,
  customersByStage: [
    { stage: 'ENQUIRY', label: 'Enquiry', count: 2 },
    { stage: 'LOST', label: 'Lost', count: 5 },
  ],
  tasks: { open: 6, overdue: 6 },
  invoices: { outstanding: 1464, overdue: 1464, overdue_count: 1 },
};

describe('Dashboard home summary (requirement 14.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue(HOME);
  });

  it('shows lead volume, win/loss, pipeline value, and the operational tiles', async () => {
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(await screen.findByText('New leads')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /new leads/i })).toHaveAttribute('href', '/inbox');
    expect(screen.getByText('Site visits')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /site visits/i })).toHaveAttribute('href', '/visits');
    expect(screen.getByText('9')).toBeInTheDocument();
    expect(screen.getByText('Quotes sent')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /win rate/i })).toHaveTextContent('50%');
    expect(screen.getByText('2 won · 2 lost')).toBeInTheDocument();
    expect(screen.getByText('Avg job value')).toBeInTheDocument();
    expect(screen.getByText('£2063.04')).toBeInTheDocument();
    expect(screen.getByText('Pipeline value')).toBeInTheDocument();
    expect(screen.getByText('£2400.00')).toBeInTheDocument();
    expect(screen.getByText('Leads over time')).toBeInTheDocument();
    expect(screen.getByText('Leads by source')).toBeInTheDocument();
    expect(screen.getByText('Leads by pipeline stage')).toBeInTheDocument();
    expect(screen.getByText(/6 overdue tasks/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view tasks/i })).toHaveAttribute('href', '/tasks?when=overdue');
    expect(screen.getByText('Lead pipeline')).toBeInTheDocument();
    expect(screen.getByText('Outcomes')).toBeInTheDocument();
    expect(screen.getByText('Jobs')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /6 open tasks/i })).toHaveAttribute('href', '/tasks');
    expect(screen.getByRole('link', { name: /outstanding/i })).toHaveAttribute('href', '/invoices');
    expect(screen.queryByRole('link', { name: /view reports/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /download csv/i })).toBeNull();
    expect(screen.queryByLabelText('From')).toBeNull();
  });

  it('greets by first name without showing the calendar date', async () => {
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent(/^Good (morning|afternoon|evening), Paul$/);
    expect(heading).not.toHaveTextContent(/\d/);
    expect(screen.queryByText(/thursday|monday|tuesday|wednesday|friday|saturday|sunday/i)).toBeNull();
  });

  it('requests the 7-day window when that pill is chosen', async () => {
    const user = userEvent.setup({ delay: null });
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    await screen.findByText('New leads');
    await user.click(screen.getByRole('button', { name: '7d' }));
    expect(api.get).toHaveBeenLastCalledWith(expect.stringMatching(/^\/dashboard\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/));
  });
});
