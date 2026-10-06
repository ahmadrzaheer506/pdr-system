import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { api } from '../lib/api';
import { useToast, Toast } from './ui.jsx';
import { useAuth } from '../lib/auth.jsx';

const MIN_PASSWORD_LENGTH = 8;

function PasswordInput({ id, autoComplete, value, onChange, required, minLength, showLabel, hideLabel }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative max-w-lg">
      <input
        id={id}
        className="input w-full pr-11"
        type={show ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={value}
        onChange={onChange}
        required={required}
        minLength={minLength}
      />
      <button
        type="button"
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-600"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? hideLabel : showLabel}
      >
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

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
        <PasswordInput
          id="current-password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
          showLabel="Show current password"
          hideLabel="Hide current password"
        />
      </div>
      <div>
        <label className="label" htmlFor="new-password">New password</label>
        <PasswordInput
          id="new-password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
          minLength={MIN_PASSWORD_LENGTH}
          showLabel="Show new password"
          hideLabel="Hide new password"
        />
      </div>
      <div>
        <label className="label" htmlFor="confirm-password">Confirm new password</label>
        <PasswordInput
          id="confirm-password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          minLength={MIN_PASSWORD_LENGTH}
          showLabel="Show confirm password"
          hideLabel="Hide confirm password"
        />
      </div>
      <button className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Update password'}</button>
      <Toast {...toast} />
    </form>
  );
}
