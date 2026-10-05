import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import StaffVisits from './StaffVisits.jsx';
import { api } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn() },
  fmtDate: (d, opts) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', opts),
}));

const BOOKED = {
  id: 50,
  title: 'Site visit — Sandra Cole',
  customer_name: 'Sandra Cole',
  address: '22 Birch Close, Caversham',
  start: '2026-10-03T09:00:00.000Z',
  end: '2026-10-03T10:00:00.000Z',
  visit_type: 'site_visit',
  status: 'booked',
  assignee_name: 'Jamie Fisher',
};

const DONE = {
  ...BOOKED,
  id: 51,
  start: '2026-10-01T09:00:00.000Z',
  end: '2026-10-01T10:00:00.000Z',
  status: 'done',
  complete_note: 'Valley flashing is sound',
};

function renderVisits() {
  return render(
    <MemoryRouter>
      <StaffVisits />
    </MemoryRouter>,
  );
}

describe('StaffVisits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 2, 12, 0, 0));
    api.get.mockResolvedValue({ visits: [BOOKED, DONE] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists uncompleted visits by default and hides completed ones', async () => {
    renderVisits();
    expect(await screen.findByText('Sandra Cole')).toBeInTheDocument();
    expect(screen.getByText('Site visit')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sandra cole/i })).toHaveAttribute('href', '/staff/visits/50');
    expect(screen.getByRole('checkbox', { name: /visit completed/i })).toBeInTheDocument();
    expect(screen.queryByText(/valley flashing is sound/i)).not.toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/staff/visits?from=2026-07-04&to=2026-10-15');
    expect(screen.getByRole('button', { name: /uncompleted/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /^\d+ completed$/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('filters completed visits from the status cards', async () => {
    const user = userEvent.setup();
    renderVisits();
    expect(await screen.findByRole('button', { name: /uncompleted/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^\d+ completed$/i }));
    expect(screen.getByText(/valley flashing is sound/i)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /visit completed/i })).not.toBeInTheDocument();
  });

  it('lets staff complete a visit from the list with optional remarks', async () => {
    const user = userEvent.setup();
    api.post.mockResolvedValue({ ok: true });
    renderVisits();
    await user.click(await screen.findByRole('checkbox', { name: /visit completed/i }));
    expect(screen.getByLabelText(/completion remarks/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/completion remarks/i), 'Ridge tiles ok');
    await user.click(screen.getByRole('button', { name: /^complete visit$/i }));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/staff/visits/50/complete', { complete_note: 'Ridge tiles ok' });
    });
  });

  it('shows an empty state when nothing is assigned', async () => {
    api.get.mockResolvedValue({ visits: [] });
    renderVisits();
    expect(await screen.findByText(/no visits scheduled/i)).toBeInTheDocument();
  });
});
