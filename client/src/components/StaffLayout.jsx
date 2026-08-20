import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Briefcase, Clock, PlaneTakeoff, MessageSquare, LogOut } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { Avatar } from './ui.jsx';

const NAV = [
  { to: '/staff', label: 'Jobs', icon: Briefcase, end: true },
  { to: '/staff/hours', label: 'Hours', icon: Clock },
  { to: '/staff/holidays', label: 'Holidays', icon: PlaneTakeoff },
  { to: '/staff/chat', label: 'Team Chat', icon: MessageSquare },
];

export default function StaffLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const doLogout = async () => { await logout(); navigate('/login'); };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-navy-900 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-2.5">
          <Avatar name={user?.name} color={user?.color} size={8} />
          <div>
            <div className="text-sm font-semibold leading-tight">{user?.name}</div>
            <div className="text-xs text-slate-400">Paul Douglas Roofing</div>
          </div>
        </div>
        <button onClick={doLogout} className="text-slate-300 hover:text-white p-2"><LogOut size={18} /></button>
      </header>

      <main className="flex-1 p-4 pb-24 max-w-lg mx-auto w-full">{children}</main>

      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 flex z-30 pb-[env(safe-area-inset-bottom)]">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium ${isActive ? 'text-brand-600' : 'text-slate-400'}`
            }
          >
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
