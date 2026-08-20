import React, { useEffect, useState } from 'react';
import { Clock, MapPin, AlertTriangle } from 'lucide-react';
import { api, fmtDate } from '../../lib/api';
import { PageLoading, EmptyState, StatusBadge } from '../../components/ui.jsx';
import ClockWidget from '../../components/ClockWidget.jsx';

function hrs(mins) {
  if (!mins) return '—';
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export default function StaffHours() {
  const [data, setData] = useState(null);
  const load = () => api.get('/staff/timesheets/mine').then(setData);
  useEffect(() => { load(); }, []);

  if (!data) return <PageLoading />;

  // group by week so a lad can see "last week I did 38 hours"
  const weeks = {};
  for (const t of data.timesheets) {
    const d = new Date(t.work_date);
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
    const key = d.toISOString().slice(0, 10);
    (weeks[key] ||= []).push(t);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">My Hours</h1>
        <p className="text-slate-500 text-sm mt-0.5">Last 4 weeks · {data.total_hours}h total</p>
      </div>

      <ClockWidget onChange={load} compact />

      {data.timesheets.length === 0 ? (
        <EmptyState icon={Clock} title="No hours logged yet" detail="Clock in from a job to start recording your time." />
      ) : (
        Object.entries(weeks).sort((a, b) => b[0].localeCompare(a[0])).map(([weekStart, shifts]) => {
          const total = shifts.reduce((s, t) => s + (Number(t.worked_minutes) || 0), 0);
          return (
            <div key={weekStart}>
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-xs font-semibold text-slate-400 uppercase">
                  Week of {fmtDate(weekStart, { day: 'numeric', month: 'short' })}
                </span>
                <span className="text-xs font-bold text-slate-700">{hrs(total)}</span>
              </div>
              <div className="space-y-2">
                {shifts.map((t) => (
                  <div key={t.id} className="card p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-sm text-slate-800 truncate">{t.job_title || 'General'}</div>
                        <div className="text-xs text-slate-400">{t.customer_name || ''}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-bold text-slate-900">{hrs(t.worked_minutes)}</div>
                        <div className="text-[11px] text-slate-400">{fmtDate(t.work_date, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className="text-[11px] text-slate-400">
                        {String(t.clock_in).slice(11, 16)} – {t.clock_out ? String(t.clock_out).slice(11, 16) : 'running'}
                      </span>
                      {Number(t.break_minutes) > 0 && (
                        <span className="text-[11px] text-slate-400">· {Math.round(t.break_minutes)}m break</span>
                      )}
                      <StatusBadge status={t.status} />
                      {t.location_flag === 'far_from_site' && (
                        <span className="badge bg-amber-100 text-amber-700 gap-1"><MapPin size={9} /> off site</span>
                      )}
                    </div>
                    {t.notes && <p className="text-xs text-slate-500 mt-1.5 border-t border-slate-100 pt-1.5">{t.notes}</p>}
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
