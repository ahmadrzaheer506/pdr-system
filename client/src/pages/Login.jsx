import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('paul@pauldouglasroofing.co.uk');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (user) navigate(user.role === 'STAFF' ? '/staff' : '/', { replace: true });
  }, [user]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const u = await login(email, password);
      navigate(u.role === 'STAFF' ? '/staff' : '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-900 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-brand-500 text-white font-bold text-xl mb-4">PD</div>
          <h1 className="text-white text-xl font-bold">Paul Douglas Roofing</h1>
          <p className="text-slate-400 text-sm mt-1">Business Operating System</p>
        </div>
        <form onSubmit={submit} className="card p-6 space-y-4">
          {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label">Password</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button className="btn-primary w-full" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
          <div className="text-xs text-slate-400 text-center pt-2 leading-relaxed">
            Demo logins — Owner: paul@pauldouglasroofing.co.uk<br />
            Office: lisa@pauldouglasroofing.co.uk · Field staff: jamie@pauldouglasroofing.co.uk<br />
            Password for all: password123
          </div>
        </form>
      </div>
    </div>
  );
}
