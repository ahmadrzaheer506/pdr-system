import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, CalendarDays } from 'lucide-react';
import { api, fmtDateTime } from '../lib/api';
import { PageLoading, StatusBadge, EmptyState, useToast, Toast } from '../components/ui.jsx';
import SelectMenu from '../components/SelectMenu.jsx';
import DatePicker from '../components/DatePicker.jsx';
import { leadPath } from '../lib/customerRoutes.js';
import { leadDisplayName } from '../lib/leads.js';
import { VISIT_TYPES, visitTypeLabel } from '../lib/visitTypes';
import ScrollTabBar from '../components/ScrollTabBar.jsx';

const STATUS_FILTERS = [
  { value: 'ALL', label: 'All' },
  { value: 'booked', label: 'Booked' },
  { value: 'done', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const TYPE_FILTERS = [
  { value: 'ALL', label: 'All types' },
  ...VISIT_TYPES.map((t) => ({ value: t.value, label: t.label })),
];

const WIDE_LIST_MQ = '(min-width: 1024px)';

function useWideList() {
  const [wide, setWide] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
    return window.matchMedia(WIDE_LIST_MQ).matches;
  });

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia(WIDE_LIST_MQ);
    const onChange = () => setWide(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  return wide;
}

function VisitCard({ visit }) {
  const name = visit.lead_name || leadDisplayName({
    ref: visit.lead_ref,
    customer_name: visit.customer_name,
  });
  return (
    <article className="card p-3.5">
      <div className="flex items-start justify-between gap-2">
        <Link
          to={leadPath(visit.customer_id, 'visits', visit.lead_id)}
          className="min-w-0 font-medium text-slate-800 hover:text-brand-600"
        >
          {name}
        </Link>
        <StatusBadge status={visit.status} />
      </div>
      <p className="mt-1.5 text-sm font-medium text-slate-800">{fmtDateTime(visit.start)}</p>
      <p className="mt-1 text-sm text-slate-600">{visitTypeLabel(visit.visit_type)}</p>
      {visit.title ? <p className="mt-0.5 text-sm text-slate-500">{visit.title}</p> : null}
      <p className="mt-1 text-sm text-slate-500">{visit.address || '—'}</p>
      <p className="mt-0.5 text-sm text-slate-500">{visit.assignee_name || '—'}</p>
    </article>
  );
}

export default function Visits() {
  const [status, setStatus] = useState('ALL');
  const [visitType, setVisitType] = useState('ALL');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState(null);
  const [counts, setCounts] = useState({ all: 0, booked: 0, done: 0, cancelled: 0 });
  const wideList = useWideList();
  const { toast, show } = useToast();

  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams();
      params.set('status', status);
      if (visitType !== 'ALL') params.set('visit_type', visitType);
      if (q.trim()) params.set('q', q.trim());
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      api.get(`/appointments?${params.toString()}`)
        .then((d) => {
          setData(d.appointments || []);
          setCounts(d.counts || { all: 0, booked: 0, done: 0, cancelled: 0 });
        })
        .catch((err) => {
          show(err.message || 'Could not load visits', 'error');
          setData([]);
        });
    }, 200);
    return () => clearTimeout(t);
  }, [status, visitType, q, from, to]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Site visits</h1>
        <p className="text-slate-500 text-sm mt-0.5">Every booked, completed and cancelled visit — filter by type, date or lead.</p>
      </div>

      <div className="card p-3">
        <div className="space-y-3">
          <ScrollTabBar value={status} fadeFrom="from-slate-100" className="rounded-lg bg-slate-100 p-1" trackClassName="h-9 gap-1 sm:h-10">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s.value}
                type="button"
                data-tab={s.value}
                onClick={() => setStatus(s.value)}
                className={`h-full shrink-0 whitespace-nowrap rounded-md px-3 text-sm font-medium ${status === s.value ? 'bg-navy-900 text-white' : 'text-slate-500 hover:bg-white'}`}
              >
                {s.label}
                {s.value === 'ALL' && counts.all ? ` (${counts.all})` : ''}
                {s.value === 'booked' && counts.booked ? ` (${counts.booked})` : ''}
                {s.value === 'done' && counts.done ? ` (${counts.done})` : ''}
                {s.value === 'cancelled' && counts.cancelled ? ` (${counts.cancelled})` : ''}
              </button>
            ))}
          </ScrollTabBar>
          <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center lg:justify-end">
            <div className="relative w-full lg:w-48 lg:shrink-0">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                className="input !pl-9 w-full"
                placeholder="Search visits…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Search visits"
              />
            </div>
            <SelectMenu
              className="w-full lg:w-44 lg:shrink-0"
              label="Visit type"
              value={visitType}
              onChange={setVisitType}
              options={TYPE_FILTERS}
            />
            <div className="grid w-full grid-cols-2 gap-2 lg:flex lg:w-auto lg:items-center">
              <DatePicker
                className="w-full lg:w-[10.5rem]"
                label="From date"
                value={from}
                onChange={setFrom}
                placeholder="From"
              />
              <span className="hidden text-xs text-slate-400 lg:inline">to</span>
              <DatePicker
                className="w-full lg:w-[10.5rem]"
                label="To date"
                value={to}
                onChange={setTo}
                placeholder="To"
              />
            </div>
          </div>
        </div>
      </div>

      {!data ? <PageLoading /> : data.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No visits found" detail="Try a different status, type or date range." />
      ) : wideList ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">When</th>
                  <th className="text-left px-4 py-2.5 font-medium">Lead</th>
                  <th className="text-left px-4 py-2.5 font-medium">Type</th>
                  <th className="text-left px-4 py-2.5 font-medium">Title</th>
                  <th className="text-left px-4 py-2.5 font-medium">Address</th>
                  <th className="text-left px-4 py-2.5 font-medium">Assigned</th>
                  <th className="text-left px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.map((visit) => (
                  <tr key={visit.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-800 font-medium">{fmtDateTime(visit.start)}</td>
                    <td className="px-4 py-3">
                      <Link
                        to={leadPath(visit.customer_id, 'visits', visit.lead_id)}
                        className="hover:text-brand-600 font-medium"
                      >
                        {visit.lead_name || leadDisplayName({
                          ref: visit.lead_ref,
                          customer_name: visit.customer_name,
                        })}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{visitTypeLabel(visit.visit_type)}</td>
                    <td className="px-4 py-3 text-slate-500">{visit.title}</td>
                    <td className="px-4 py-3 text-slate-500">{visit.address || '—'}</td>
                    <td className="px-4 py-3 text-slate-500">{visit.assignee_name || '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={visit.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {data.map((visit) => <VisitCard key={visit.id} visit={visit} />)}
        </div>
      )}
      {toast && <Toast {...toast} />}
    </div>
  );
}
