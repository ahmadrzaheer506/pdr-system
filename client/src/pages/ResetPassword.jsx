import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { api } from '../lib/api';
import { Toast, useToast } from '../components/ui.jsx';
import AuthCard, { AuthBackLink } from '../components/AuthCard.jsx';

const MIN_PASSWORD_LENGTH = 8;

const fieldClass =
  'login-field w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-[border-color,box-shadow,background-color] focus:border-[#dc1114] focus:bg-white focus:ring-4 focus:ring-[#dc1114]/15';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const { toast, show } = useToast();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < MIN_PASSWORD_LENGTH) {
      const message = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
      setError(message);
      show(message, 'error');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
      show('Password updated. You can sign in now.');
    } catch (err) {
      const message = err.message || 'Could not reset password';
      setError(message);
      show(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title="Set a new password"
      subtitle={done || !token ? null : `Choose a password with at least ${MIN_PASSWORD_LENGTH} characters.`}
    >
      {!token ? (
        <div className="text-center">
          <p className="text-sm leading-relaxed text-red-700">
            This reset link is missing a token. Request a new one from the sign-in page.
          </p>
          <AuthBackLink className="mt-6" />
        </div>
      ) : done ? (
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 size={24} />
          </div>
          <p className="mt-4 text-sm leading-relaxed text-slate-600" role="status">Your password has been updated.</p>
          <Link
            to="/login"
            className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#dc1114] text-[15px] font-medium text-white shadow-sm shadow-[#dc1114]/25 transition-colors hover:bg-[#b50e11]"
          >
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700" role="alert">
              {error}
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="reset-password">New password</label>
            <div className="relative">
              <input
                id="reset-password"
                className={`${fieldClass} pr-11`}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
                placeholder="Enter a new password"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-600"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <button
            type="submit"
            className="h-11 w-full rounded-xl bg-[#dc1114] text-[15px] font-medium text-white shadow-sm shadow-[#dc1114]/25 transition-colors hover:bg-[#b50e11] disabled:opacity-50"
            disabled={loading}
          >
            {loading ? 'Saving…' : 'Update password'}
          </button>
          <AuthBackLink />
        </form>
      )}
      <Toast {...toast} />
    </AuthCard>
  );
}
