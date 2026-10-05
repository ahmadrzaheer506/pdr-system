import React, { useState } from 'react';
import { ListTodo } from 'lucide-react';
import { api } from '../lib/api';
import { PriorityBadge } from './ui.jsx';
import DatePicker from './DatePicker.jsx';
import { localIsoDate } from '../lib/schedule';

/**
 * PENDING jobs waiting for a date (requirement 8.1). Place sets dates and SCHEDULED.
 */
export default function UnscheduledQueue({ jobs = [], onPlaced, onError, onOpen }) {
  const [forms, setForms] = useState({});
  const [saving, setSaving] = useState(null);

  const today = localIsoDate();
  const formFor = (id) => forms[id] || { start_date: '', end_date: '' };
  const setField = (id, field, value) => {
    setForms((prev) => {
      const current = prev[id] || { start_date: '', end_date: '' };
      const next = { ...current, [field]: value };
      if (field === 'start_date' && next.end_date && value && next.end_date < value) {
        next.end_date = '';
      }
      return { ...prev, [id]: next };
    });
  };

  const place = async (job) => {
    const form = formFor(job.id);
    if (!form.start_date || form.start_date < today) return;
    setSaving(job.id);
    try {
      await api.put(`/jobs/${job.id}`, {
        start_date: form.start_date,
        end_date: form.end_date || form.start_date,
      });
      setForms((prev) => {
        const next = { ...prev };
        delete next[job.id];
        return next;
      });
      onPlaced();
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="card flex h-full min-h-[28rem] max-h-[min(52rem,calc(100vh-5.5rem))] flex-col p-4 lg:sticky lg:top-4 lg:min-h-[42rem]">
      <h3 className="mb-1 flex shrink-0 items-center gap-1.5 font-semibold text-slate-800"><ListTodo size={16} /> Unscheduled</h3>
      <p className="mb-3 shrink-0 text-xs text-slate-400">PENDING jobs. Place them with a start date (end date optional).</p>
      {jobs.length === 0 && <p className="text-sm text-slate-400">Queue is empty.</p>}
      <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-0.5">
        {jobs.map((job) => {
          const form = formFor(job.id);
          return (
            <li key={job.id} className="border border-slate-100 rounded-lg p-3">
              <button type="button" onClick={() => onOpen(job.id)} className="font-medium text-sm text-slate-800 hover:text-brand-600 text-left">
                {job.title}
              </button>
              <div className="text-xs text-slate-500 mt-0.5">{job.customer_name}</div>
              {job.priority && job.priority !== 'normal' && (
                <div className="mt-1"><PriorityBadge priority={job.priority} /></div>
              )}
              <div className="mt-2 space-y-1.5">
                <DatePicker
                  size="sm"
                  label={`Start date for ${job.title}`}
                  value={form.start_date}
                  onChange={(start_date) => setField(job.id, 'start_date', start_date)}
                  min={today}
                  placeholder="Start date"
                />
                <DatePicker
                  size="sm"
                  label={`End date for ${job.title}`}
                  value={form.end_date}
                  onChange={(end_date) => setField(job.id, 'end_date', end_date)}
                  min={form.start_date || today}
                  placeholder="End date (optional)"
                />
                <button
                  type="button"
                  disabled={saving === job.id || !form.start_date}
                  onClick={() => place(job)}
                  className="btn-secondary !py-1 !px-3 text-xs w-full"
                  aria-label={`Place ${job.title}`}
                >
                  {saving === job.id ? 'Placing…' : 'Place'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
