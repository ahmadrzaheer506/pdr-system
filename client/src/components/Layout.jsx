import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Inbox, Kanban, Users, Calendar, FileText, Receipt, CheckSquare,
  MessageSquare, Settings, Menu, X, PlaneTakeoff, Clock, BarChart3,
} from 'lucide-react';
import BrandLogo from './BrandLogo.jsx';
import AppHeader from './AppHeader.jsx';

const NAV_SECTIONS = [
  {
    header: 'OVERVIEW',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
      { to: '/inbox', label: 'Lead Inbox', icon: Inbox },
    ],
  },
  {
    header: 'MANAGEMENT',
    items: [
      { to: '/pipeline', label: 'Pipeline', icon: Kanban },
      { to: '/customers', label: 'Customers', icon: Users },
      { to: '/schedule', label: 'Schedule & AI', icon: Calendar },
      { to: '/quotes', label: 'Quotes', icon: FileText },
      { to: '/invoices', label: 'Invoices', icon: Receipt },
      { to: '/timesheets', label: 'Timesheets', icon: Clock },
      { to: '/holidays', label: 'Holidays', icon: PlaneTakeoff },
      { to: '/tasks', label: 'Tasks', icon: CheckSquare },
      { to: '/reports', label: 'Reports', icon: BarChart3 },
      { to: '/chat', label: 'Team Chat', icon: MessageSquare },
    ],
  },
  {
    header: 'SETTINGS',
    items: [
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export default function Layout({ children }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <aside className={`fixed md:relative inset-y-0 left-0 z-50 flex h-screen w-64 shrink-0 flex-col border-r border-slate-200/80 bg-white shadow-sm transition-transform ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="relative flex shrink-0 items-center justify-center px-5 py-5 border-b border-slate-100">
          <BrandLogo className="h-auto w-[75px]" />
          <button className="md:hidden absolute right-4 inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors" onClick={() => setOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto py-4 px-3 space-y-6">
          {NAV_SECTIONS.map((section) => (
            <div key={section.header}>
              <h3 className="mb-2 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                {section.header}
              </h3>
              <div className="space-y-0.5">
                {section.items.map(({ to, label, icon: Icon, end }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      `group flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all ${
                        isActive
                          ? 'bg-brand-500 text-white shadow-sm shadow-brand-500/20'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon size={18} className={`shrink-0 transition-transform group-hover:scale-110 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                        {label}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>
      {open && <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-40 md:hidden animate-in fade-in duration-200" onClick={() => setOpen(false)} />}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <AppHeader showMenuButton onMenuClick={() => setOpen(true)} profileHref="/profile" />
        <main className="min-h-0 flex-1 overflow-y-auto bg-slate-50">
          <div className="mx-auto max-w-[1400px] px-4 pt-4 pb-8 md:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
