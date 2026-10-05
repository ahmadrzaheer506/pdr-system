import React from 'react';
import { Avatar, PriorityBadge } from './ui.jsx';
import {
  startOfWeekMonday, localIsoDate, jobOnDate, crewForDate,
  holidaysOnDate, bookingsFromJobs, staffDayFlags, crewConflictLabel, jobConflictCaption,
} from '../lib/schedule';
import { missingRequiredSkills, crewHasDriver } from '../lib/skills';
import { CrewFitNotes } from './CrewChips.jsx';

export function JobChip({ job, dateIso, onJobClick, holidays = [], bookings = [] }) {
  const crew = crewForDate(job, dateIso);
  const crewIds = crew.map((c) => c.user_id);
  const missingSkills = missingRequiredSkills(crew, crewIds, job.required_skills);
  const hasDriver = crewHasDriver(crew, crewIds);
  const conflictNote = jobConflictCaption(crew, { holidays, bookings, iso: dateIso, excludeJobId: job.id });
  return (
    <button type="button" onClick={() => onJobClick(job.id)} className="block w-full text-left bg-slate-100 hover:bg-slate-200 rounded-md px-2 py-1.5 transition-colors">
      <div className="text-xs font-medium text-slate-800 truncate">{job.title}</div>
      <div className="text-[10px] text-slate-500 truncate">{job.customer_name}</div>
      <div className="flex items-center gap-1 mt-1 flex-wrap">
        {crew.slice(0, 4).map((c) => {
          const flags = staffDayFlags({
            holidays, bookings, userId: c.user_id, iso: dateIso, excludeJobId: job.id,
          });
          const conflict = crewConflictLabel(flags);
          return (
            <span
              key={c.user_id}
              className={`relative rounded-full ${conflict ? 'ring-2 ring-amber-400' : ''}`}
              title={conflict ? `${c.name} — ${conflict}` : c.name}
            >
              <Avatar name={c.name} color={c.color} size={4.5} />
            </span>
          );
        })}
        {job.priority !== 'normal' && <span className="ml-auto"><PriorityBadge priority={job.priority} /></span>}
      </div>
      {conflictNote && (
        <div className="text-[10px] text-amber-700 mt-1">{conflictNote}</div>
      )}
      <CrewFitNotes missingSkills={missingSkills} needsDriver={!!job.needs_driver} hasDriver={hasDriver} />
    </button>
  );
}

export default function WeekView({ anchorDate, jobs, holidays, onJobClick, onDayClick }) {
  const monday = startOfWeekMonday(anchorDate);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
  const today = localIsoDate();

  return (
    <div className="grid grid-cols-7 gap-2 items-start">
      {days.map((d) => {
        const dISO = localIsoDate(d);
        const isToday = dISO === today;
        const dayJobs = (jobs || []).filter((j) => jobOnDate(j, dISO));
        const dayHolidays = holidaysOnDate(holidays, dISO);
        const dayBookings = bookingsFromJobs(jobs, dISO);
        const heading = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
        return (
          <div
            key={dISO}
            className={`rounded-lg border ${isToday ? 'border-brand-300 bg-brand-50/40' : 'border-slate-200 bg-white'} p-2 flex flex-col`}
          >
            <button
              type="button"
              onClick={() => onDayClick?.(dISO)}
              aria-label={`Open ${heading}`}
              className={`text-xs font-semibold mb-1.5 w-full text-left rounded px-0.5 py-0.5 shrink-0 hover:bg-white/80 ${isToday ? 'text-brand-600' : 'text-slate-500'}`}
            >
              {heading}
            </button>
            <div
              role="region"
              aria-label={`Jobs on ${heading}`}
              className="space-y-1.5 overflow-y-auto max-h-[28rem] overscroll-contain pr-0.5"
            >
              {dayJobs.map((j) => (
                <JobChip
                  key={j.id}
                  job={j}
                  dateIso={dISO}
                  onJobClick={onJobClick}
                  holidays={holidays}
                  bookings={dayBookings}
                />
              ))}
              {dayHolidays.map((h) => (
                <div key={h.id} className="text-[10px] bg-amber-50 text-amber-700 rounded px-2 py-1">🏖 {(h.user_name || '').split(' ')[0]} off</div>
              ))}
              {dayJobs.length === 0 && dayHolidays.length === 0 && <div className="text-[11px] text-slate-300 text-center py-1">—</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
