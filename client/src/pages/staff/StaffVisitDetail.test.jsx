import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import StaffVisitDetail from './StaffVisitDetail.jsx';
import { api } from '../../lib/api';

vi.mock('../../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn() },
  fmtDate: () => '3 Oct',
}));

const VISIT = {
  id: 50,
  title: 'Site visit — Sandra Cole',
  customer_name: 'Sandra Cole',
  customer_phone: '07700 111222',
  address: '22 Birch Close, Caversham',
  start: '2026-10-03T09:00:00.000Z',
  end: '2026-10-03T10:00:00.000Z',
  visit_type: 'site_visit',
  status: 'booked',
  notes: 'Look at the valley',
  assignee_name: 'Jamie Fisher',
};

function renderVisit() {
  return render(
    <MemoryRouter initialEntries={['/staff/visits/50']}>
      <Routes>
        <Route path="/staff/visits/:id" element={<StaffVisitDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('StaffVisitDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({ visit: VISIT });
  });

  it('shows the visit and lets staff tick it complete from the main card', async () => {
    const user = userEvent.setup();
    api.post.mockResolvedValue({ ok: true, has_quote: false, task_id: 44 });
    renderVisit();
    expect(await screen.findByRole('heading', { name: 'Sandra Cole' })).toBeInTheDocument();
    expect(screen.getByText(/look at the valley/i)).toBeInTheDocument();
    const card = screen.getByRole('heading', { name: 'Sandra Cole' }).closest('.card');
    expect(card).toContainElement(screen.getByRole('checkbox', { name: /visit completed/i }));
    await user.click(screen.getByRole('checkbox', { name: /visit completed/i }));
    await user.type(screen.getByLabelText(/completion remarks/i), 'Need a quote for the valley');
    await user.click(screen.getByRole('button', { name: /^complete visit$/i }));
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/staff/visits/50/complete', { complete_note: 'Need a quote for the valley' });
    });
  });

  it('shows the visit as ticked after it is done, with remarks on the card', async () => {
    api.get.mockResolvedValue({ visit: { ...VISIT, status: 'done', complete_note: 'Measured up' } });
    renderVisit();
    expect(await screen.findByRole('heading', { name: 'Sandra Cole' })).toBeInTheDocument();
    expect(screen.getByText('Visit completed')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /visit completed/i })).toBeNull();
    expect(screen.getByText(/measured up/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sandra Cole' }).closest('.card')).toContainElement(screen.getByText(/measured up/i));
  });
});
