import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Inbox, Kanban, Calendar, FileText, Receipt, CheckSquare,
  MessageSquare, Settings, LogOut, Menu, X, Users, PlaneTakeoff, Home, Clock,
} from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { Avatar } from './ui.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/inbox', label: 'Lead Inbox', icon: Inbox },
  { to: '/pipeline', label: 'Pipeline', icon: Kanban },
  { to: '/schedule', label: 'Schedule & AI', icon: Calendar },
  { to: '/quotes', label: 'Quotes', icon: FileText },
  { to: '/invoices', label: 'Invoices', icon: Receipt },
  { to: '/timesheets', label: 'Timesheets', icon: Clock },
  { to: '/holidays', label: 'Holidays', icon: PlaneTakeoff },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare },
  { to: '/chat', label: 'Team Chat', icon: MessageSquare },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const doLogout = async () => { await logout(); navigate('/login'); };

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 h-14 bg-navy-900 text-white flex items-center justify-between px-4 z-40">
        <button onClick={() => setOpen(true)}><Menu size={22} /></button>
        <span className="font-semibold text-sm">Paul Douglas Roofing</span>
        <Avatar name={user?.name} color={user?.color} size={7} />
      </div>

      {/* sidebar */}
      <aside className={`fixed md:static inset-y-0 left-0 z-50 w-64 bg-navy-900 text-slate-200 flex flex-col transition-transform ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="flex items-center justify-between px-5 py-5 border-b border-white/10">
          <div>
            <div className="font-bold text-white leading-tight">Paul Douglas</div>
            <div className="text-xs text-slate-400">Roofing & Building Ltd</div>
          </div>
          <button className="md:hidden text-slate-400" onClick={() => setOpen(false)}><X size={20} /></button>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-brand-500 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-2.5 px-2 py-2">
            <Avatar name={user?.name} color={user?.color} size={8} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-white truncate">{user?.name}</div>
              <div className="text-xs text-slate-400">{user?.role === 'ADMIN' ? 'Owner / Admin' : 'Office'}</div>
            </div>
            <button onClick={doLogout} title="Sign out" className="text-slate-400 hover:text-white p-1.5">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      {open && <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setOpen(false)} />}

      <main className="flex-1 min-w-0 pt-14 md:pt-0">
        <div className="max-w-[1400px] mx-auto p-4 md:p-8">{children}</div>
      </main>
    </div>
  );
}
