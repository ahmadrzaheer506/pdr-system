import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Holidays from './Holidays.jsx';
import { api } from '../lib/api';
import { pickSelectOption } from '../test/selectMenu.js';
import { pickDate } from '../test/datePicker.js';
import { addIsoDays, localIsoDate } from '../lib/schedule';

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
  fmtDate: (d) => d,
}));

const pending = {
  id: 11, user_id: 4, user_name: 'Connor Blake', color: '#000',
  email: 'connor@pauldouglasroofing.co.uk', phone: '07700 900123',
  start_date: '2026-10-23', end_date: '2026-10-24', days: 2, reason: 'Family',
  status: 'pending', decline_reason: null,
};

async function openRequests(user) {
  await user.click(await screen.findByRole('button', { name: /^requests$/i }));
}

describe('Office Holidays book (requirement 10.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation(async (path) => {
      if (path.startsWith('/holidays')) return { holidays: [], notice_days: 28 };
      if (path === '/settings/users') {
        return { users: [{ id: 4, name: 'Jamie Fisher', role: 'STAFF', active: true }] };
      }
      return {};
    });
    api.post.mockResolvedValue({ id: 9, days: 3 });
  });

  it('lets office book a multi-day holiday without a notice min, but not a past date', async () => {
    const user = userEvent.setup();
    const today = localIsoDate();
    const later = addIsoDays(today, 2);
    render(<Holidays />);
    await user.click(await screen.findByRole('button', { name: /book holiday/i }));
    expect(await screen.findByLabelText(/^staff$/i)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /single day/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText(/^date$/i)).toHaveAttribute('min', today);
    await user.click(screen.getByRole('radio', { name: /multi day/i }));
    expect(screen.getByLabelText(/^from$/i)).toHaveAttribute('min', today);
    await pickSelectOption(user, /^staff$/i, '4');
    await pickDate(user, /^from$/i, today);
    await pickDate(user, /^to$/i, later);
    await user.click(screen.getByRole('button', { name: /submit booking/i }));
    expect(api.post).toHaveBeenCalledWith('/holidays', {
      kind: 'multi', user_id: 4, start_date: today, end_date: later, reason: '',
    });
  });

  it('lets office book a single-day holiday', async () => {
    const user = userEvent.setup();
    const today = localIsoDate();
    render(<Holidays />);
    await user.click(await screen.findByRole('button', { name: /book holiday/i }));
    await pickSelectOption(user, /^staff$/i, '4');
    await pickDate(user, /^date$/i, today);
    await user.click(screen.getByRole('button', { name: /submit booking/i }));
    expect(api.post).toHaveBeenCalledWith('/holidays', {
      kind: 'single', user_id: 4, start_date: today, end_date: today, reason: '',
    });
    expect(await screen.findByText(/holiday booked and approved/i)).toBeInTheDocument();
  });

  it('shows an error when office submits without picking staff', async () => {
    const user = userEvent.setup();
    render(<Holidays />);
    await user.click(await screen.findByRole('button', { name: /book holiday/i }));
    await pickDate(user, /^date$/i, localIsoDate());
    await user.click(screen.getByRole('button', { name: /submit booking/i }));
    expect(api.post).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(/pick a staff member/i);
  });
});

describe('Office Holidays tabs and status chips', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation(async (path) => {
      if (path.startsWith('/holidays/calendar')) return { holidays: [] };
      if (path.startsWith('/holidays')) return { holidays: [pending], notice_days: 28 };
      return { users: [] };
    });
  });

  it('puts All first and loads pending by default', async () => {
    const user = userEvent.setup();
    render(<Holidays />);
    expect(await screen.findByRole('button', { name: /^calendar$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^calendar$/i }).className).toMatch(/bg-navy-900/);
    expect(screen.getByRole('heading', { name: /approved off/i })).toBeInTheDocument();
    await openRequests(user);
    expect(await screen.findByText('Connor Blake')).toBeInTheDocument();
    expect(screen.getByText(/multi day · 2026-10-23 – 2026-10-24 · 2 days/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/holidays?status=pending');
    });
    const tabs = screen.getAllByRole('button').filter((btn) => /^(all|pending|approved|declined)$/i.test(btn.textContent || ''));
    expect(tabs.map((btn) => btn.textContent)).toEqual(['All', 'Pending', 'Approved', 'Declined']);
    expect(screen.getByRole('button', { name: /^pending$/i }).className).toMatch(/bg-navy-900/);
    expect(document.querySelector('.badge')?.textContent).toBe('Pending');
    await user.click(screen.getByRole('button', { name: /^all$/i }));
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/holidays?status=');
    });
  });

  it('shows the staff photo when they have one, otherwise initials', async () => {
    const user = userEvent.setup();
    render(<Holidays />);
    await openRequests(user);
    expect(await screen.findByText('Connor Blake')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /connor blake/i })).toBeNull();
    expect(screen.getByTitle('Connor Blake')).toHaveTextContent('CB');

    api.get.mockImplementation(async (path) => {
      if (path.startsWith('/holidays/calendar')) return { holidays: [] };
      if (path.startsWith('/holidays')) {
        return { holidays: [{ ...pending, avatar_file: 'avatar-4.png' }], notice_days: 28 };
      }
      return { users: [] };
    });
    await user.click(screen.getByRole('button', { name: /^all$/i }));
    const photo = await screen.findByRole('img', { name: /connor blake/i });
    expect(photo.getAttribute('src')).toContain('user=4');
    expect(photo.getAttribute('src')).toContain('avatar-4.png');
  });
});

