import React from 'react';
import { NavLink } from 'react-router-dom';
import { Briefcase, Clock, PlaneTakeoff, MessageSquare, CheckSquare, CalendarDays } from 'lucide-react';
import AppHeader from './AppHeader.jsx';

const NAV = [
  { to: '/staff', label: 'Jobs', icon: Briefcase, end: true },
  { to: '/staff/visits', label: 'Visits', icon: CalendarDays },
  { to: '/staff/tasks', label: 'Tasks', icon: CheckSquare },
  { to: '/staff/hours', label: 'Hours', icon: Clock },
  { to: '/staff/holidays', label: 'Holidays', icon: PlaneTakeoff },
  { to: '/staff/chat', label: 'Team Chat', icon: MessageSquare },
];

export default function StaffLayout({ children }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <AppHeader
        profileHref="/staff/profile"
        className="border-slate-200"
        showLogo
      />

      <main className="flex-1 p-4 pb-24 max-w-lg mx-auto w-full">{children}</main>

      <nav className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-lg border-t border-slate-200/80 flex z-30 pb-[env(safe-area-inset-bottom)] shadow-lg shadow-slate-900/5">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `group flex-1 flex flex-col items-center gap-1 py-3 text-[11px] font-semibold transition-all ${
                isActive ? 'text-brand-600' : 'text-slate-500'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div className={`transition-all ${isActive ? 'scale-110' : 'group-active:scale-95'}`}>
                  <Icon size={21} strokeWidth={isActive ? 2.5 : 2} />
                </div>
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
