import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { ROLES } from '../lib/roles';
import { Toast, useToast } from '../components/ui.jsx';
import BrandLogo from '../components/BrandLogo.jsx';

const MIN_PASSWORD_LENGTH = 8;

const DEMO_ACCOUNTS = [
  { label: 'Owner', email: 'paul@pauldouglasroofing.co.uk' },
  { label: 'Office', email: 'lisa@pauldouglasroofing.co.uk' },
  { label: 'Field', email: 'jamie@pauldouglasroofing.co.uk' },
];

const DEMO_PASSWORD = 'password123';

const fieldClass =
  'login-field w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-[border-color,box-shadow,background-color] focus:border-[#dc1114] focus:bg-white focus:ring-4 focus:ring-[#dc1114]/15';

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const { toast, show } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (user) navigate(user.role === ROLES.STAFF ? '/staff' : '/', { replace: true });
  }, [user]);

  const fillDemo = (demoEmail) => {
    setEmail(demoEmail);
    setPassword(DEMO_PASSWORD);
    setError('');
  };

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
      const u = await login(email, password);
      navigate(u.role === ROLES.STAFF ? '/staff' : '/', { replace: true });
    } catch (err) {
      const message = err.message || 'Sign in failed';
      setError(message);
      show(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden bg-navy-900 px-14 py-12 lg:flex lg:flex-col">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -left-24 -top-24 h-[28rem] w-[28rem] rounded-full bg-brand-500/20 blur-3xl" />
          <div className="absolute -bottom-20 -right-16 h-80 w-80 rounded-full bg-white/5 blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage: 'radial-gradient(rgba(255,255,255,0.85) 1px, transparent 1px)',
              backgroundSize: '22px 22px',
            }}
          />
        </div>
        <div className="relative z-10 flex flex-1 flex-col justify-center">
          <BrandLogo decorative className="mb-10 h-14 w-auto max-w-[168px]" />
          <p className="max-w-md text-[2rem] font-semibold leading-tight tracking-tight text-white">
            One system for the whole roofing job.
          </p>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-400">
            Leads, quotes, crews and invoices — from first enquiry through to paid, in a single place.
          </p>
        </div>
        <p className="relative z-10 text-xs text-slate-500">Paul Douglas Roofing &amp; Building Ltd</p>
      </aside>

      <main className="flex min-h-screen flex-col bg-slate-100 lg:min-h-full">
        <div className="flex justify-center border-b border-white/10 bg-navy-900 px-6 py-4 lg:hidden">
          <BrandLogo className="h-12 w-auto max-w-[148px]" />
        </div>

        <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
          <div className="w-full max-w-[420px] rounded-2xl border border-slate-200/80 bg-white p-7 shadow-[0_18px_50px_-20px_rgba(15,23,42,0.28)] sm:p-9">
            <div className="mb-7">
              <p className="text-sm font-medium text-[#dc1114]">Welcome back</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                Sign in to your account
              </h1>
              <p className="mt-2 text-sm text-slate-500">Use your work email to continue.</p>
            </div>

            <form onSubmit={submit} className="space-y-4">
              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700" role="alert">
                  {error}
                </div>
              )}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="login-email">Email</label>
                <input
                  id="login-email"
                  className={fieldClass}
                  type="email"
                  autoComplete="username"
                  inputMode="email"
                  placeholder="you@pauldouglasroofing.co.uk"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="login-password">Password</label>
                <div className="relative">
                  <input
                    id="login-password"
                    className={`${fieldClass} pr-11`}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={MIN_PASSWORD_LENGTH}
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
              <div className="pt-1 text-right">
                <Link to="/forgot-password" className="text-sm font-medium text-[#dc1114] hover:underline">Forgot password?</Link>
              </div>
              <button
                type="submit"
                className="mt-1 h-11 w-full rounded-xl bg-[#dc1114] text-[15px] font-medium text-white shadow-sm shadow-[#dc1114]/25 transition-colors hover:bg-[#b50e11] disabled:opacity-50"
                disabled={loading}
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <div className="mt-7 border-t border-slate-100 pt-5">
              <p className="mb-2.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                <Lock size={11} /> Demo accounts
              </p>
              <div className="flex flex-wrap gap-2">
                {DEMO_ACCOUNTS.map((account) => (
                  <button
                    key={account.email}
                    type="button"
                    onClick={() => fillDemo(account.email)}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 hover:border-slate-300 hover:bg-white"
                  >
                    {account.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-slate-400">Password for all: {DEMO_PASSWORD}</p>
            </div>
          </div>
        </div>
      </main>
      <Toast {...toast} />
    </div>
  );
}