describe('Office Holidays decide (requirement 10.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation(async (path) => {
      if (path.startsWith('/holidays')) return { holidays: [pending], notice_days: 28 };
      return { users: [] };
    });
    api.put.mockResolvedValue({ ok: true, status: 'approved' });
  });

  it('approves pending with no reason', async () => {
    const user = userEvent.setup();
    render(<Holidays />);
    await openRequests(user);
    await user.click(await screen.findByRole('button', { name: /^approve$/i }));
    expect(api.put).toHaveBeenCalledWith('/holidays/11/decision', { decision: 'approved' });
  });

  it('opens a decline modal and requires a reason', async () => {
    const user = userEvent.setup();
    render(<Holidays />);
    await openRequests(user);
    await user.click(await screen.findByRole('button', { name: /^decline$/i }));
    expect(await screen.findByLabelText(/reason \(required\)/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /decline request/i }));
    expect(api.put).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText(/reason \(required\)/i), 'Crew booked');
    await user.click(screen.getByRole('button', { name: /decline request/i }));
    expect(api.put).toHaveBeenCalledWith('/holidays/11/decision', {
      decision: 'declined', decline_reason: 'Crew booked',
    });
  });

  it('lets office reverse an approved request by declining', async () => {
    api.get.mockImplementation(async (path) => {
      if (path.startsWith('/holidays')) {
        return { holidays: [{ ...pending, status: 'approved' }], notice_days: 28 };
      }
      return { users: [] };
    });
    render(<Holidays />);
    await openRequests(userEvent.setup());
    expect(await screen.findByRole('button', { name: /^decline$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^approve$/i })).toBeNull();
  });

  it('lets office reverse a declined request by approving', async () => {
    api.get.mockImplementation(async (path) => {
      if (path.startsWith('/holidays')) {
        return {
          holidays: [{ ...pending, status: 'declined', decline_reason: 'Too soon' }],
          notice_days: 28,
        };
      }
      return { users: [] };
    });
    render(<Holidays />);
    await openRequests(userEvent.setup());
    expect(await screen.findByRole('button', { name: /^approve$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^decline$/i })).toBeNull();
    expect(screen.getByText(/declined: too soon/i)).toBeInTheDocument();
  });
});

describe('Office Holidays allowance grid (requirement 10.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation(async (path) => {
      if (path.startsWith('/holidays/calendar')) {
        return {
          holidays: [{
            id: 7, user_id: 4, user_name: 'Connor Blake', color: '#7c3aed',
            email: 'connor@pauldouglasroofing.co.uk', phone: '07700 900123',
            start_date: '2026-09-26', end_date: '2026-09-26',
          }],
        };
      }
      if (path.startsWith('/holidays')) {
        return {
          holidays: [{
            ...pending, remaining: 26, allowance: 28, used: 2, year: 2026,
          }],
          notice_days: 28, year: 2026,
        };
      }
      return { users: [] };
    });
  });

  it('shows remaining days and who is approved off on the month grid', async () => {
    const user = userEvent.setup();
    render(<Holidays />);
    expect(await screen.findByRole('heading', { name: /approved off/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /previous month/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^today$/i })).toBeInTheDocument();
    expect(screen.getAllByText('Connor Blake').length).toBeGreaterThan(0);
    await openRequests(user);
    expect(await screen.findByText(/26 of 28 days left in 2026/i)).toBeInTheDocument();
  });

  it('shows email and phone when hovering a staff chip', async () => {
    const user = userEvent.setup();
    render(<Holidays />);
    const chips = await screen.findAllByLabelText(/connor blake, connor@pauldouglasroofing.co.uk, 07700 900123/i);
    expect(chips.length).toBeGreaterThan(0);
    await user.hover(chips[0]);
    const tip = await screen.findByRole('tooltip');
    expect(tip).toHaveTextContent('Connor Blake');
    expect(tip).toHaveTextContent('connor@pauldouglasroofing.co.uk');
    expect(tip).toHaveTextContent('07700 900123');
    await user.click(screen.getByRole('button', { name: /^requests$/i }));
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(screen.queryByLabelText(/connor@pauldouglasroofing.co.uk/i)).toBeNull();
  });
});
