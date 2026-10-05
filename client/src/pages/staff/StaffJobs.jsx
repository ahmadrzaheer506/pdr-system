import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Clock, Users, ChevronRight, Briefcase } from 'lucide-react';
import { api, fmtDate } from '../../lib/api';
import { PageLoading, PriorityBadge, EmptyState } from '../../components/ui.jsx';
import { localIsoDate, addIsoDays, datesInRange, parseIsoDate } from '../../lib/schedule';

export default function StaffJobs() {
  const [jobs, setJobs] = useState(null);

  useEffect(() => {
    const from = localIsoDate();
    const to = addIsoDays(from, 13);
    api.get(`/staff/jobs?from=${from}&to=${to}`).then((d) => setJobs(d.jobs)).catch(() => setJobs([]));
  }, []);

  if (!jobs) return <PageLoading />;

  const today = localIsoDate();
  const tomorrow = addIsoDays(today, 1);
  const windowEnd = addIsoDays(today, 13);

  // Show each job on the days this person is actually on the crew.
  const groups = {};
  for (const j of jobs) {
    const assignedDays = (j.work_dates || []).map(parseIsoDate).filter(Boolean);
    const days = (assignedDays.length
      ? assignedDays
      : datesInRange(j.start_date, j.end_date || j.start_date)
    ).filter((date) => date >= today && date <= windowEnd);
    for (const date of days) {
      (groups[date] ||= []).push(j);
    }
  }
  const sortedDates = Object.keys(groups).sort();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">My Jobs</h1>
        <p className="text-slate-500 text-sm mt-0.5">Next 2 weeks</p>
      </div>

      {Object.keys(groups).length === 0 ? (
        <EmptyState icon={Briefcase} title="No jobs scheduled" detail="Nothing assigned to you in the next two weeks yet." />
      ) : (
        sortedDates.map((date) => {
          const dayJobs = groups[date];
          return (
          <div key={date}>
            <div className="text-xs font-semibold text-slate-400 uppercase mb-2 px-1">
              {date === today ? 'Today' : date === tomorrow ? 'Tomorrow' : fmtDate(date, { weekday: 'long', day: 'numeric', month: 'short' })}
            </div>
            <div className="space-y-2">
              {dayJobs.map((j) => (
                <Link to={`/staff/jobs/${j.id}`} key={`${date}-${j.id}`} className="card p-4 flex items-center gap-3 active:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 truncate">{j.title}</span>
                      {j.priority !== 'normal' && <PriorityBadge priority={j.priority} />}
                    </div>
                    <div className="text-sm text-slate-500 mt-1 flex items-center gap-1.5"><MapPin size={13} /> {j.address}</div>
                    <div className="text-sm text-slate-500 mt-0.5 flex items-center gap-1.5"><Clock size={13} /> {j.start_time}–{j.end_time}</div>
                    {j.crew.length > 1 && <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5"><Users size={12} /> With {j.crew.filter((c) => c).join(', ')}</div>}
                  </div>
                  <ChevronRight size={18} className="text-slate-300 flex-shrink-0" />
                </Link>
              ))}
            </div>
          </div>
          );
        })
      )}
    </div>
  );
}
