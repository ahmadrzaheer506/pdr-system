import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ForgotPassword from './ForgotPassword.jsx';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: { post: vi.fn() },
}));

function renderForgot() {
  return render(
    <MemoryRouter>
      <ForgotPassword />
    </MemoryRouter>
  );
}

describe('ForgotPassword (requirement 1.7)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('posts the email and shows the generic confirmation', async () => {
    api.post.mockResolvedValue({ ok: true, message: 'If that email is on an account, we have sent a reset link.' });
    const user = userEvent.setup();
    renderForgot();
    await user.type(screen.getByLabelText(/^email$/i), 'lisa@pauldouglasroofing.co.uk');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(api.post).toHaveBeenCalledWith('/auth/forgot-password', { email: 'lisa@pauldouglasroofing.co.uk' });
    expect(await screen.findByRole('status')).toHaveTextContent(/if that email is on an account/i);
  });

  it('shows that an inactive account cannot reset the password', async () => {
    const err = new Error('This account is inactive. Ask an administrator to reactivate it before you can reset the password.');
    err.status = 403;
    api.post.mockRejectedValue(err);
    const user = userEvent.setup();
    renderForgot();
    await user.type(screen.getByLabelText(/^email$/i), 'paul@pauldouglasroofing.co.uk');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/account is inactive/i);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('links back to sign in', () => {
    renderForgot();
    expect(screen.getByRole('link', { name: /back to sign in/i })).toHaveAttribute('href', '/login');
  });
});
