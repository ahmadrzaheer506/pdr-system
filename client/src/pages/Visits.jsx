import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import { api, fmtDateTime } from '../lib/api';
import { PageLoading, StatusBadge, EmptyState, useToast, Toast } from '../components/ui.jsx';
import ListFilterBar from '../components/ListFilterBar.jsx';
import { leadPath } from '../lib/customerRoutes.js';
import { leadDisplayName } from '../lib/leads.js';
import { VISIT_TYPES, visitTypeLabel } from '../lib/visitTypes';

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

      <ListFilterBar
        tabs={STATUS_FILTERS}
        value={status}
        onChange={setStatus}
        searchValue={q}
        onSearchChange={setQ}
        searchLabel="Search visits"
        select={{
          label: 'Filter by type',
          value: visitType,
          onChange: setVisitType,
          options: TYPE_FILTERS,
        }}
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
        fromLabel="From date"
        toLabel="To date"
      />

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
