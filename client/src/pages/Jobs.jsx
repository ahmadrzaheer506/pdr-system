import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase } from 'lucide-react';
import { api, money, fmtDate } from '../lib/api';
import { PageLoading, StatusBadge, PriorityBadge, EmptyState, useToast, Toast } from '../components/ui.jsx';
import ListFilterBar from '../components/ListFilterBar.jsx';
import JobModal from '../components/JobModal.jsx';
import { leadPath } from '../lib/customerRoutes.js';
import { leadDisplayName } from '../lib/leads.js';
import { JOB_STATUSES, JOB_PRIORITY_OPTIONS } from '../lib/jobStatus';
import { ROLES } from '../lib/roles';

const STATUS_FILTERS = [
  { value: 'ALL', label: 'All' },
  ...JOB_STATUSES.map((status) => ({
    value: status,
    label: status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase()),
  })),
];

const PRIORITY_FILTERS = [
  { value: 'ALL', label: 'All priorities' },
  ...JOB_PRIORITY_OPTIONS,
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

function jobLeadName(job) {
  return leadDisplayName({
    ref: job.lead_ref,
    customer_name: job.customer_name,
  });
}

function jobDates(job) {
  if (!job.start_date) return 'Not dated';
  if (job.end_date && job.end_date !== job.start_date) {
    return `${fmtDate(job.start_date)} – ${fmtDate(job.end_date)}`;
  }
  return fmtDate(job.start_date);
}

function JobCard({ job, onOpen }) {
  return (
    <article className="card p-3.5">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => onOpen(job.id)}
          className="min-w-0 text-left font-medium text-slate-800 hover:text-brand-600"
        >
          {job.title}
        </button>
        <StatusBadge status={job.status} />
      </div>
      <p className="mt-1.5 text-sm font-medium text-slate-800">{jobDates(job)}</p>
      <Link
        to={leadPath(job.customer_id, 'jobs', job.lead_id)}
        className="mt-1 block text-sm text-slate-600 hover:text-brand-600"
      >
        {jobLeadName(job)}
      </Link>
      {job.quote_ref ? <p className="mt-0.5 text-sm text-slate-500">From {job.quote_ref}</p> : null}
      <p className="mt-0.5 text-sm text-slate-500">{job.address || '—'}</p>
      <p className="mt-0.5 text-sm text-slate-500">{job.crew || 'No crew yet'}</p>
      {job.value != null && job.value !== '' ? (
        <p className="mt-1 text-sm font-semibold text-slate-900">{money(job.value)}</p>
      ) : null}
    </article>
  );
}

export default function Jobs() {
  const [status, setStatus] = useState('ALL');
  const [priority, setPriority] = useState('ALL');
  const [q, setQ] = useState('');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [data, setData] = useState(null);
  const [openJob, setOpenJob] = useState(null);
  const [staff, setStaff] = useState([]);
  const wideList = useWideList();
  const { toast, show } = useToast();

  const load = () => {
    const params = new URLSearchParams();
    params.set('status', status);
    if (priority !== 'ALL') params.set('priority', priority);
    if (q.trim()) params.set('q', q.trim());
    if (createdFrom) params.set('created_from', createdFrom);
    if (createdTo) params.set('created_to', createdTo);
    api.get(`/jobs?${params.toString()}`)
      .then((d) => setData(d.jobs || []))
      .catch((err) => {
        show(err.message || 'Could not load jobs', 'error');
        setData([]);
      });
  };

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [status, priority, q, createdFrom, createdTo]);

  useEffect(() => {
    api.get('/settings/users')
      .then((d) => setStaff((d.users || []).filter((u) => u.role === ROLES.STAFF)))
      .catch(() => setStaff([]));
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Jobs</h1>
        <p className="text-slate-500 text-sm mt-0.5">Every job from pending through paid — filter, search, and open the job card.</p>
      </div>

      <ListFilterBar
        tabs={STATUS_FILTERS}
        value={status}
        onChange={setStatus}
        searchValue={q}
        onSearchChange={setQ}
        searchLabel="Search jobs"
        select={{
          label: 'Filter by priority',
          value: priority,
          onChange: setPriority,
          options: PRIORITY_FILTERS,
        }}
        from={createdFrom}
        to={createdTo}
        onFromChange={setCreatedFrom}
        onToChange={setCreatedTo}
      />

      {!data ? <PageLoading /> : data.length === 0 ? (
        <EmptyState icon={Briefcase} title="No jobs found" detail="Try a different status, priority or date range." />
      ) : wideList ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">Job</th>
                  <th className="text-left px-4 py-2.5 font-medium">Lead</th>
                  <th className="text-left px-4 py-2.5 font-medium">Dates</th>
                  <th className="text-left px-4 py-2.5 font-medium">Crew</th>
                  <th className="text-right px-4 py-2.5 font-medium">Value</th>
                  <th className="text-left px-4 py-2.5 font-medium">Priority</th>
                  <th className="text-left px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.map((job) => (
                  <tr key={job.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setOpenJob(job.id)}
                        className="text-left font-medium text-slate-800 hover:text-brand-600"
                      >
                        {job.title}
                      </button>
                      {job.quote_ref ? (
                        <div className="mt-0.5 text-xs text-slate-400">From {job.quote_ref}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={leadPath(job.customer_id, 'jobs', job.lead_id)}
                        className="font-medium hover:text-brand-600"
                      >
                        {jobLeadName(job)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">{jobDates(job)}</td>
                    <td className="px-4 py-3 text-slate-500">{job.crew || '—'}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      {job.value != null && job.value !== '' ? money(job.value) : '—'}
                    </td>
                    <td className="px-4 py-3"><PriorityBadge priority={job.priority} /></td>
                    <td className="px-4 py-3"><StatusBadge status={job.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {data.map((job) => (
            <JobCard key={job.id} job={job} onOpen={setOpenJob} />
          ))}
        </div>
      )}

      <JobModal
        jobId={openJob}
        onClose={() => setOpenJob(null)}
        onChanged={() => { load(); }}
        staff={staff}
        jobs={data || []}
        from="jobs"
      />
      {toast && <Toast {...toast} />}
    </div>
  );
}
