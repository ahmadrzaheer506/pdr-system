import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Clock, Users, ChevronRight, Briefcase } from 'lucide-react';
import { api, fmtDate } from '../../lib/api';
import { PageLoading, PriorityBadge, StatusBadge, EmptyState } from '../../components/ui.jsx';

function isoDate(d) { return d.toISOString().slice(0, 10); }

export default function StaffJobs() {
  const [jobs, setJobs] = useState(null);

  useEffect(() => {
    const from = isoDate(new Date());
    const to = isoDate(new Date(Date.now() + 13 * 86400000));
    api.get(`/staff/jobs?from=${from}&to=${to}`).then((d) => setJobs(d.jobs));
  }, []);

  if (!jobs) return <PageLoading />;

  const today = isoDate(new Date());
  const windowEnd = isoDate(new Date(Date.now() + 13 * 86400000));
  const tomorrow = isoDate(new Date(Date.now() + 86400000));

  // A multi-day job appears on every day it runs (clipped to the visible window),
  // so a job that started yesterday still shows under "Today".
  const groups = {};
  for (const j of jobs) {
    const start = j.start_date < today ? today : j.start_date;
    const end = (j.end_date || j.start_date) > windowEnd ? windowEnd : (j.end_date || j.start_date);
    for (let d = new Date(start); isoDate(d) <= end; d.setDate(d.getDate() + 1)) {
      (groups[isoDate(d)] ||= []).push(j);
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
