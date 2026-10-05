import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Profile from './Profile.jsx';
import { api } from '../lib/api';

const auth = {
  user: {
    id: 1,
    name: 'Paul Douglas',
    email: 'paul@pauldouglasroofing.co.uk',
    role: 'ADMIN',
    color: '#ea580c',
  },
  refresh: vi.fn(async () => {}),
};

vi.mock('../lib/auth.jsx', () => ({
  useAuth: () => auth,
}));

vi.mock('../lib/api', () => ({
  api: { get: vi.fn(), put: vi.fn(), upload: vi.fn(), del: vi.fn() },
}));

vi.mock('../components/ChangePasswordForm.jsx', () => ({
  default: () => <div>Change password</div>,
}));

vi.mock('../components/NotificationPrefsForm.jsx', () => ({
  default: () => <div>Notification preferences</div>,
}));

describe('Profile page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.user = {
      id: 1,
      name: 'Paul Douglas',
      email: 'paul@pauldouglasroofing.co.uk',
      role: 'ADMIN',
      color: '#ea580c',
    };
    api.put.mockResolvedValue({ user: { ...auth.user, name: 'Paul D' } });
  });

  it('lets the current user change their name, with email locked', async () => {
    const user = userEvent.setup();
    render(<Profile />);
    expect(screen.getByRole('heading', { name: 'Profile' })).toBeInTheDocument();
    const email = screen.getByLabelText(/^email$/i);
    expect(email).toBeDisabled();
    expect(email).toHaveValue('paul@pauldouglasroofing.co.uk');
    const name = screen.getByLabelText(/full name/i);
    expect(name).toHaveValue('Paul Douglas');
    expect(screen.getByRole('button', { name: /save name/i })).toBeDisabled();
    await user.clear(name);
    await user.type(name, 'Paul D');
    await user.click(screen.getByRole('button', { name: /save name/i }));
    expect(api.put).toHaveBeenCalledWith('/auth/profile', { name: 'Paul D' });
    expect(auth.refresh).toHaveBeenCalled();
    expect(await screen.findByText('Profile updated')).toBeInTheDocument();
    expect(screen.getByText('Change password')).toBeInTheDocument();
    expect(screen.queryByText('Notification preferences')).toBeNull();
  });

  it('uploads a profile photo', async () => {
    api.upload.mockResolvedValue({ user: { ...auth.user, avatar_file: 'avatar-1.png' } });
    const user = userEvent.setup();
    render(<Profile />);
    const file = new File(['png'], 'me.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText(/upload profile photo/i), file);
    expect(api.upload).toHaveBeenCalled();
    const [path, fd] = api.upload.mock.calls[0];
    expect(path).toBe('/auth/avatar');
    expect(fd.get('file')).toBe(file);
    expect(auth.refresh).toHaveBeenCalled();
    expect(await screen.findByText('Photo updated')).toBeInTheDocument();
  });

  it('removes an existing profile photo', async () => {
    auth.user = { ...auth.user, avatar_file: 'avatar-1.png' };
    api.del.mockResolvedValue({ user: { ...auth.user, avatar_file: null } });
    const user = userEvent.setup();
    render(<Profile />);
    await user.click(screen.getByRole('button', { name: /remove/i }));
    expect(api.del).toHaveBeenCalledWith('/auth/avatar');
    expect(await screen.findByText('Photo removed')).toBeInTheDocument();
  });

  it('shows notification preferences for field staff', () => {
    auth.user = { ...auth.user, role: 'STAFF', name: 'Jamie Fisher' };
    render(<Profile />);
    expect(screen.getByText('Notification preferences')).toBeInTheDocument();
  });
});
