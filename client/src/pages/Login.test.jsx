import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Login from './Login.jsx';

const login = vi.fn();

vi.mock('../lib/auth.jsx', () => ({
  useAuth: () => ({ login, user: null }),
}));

function renderLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  );
}

describe('Login (requirement 1.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has a forgot-password link and no public registration link', () => {
    renderLogin();
    expect(screen.getByRole('img', { name: /paul douglas roofing/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /forgot password/i })).toHaveAttribute('href', '/forgot-password');
    expect(screen.queryByRole('link', { name: /sign up|register|create account/i })).toBeNull();
    expect(screen.queryByText(/create an account/i)).toBeNull();
  });

  it('shows an error toast when the password is shorter than 8 characters', async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByLabelText(/^email$/i), 'paul@pauldouglasroofing.co.uk');
    await user.type(screen.getByLabelText(/^password$/i), 'short');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect((await screen.findAllByText(/at least 8 characters/i)).length).toBeGreaterThan(0);
    expect(login).not.toHaveBeenCalled();
  });

  it('calls login with email and password', async () => {
    login.mockResolvedValue({ role: 'ADMIN' });
    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByLabelText(/^email$/i), 'lisa@pauldouglasroofing.co.uk');
    await user.type(screen.getByLabelText(/^password$/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(login).toHaveBeenCalledWith('lisa@pauldouglasroofing.co.uk', 'password123');
  });

  it('surfaces a failed login from the API', async () => {
    login.mockRejectedValue(new Error('Wrong email or password'));
    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByLabelText(/^email$/i), 'paul@pauldouglasroofing.co.uk');
    await user.type(screen.getByLabelText(/^password$/i), 'password123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect((await screen.findAllByText('Wrong email or password')).length).toBeGreaterThan(0);
  });
});
