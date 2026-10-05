import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api';
import { Toast, useToast } from '../components/ui.jsx';
import AuthCard, { AuthBackLink } from '../components/AuthCard.jsx';

const fieldClass =
  'login-field w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-[border-color,box-shadow,background-color] focus:border-[#dc1114] focus:bg-white focus:ring-4 focus:ring-[#dc1114]/15';

export default function ForgotPassword() {
  const { toast, show } = useToast();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
      show('If that email is on an account, we have sent a reset link.');
    } catch (err) {
      const message = err.message || 'Could not send a reset link';
      setError(message);
      show(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title="Forgot password"
      subtitle={sent ? null : 'Enter your work email and we will send a reset link if it matches an account.'}
    >
      {sent ? (
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 size={24} />
          </div>
          <p className="mt-4 text-sm leading-relaxed text-slate-600" role="status">
            If that email is on an account, we have sent a reset link. Check your inbox.
          </p>
          <AuthBackLink className="mt-6" />
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && (
            <div className="rounded-xl bg-rose-50 px-3.5 py-3 text-sm text-rose-700" role="alert">
              {error}
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="forgot-email">Email</label>
            <input
              id="forgot-email"
              className={fieldClass}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              placeholder="you@pauldouglasroofing.co.uk"
            />
          </div>
          <button
            type="submit"
            className="h-11 w-full rounded-xl bg-[#dc1114] text-[15px] font-medium text-white shadow-sm shadow-[#dc1114]/25 transition-colors hover:bg-[#b50e11] disabled:opacity-50"
            disabled={loading}
          >
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
          <AuthBackLink />
        </form>
      )}
      <Toast {...toast} />
    </AuthCard>
  );
}
