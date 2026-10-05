import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChangePasswordForm from './ChangePasswordForm.jsx';

const put = vi.fn();
const logout = vi.fn(async () => {});

vi.mock('../lib/api', () => ({
  api: {
    put: (...args) => put(...args),
  },
}));

vi.mock('../lib/auth.jsx', () => ({
  useAuth: () => ({ logout }),
}));

describe('ChangePasswordForm (requirement 1.2 set/change)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a new password shorter than 8 characters without calling the API', async () => {
    const user = userEvent.setup();
    render(<ChangePasswordForm />);
    await user.type(screen.getByLabelText(/current password/i), 'password123');
    await user.type(screen.getByLabelText(/^new password$/i), 'short');
    await user.type(screen.getByLabelText(/confirm new password/i), 'short');
    await user.click(screen.getByRole('button', { name: /update password/i }));
    expect(await screen.findByText('Password must be at least 8 characters')).toBeInTheDocument();
    expect(put).not.toHaveBeenCalled();
  });

  it('PUTs current and next password when valid, then signs out', async () => {
    put.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<ChangePasswordForm />);
    await user.type(screen.getByLabelText(/current password/i), 'password123');
    await user.type(screen.getByLabelText(/^new password$/i), 'newpass99');
    await user.type(screen.getByLabelText(/confirm new password/i), 'newpass99');
    await user.click(screen.getByRole('button', { name: /update password/i }));
    expect(put).toHaveBeenCalledWith('/auth/password', { current: 'password123', next: 'newpass99' });
    expect(await screen.findByText('Password updated — sign in again')).toBeInTheDocument();
    expect(logout).toHaveBeenCalled();
  });

  it('shows an API error toast', async () => {
    put.mockRejectedValue(new Error('Current password is wrong'));
    const user = userEvent.setup();
    render(<ChangePasswordForm />);
    await user.type(screen.getByLabelText(/current password/i), 'password123');
    await user.type(screen.getByLabelText(/^new password$/i), 'newpass99');
    await user.type(screen.getByLabelText(/confirm new password/i), 'newpass99');
    await user.click(screen.getByRole('button', { name: /update password/i }));
    expect(await screen.findByText('Current password is wrong')).toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();
  });

  it('rejects when the confirmation does not match', async () => {
    const user = userEvent.setup();
    render(<ChangePasswordForm />);
    await user.type(screen.getByLabelText(/current password/i), 'password123');
    await user.type(screen.getByLabelText(/^new password$/i), 'newpass99');
    await user.type(screen.getByLabelText(/confirm new password/i), 'newpass00');
    await user.click(screen.getByRole('button', { name: /update password/i }));
    expect(await screen.findByText('New passwords do not match')).toBeInTheDocument();
    expect(put).not.toHaveBeenCalled();
  });
});
