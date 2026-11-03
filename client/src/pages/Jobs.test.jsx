import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Jobs from './Jobs.jsx';
import { api } from '../lib/api';
import { pickSelectOption } from '../test/selectMenu.js';

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
  money: (n) => `£${n}`,
  fmtDate: (d) => `d:${d}`,
}));

vi.mock('../components/DatePicker.jsx', () => ({
  default: ({ id, label, value, onChange, placeholder }) => (
    <label>
      {label}
      <input
        id={id}
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  ),
}));

vi.mock('../components/JobModal.jsx', () => ({
  default: ({ jobId, onClose }) => (jobId ? (
    <div role="dialog">
      Job {jobId}
      <button type="button" onClick={onClose}>Close</button>
    </div>
  ) : null),
}));

const REROOF = {
  id: 4,
  customer_id: 9,
  lead_id: 40,
  title: 'Re-roof front slope',
  customer_name: 'testdeveloper',
  lead_ref: 'L-0001',
  quote_ref: 'Q-2026-0001',
  address: 'eee',
  start_date: '2026-11-10',
  end_date: '2026-11-12',
  status: 'SCHEDULED',
  priority: 'high',
  value: 4800,
  crew: 'Jamie Cole',
};

describe('office Jobs list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation(async (path) => {
      if (String(path).startsWith('/jobs')) {
        return { jobs: [REROOF] };
      }
      if (String(path).includes('/settings/users')) {
        return { users: [{ id: 2, name: 'Jamie Cole', role: 'STAFF', active: true }] };
      }
      return {};
    });
  });

  it('renders a table of jobs with lead, crew, value and status', async () => {
    render(<MemoryRouter><Jobs /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Jobs' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Re-roof front slope' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'L-0001 - testdeveloper' })).toHaveAttribute(
      'href',
      '/leads/9?from=jobs&lead=40',
    );
    expect(screen.getByText('Jamie Cole')).toBeInTheDocument();
    expect(screen.getByText('£4800')).toBeInTheDocument();
    expect(screen.getByText('From Q-2026-0001')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith(expect.stringMatching(/^\/jobs\?status=ALL/));
  });

  it('filters by status and priority', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><Jobs /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Jobs' });
    await user.click(screen.getByRole('button', { name: 'Scheduled' }));
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('status=SCHEDULED'));
    });
    await pickSelectOption(user, /filter by priority/i, 'high');
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringMatching(/status=SCHEDULED.*priority=high|priority=high.*status=SCHEDULED/));
    });
  });

  it('opens the job card from the table', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><Jobs /></MemoryRouter>);
    await user.click(await screen.findByRole('button', { name: 'Re-roof front slope' }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Job 4');
  });
});
