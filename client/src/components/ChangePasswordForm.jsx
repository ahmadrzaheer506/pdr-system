import React, { useState } from 'react';
import { api } from '../lib/api';
import { useToast, Toast } from './ui.jsx';
import { useAuth } from '../lib/auth.jsx';

const MIN_PASSWORD_LENGTH = 8;

/**
 * Self-service password change for a signed-in user (requirement 1.2 set/change).
 * A successful change invalidates this session (requirement 1.9).
 */
export default function ChangePasswordForm({ bare = false }) {
  const { logout } = useAuth();
  const { toast, show } = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (next.length < MIN_PASSWORD_LENGTH) {
      show(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`, 'error');
      return;
    }
    if (next !== confirm) {
      show('New passwords do not match', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.put('/auth/password', { current, next });
      setCurrent('');
      setNext('');
      setConfirm('');
      show('Password updated — sign in again');
      try { await logout(); } catch { /* session already gone */ }
    } catch (err) {
      show(err.message || 'Could not update password', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className={bare ? 'space-y-4' : 'card p-5 max-w-md space-y-3'}>
      <div>
        <h3 className="font-semibold text-slate-800">Change password</h3>
        <p className="text-xs text-slate-400 mt-0.5">Must be at least {MIN_PASSWORD_LENGTH} characters. You will be signed out after a successful change.</p>
      </div>
      <div>
        <label className="label" htmlFor="current-password">Current password</label>
        <input id="current-password" className="input max-w-lg" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </div>
      <div>
        <label className="label" htmlFor="new-password">New password</label>
        <input
          id="new-password"
          className="input max-w-lg"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
          minLength={MIN_PASSWORD_LENGTH}
        />
      </div>
      <div>
        <label className="label" htmlFor="confirm-password">Confirm new password</label>
        <input
          id="confirm-password"
          className="input max-w-lg"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={MIN_PASSWORD_LENGTH}
        />
      </div>
      <button className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Update password'}</button>
      <Toast {...toast} />
    </form>
  );
}
