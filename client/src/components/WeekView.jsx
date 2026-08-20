import React from 'react';
import { Avatar, PriorityBadge } from './ui.jsx';

function startOfWeek(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export default function WeekView({ anchorDate, jobs, holidays, onJobClick }) {
  const monday = startOfWeek(anchorDate);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
  const iso = (d) => d.toISOString().slice(0, 10);
  const today = iso(new Date());

  const jobsFor = (d) => jobs.filter((j) => j.start_date && iso(new Date(j.start_date)) <= iso(d) && iso(new Date(j.end_date || j.start_date)) >= iso(d));
  const holidaysFor = (d) => holidays.filter((h) => iso(new Date(h.start_date)) <= iso(d) && iso(new Date(h.end_date)) >= iso(d));

  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((d) => {
        const dISO = iso(d);
        const isToday = dISO === today;
        const dayJobs = jobsFor(d);
        const dayHolidays = holidaysFor(d);
        return (
          <div key={dISO} className={`rounded-lg border ${isToday ? 'border-brand-300 bg-brand-50/40' : 'border-slate-200 bg-white'} p-2 min-h-[160px]`}>
            <div className={`text-xs font-semibold mb-1.5 ${isToday ? 'text-brand-600' : 'text-slate-500'}`}>
              {d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })}
            </div>
            <div className="space-y-1.5">
              {dayJobs.map((j) => (
                <button key={j.id} onClick={() => onJobClick(j.id)} className="block w-full text-left bg-slate-100 hover:bg-slate-200 rounded-md px-2 py-1.5 transition-colors">
                  <div className="text-xs font-medium text-slate-800 truncate">{j.title}</div>
                  <div className="text-[10px] text-slate-500 truncate">{j.customer_name}</div>
                  <div className="flex items-center gap-1 mt-1">
                    {(j.crew || []).slice(0, 4).map((c) => <Avatar key={c.id} name={c.name} color={c.color} size={4.5} />)}
                    {j.priority !== 'normal' && <span className="ml-auto"><PriorityBadge priority={j.priority} /></span>}
                  </div>
                </button>
              ))}
              {dayHolidays.map((h) => (
                <div key={h.id} className="text-[10px] bg-amber-50 text-amber-700 rounded px-2 py-1">🏖 {h.user_name.split(' ')[0]} off</div>
              ))}
              {dayJobs.length === 0 && dayHolidays.length === 0 && <div className="text-[11px] text-slate-300 text-center py-4">—</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
