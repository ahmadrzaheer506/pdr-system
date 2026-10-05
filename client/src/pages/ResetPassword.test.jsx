import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ResetPassword from './ResetPassword.jsx';
import { api } from '../lib/api';

vi.mock('../lib/api', () => ({
  api: { post: vi.fn() },
}));

function renderReset(search = '?token=abc123') {
  return render(
    <MemoryRouter initialEntries={[`/reset-password${search}`]}>
      <ResetPassword />
    </MemoryRouter>
  );
}

describe('ResetPassword (requirement 1.7)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a password shorter than 8 characters without calling the API', async () => {
    const user = userEvent.setup();
    renderReset();
    await user.type(screen.getByLabelText(/^new password$/i), 'short');
    await user.click(screen.getByRole('button', { name: /update password/i }));
    expect((await screen.findAllByText(/at least 8 characters/i)).length).toBeGreaterThan(0);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('posts token and password', async () => {
    api.post.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    renderReset();
    await user.type(screen.getByLabelText(/^new password$/i), 'newpass99');
    await user.click(screen.getByRole('button', { name: /update password/i }));
    expect(api.post).toHaveBeenCalledWith('/auth/reset-password', { token: 'abc123', password: 'newpass99' });
    expect(await screen.findByRole('status')).toHaveTextContent(/password has been updated/i);
  });
});
