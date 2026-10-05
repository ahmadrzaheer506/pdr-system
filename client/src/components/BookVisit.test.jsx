import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BookVisit from './BookVisit.jsx';
import { api } from '../lib/api';
import { pickSelectOption } from '../test/selectMenu.js';

vi.mock('../lib/api', () => ({
  api: { post: vi.fn(), get: vi.fn(), put: vi.fn() },
}));

const customer = {
  id: 9,
  name: 'Dave Whitfield',
  sites: [
    { id: 1, address: '14 Elm Grove', postcode: 'RG1 5AB', is_primary: true },
    { id: 2, address: 'Garage roof', postcode: 'RG1 5AB', is_primary: false },
  ],
  phones: [{ id: 3, value: '07700 900100', type: 'mobile', is_primary: true }],
  emails: [{ id: 4, value: 'dave@example.com', type: 'personal', is_primary: true }],
};

const PEOPLE = {
  users: [
    { id: 1, name: 'Paul Douglas', role: 'ADMIN', active: true },
    { id: 2, name: 'Lisa Grant', role: 'OFFICE', active: true },
    { id: 3, name: 'Jamie Fisher', role: 'STAFF', active: true },
  ],
};

async function pickJamie(user) {
  await pickSelectOption(user, /^assigned to$/i, /jamie fisher/i);
}

describe('BookVisit contact pickers (requirement 2.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.post.mockResolvedValue({ id: 11 });
    api.get.mockImplementation(async (path) => {
      if (path === '/settings/users') return PEOPLE;
      if (String(path).startsWith('/customers/')) return { customer };
      return {};
    });
  });

  it('defaults to primary contacts and posts the selected site, phone, and email', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(<BookVisit open onClose={() => {}} customer={customer} onSaved={onSaved} />);
    expect(screen.getByLabelText(/^site$/i)).toHaveAttribute('data-value', '1');
    await pickSelectOption(user, /^site$/i, '2');
    await pickJamie(user);
    await user.click(screen.getByRole('button', { name: /book visit/i }));
    expect(api.post).toHaveBeenCalledWith('/appointments', expect.objectContaining({
      customer_id: 9,
      site_id: 2,
      phone_id: 3,
      email_id: 4,
      visit_type: 'site_visit',
      assignee_ids: [3],
    }));
    expect(onSaved).toHaveBeenCalled();
  });

  it('shows the API error when booking fails', async () => {
    const user = userEvent.setup();
    api.post.mockRejectedValueOnce(new Error('Selected site does not belong to this customer'));
    render(<BookVisit open onClose={() => {}} customer={customer} onSaved={() => {}} />);
    await pickJamie(user);
    await user.click(screen.getByRole('button', { name: /book visit/i }));
    expect(screen.getByText(/does not belong to this customer/i)).toBeInTheDocument();
  });

  it('loads the customer by id when booking from pipeline or inbox (requirement 5.1)', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(<BookVisit open onClose={() => {}} customerId={9} onSaved={onSaved} />);
    expect(await screen.findByLabelText(/^site$/i)).toHaveAttribute('data-value', '1');
    expect(api.get).toHaveBeenCalledWith('/customers/9');
    await pickJamie(user);
    await user.click(screen.getByRole('button', { name: /book visit/i }));
    expect(api.post).toHaveBeenCalledWith('/appointments', expect.objectContaining({
      customer_id: 9,
      site_id: 1,
      phone_id: 3,
      email_id: 4,
      visit_type: 'site_visit',
      assignee_ids: [3],
    }));
    expect(onSaved).toHaveBeenCalled();
  });

  it('posts a required visit type from the picker (requirement 5.3)', async () => {
    const user = userEvent.setup();
    render(<BookVisit open onClose={() => {}} customer={customer} onSaved={() => {}} />);
    await pickSelectOption(user, /^visit type$/i, 'measure');
    await pickJamie(user);
    await user.click(screen.getByRole('button', { name: /book visit/i }));
    expect(api.post).toHaveBeenCalledWith('/appointments', expect.objectContaining({
      visit_type: 'measure',
      title: 'Measure — Dave Whitfield',
      assignee_ids: [3],
    }));
  });

  it('updates an existing visit instead of booking a new one', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    api.put.mockResolvedValue({ ok: true });
    const existing = {
      id: 40,
      visit_type: 'follow_up',
      start: '2026-10-10T09:00:00.000Z',
      end: '2026-10-10T10:00:00.000Z',
      notes: 'Check flashing',
      site_id: 1,
      phone_id: 3,
      email_id: 4,
      assignee_ids: [3],
    };
    render(<BookVisit open onClose={() => {}} customer={customer} existing={existing} onSaved={onSaved} />);
    expect(screen.getByRole('heading', { name: /reschedule visit/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^visit type$/i)).toHaveAttribute('data-value', 'follow_up');
    await user.click(screen.getByRole('button', { name: /save visit/i }));
    expect(api.post).not.toHaveBeenCalled();
    expect(api.put).toHaveBeenCalledWith('/appointments/40', expect.objectContaining({
      visit_type: 'follow_up',
      assignee_ids: [3],
    }));
    expect(onSaved).toHaveBeenCalled();
  });
});
