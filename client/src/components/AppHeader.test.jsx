import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AppHeader from './AppHeader.jsx';
import { api } from '../lib/api';

const navigate = vi.fn();
const logout = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

vi.mock('../lib/auth.jsx', () => ({
  useAuth: () => ({
    user: {
      name: 'Paul Douglas',
      email: 'paul@pauldouglasroofing.co.uk',
      role: 'ADMIN',
      color: '#ea580c',
    },
    logout,
  }),
}));

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), put: vi.fn() },
}));

describe('AppHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({
      notifications: [
        {
          id: 24,
          kind: 'quote_accepted',
          title: 'Quote accepted',
          message: 'Helen Ackroyd accepted quote Q-2026-0023.',
          created_at: new Date().toISOString(),
          read_at: null,
          href: '/customers/7',
        },
      ],
      unread: 2,
    });
    api.put.mockResolvedValue({ ok: true });
  });

  it('opens the profile popover with user details and profile link', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><AppHeader profileHref="/profile" /></MemoryRouter>);
    expect(screen.queryByText('Paul Douglas Roofing')).toBeNull();
    expect(screen.queryByText('Business CRM')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(screen.getByText('Paul Douglas')).toBeInTheDocument();
    expect(screen.getByText('paul@pauldouglasroofing.co.uk')).toBeInTheDocument();
    expect(screen.getByText('Owner / Admin')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /profile/i })).toHaveAttribute('href', '/profile');
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });

  it('opens the notifications drawer from the API and shows the unread badge', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><AppHeader profileHref="/profile" /></MemoryRouter>);
    expect(await screen.findByText('2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    expect(screen.getByRole('heading', { name: 'Notifications' })).toBeInTheDocument();
    expect(await screen.findByText('Quote accepted')).toBeInTheDocument();
    expect(screen.getByText('Helen Ackroyd accepted quote Q-2026-0023.')).toBeInTheDocument();
  });

  it('marks a row read and opens the linked record', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><AppHeader profileHref="/profile" /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    await user.click(await screen.findByRole('button', { name: /quote accepted/i }));
    expect(api.put).toHaveBeenCalledWith('/notifications/24/read');
    expect(navigate).toHaveBeenCalledWith('/customers/7');
  });

  it('marks all as read', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><AppHeader profileHref="/profile" /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    await user.click(screen.getByRole('button', { name: /mark all as read/i }));
    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/notifications/read-all');
    });
  });

  it('shows a staff profile link', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><AppHeader profileHref="/staff/profile" /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(screen.getByRole('link', { name: /profile/i })).toHaveAttribute('href', '/staff/profile');
    expect(screen.queryByRole('button', { name: /change password/i })).toBeNull();
  });
});
