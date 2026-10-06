import React, { useEffect, useRef, useState } from 'react';
import { ListTodo } from 'lucide-react';
import { api, fmtDate } from '../lib/api';
import { PriorityBadge } from './ui.jsx';
import DatePicker from './DatePicker.jsx';
import CrewChips, { CrewFitNotes, CrewConflictNotes } from './CrewChips.jsx';
import CrewConflictModal from './CrewConflictModal.jsx';
import {
  localIsoDate,
  datesInRange,
  bookingsFromJobsRange,
  mergeCrewBookings,
  crewSaveConflicts,
} from '../lib/schedule';
import { missingRequiredSkills, crewHasDriver } from '../lib/skills';

function mergeHolidayRows(...lists) {
  const seen = new Set();
  const rows = [];
  for (const list of lists) {
    for (const row of list || []) {
      const key = row?.id ?? `${row?.user_id}-${row?.start_date}-${row?.end_date}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  }
  return rows;
}

function placeDays(form) {
  return datesInRange(form.start_date, form.end_date || form.start_date);
}

/**
 * PENDING jobs waiting for a date (requirement 8.1). Place sets dates and SCHEDULED.
 * After a start date is picked, office can assign crew the same way as JobModal.
 */
export default function UnscheduledQueue({
  jobs = [],
  staff = [],
  holidays = [],
  weekJobs = [],
  onPlaced,
  onError,
  onOpen,
}) {
  const [forms, setForms] = useState({});
  const [saving, setSaving] = useState(null);
  const [avail, setAvail] = useState({ holidays: [], bookings: [] });
  const [conflict, setConflict] = useState(null);
  const fetchedRanges = useRef(new Set());

  const today = localIsoDate();
  const formFor = (id) => forms[id] || { start_date: '', end_date: '', crew: [] };

  useEffect(() => {
    const ranges = [...new Set(Object.values(forms)
      .filter((form) => form.start_date)
      .map((form) => `${form.start_date}:${form.end_date || form.start_date}`))];
    ranges.forEach((key) => {
      if (fetchedRanges.current.has(key)) return;
      fetchedRanges.current.add(key);
      const [from, to] = key.split(':');
      api.get(`/jobs/availability?from=${from}&to=${to}`)
        .then((d) => {
          setAvail((prev) => ({
            holidays: mergeHolidayRows(prev.holidays, d.holidays),
            bookings: mergeCrewBookings(prev.bookings, d.bookings),
          }));
        })
        .catch(() => {});
    });
  }, [forms]);

  const setField = (id, field, value) => {
    setForms((prev) => {
      const current = prev[id] || { start_date: '', end_date: '', crew: [] };
      const next = { ...current, [field]: value };
      if (field === 'start_date' && next.end_date && value && next.end_date < value) {
        next.end_date = '';
      }
      return { ...prev, [id]: next };
    });
  };

  const toggleCrew = (id, uid) => {
    setForms((prev) => {
      const current = prev[id] || { start_date: '', end_date: '', crew: [] };
      const crew = current.crew || [];
      const on = crew.some((item) => Number(item) === Number(uid));
      return {
        ...prev,
        [id]: {
          ...current,
          crew: on ? crew.filter((item) => Number(item) !== Number(uid)) : [...crew, uid],
        },
      };
    });
  };

  const overlaysFor = (form, jobId) => {
    const days = placeDays(form);
    const dayHolidays = holidays.length ? holidays : (avail.holidays || []);
    const dayBookings = mergeCrewBookings(bookingsFromJobsRange(weekJobs, days), avail.bookings);
    return { days, dayHolidays, dayBookings, excludeJobId: jobId };
  };

  const writePlace = async (job, confirmConflicts) => {
    const form = formFor(job.id);
    if (!form.start_date || form.start_date < today) return;
    const days = placeDays(form);
    setSaving(job.id);
    try {
      await api.put(`/jobs/${job.id}`, {
        start_date: form.start_date,
        end_date: form.end_date || form.start_date,
      });
      const crew = form.crew || [];
      if (crew.length) {
        await api.put(`/jobs/${job.id}/assignments`, {
          work_date: days[0],
          work_dates: days,
          user_ids: crew,
          ...(confirmConflicts ? { confirm_conflicts: true } : {}),
        });
      }
      setConflict(null);
      setForms((prev) => {
        const next = { ...prev };
        delete next[job.id];
        return next;
      });
      onPlaced();
    } catch (err) {
      if (err.status === 409 && err.data?.needs_confirm) {
        setConflict({ jobId: job.id, conflicts: err.data.conflicts || [] });
        return;
      }
      onError(err.message);
    } finally {
      setSaving(null);
    }
  };

  const place = (job) => {
    const form = formFor(job.id);
    if (!form.start_date || form.start_date < today || saving) return;
    const crew = form.crew || [];
    if (crew.length) {
      const { days, dayHolidays, dayBookings } = overlaysFor(form, job.id);
      const conflicts = crewSaveConflicts({
        staff,
        selectedIds: crew,
        holidays: dayHolidays,
        bookings: dayBookings,
        dates: days,
        excludeJobId: job.id,
      });
      if (conflicts.length) {
        setConflict({ jobId: job.id, conflicts });
        return;
      }
    }
    writePlace(job, false);
  };

  const conflictJob = conflict ? jobs.find((job) => job.id === conflict.jobId) : null;
  const conflictForm = conflictJob ? formFor(conflictJob.id) : null;
  const conflictDays = conflictForm ? placeDays(conflictForm) : [];

  return (
    <div className="card flex h-full min-h-[28rem] max-h-[min(52rem,calc(100vh-5.5rem))] flex-col p-4 lg:sticky lg:top-4 lg:min-h-[42rem]">
      <h3 className="mb-1 flex shrink-0 items-center gap-1.5 font-semibold text-slate-800"><ListTodo size={16} /> Unscheduled</h3>
      <p className="mb-3 shrink-0 text-xs text-slate-400">PENDING jobs. Place them with a start date (end date optional).</p>
      {jobs.length === 0 && <p className="text-sm text-slate-400">Queue is empty.</p>}
      <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-0.5">
        {jobs.map((job) => {
          const form = formFor(job.id);
          const days = form.start_date ? placeDays(form) : [];
          const { dayHolidays, dayBookings } = form.start_date
            ? overlaysFor(form, job.id)
            : { dayHolidays: [], dayBookings: [] };
          const crew = form.crew || [];
          const skills = Array.isArray(job.required_skills) ? job.required_skills : [];
          const crewLabel = days.length > 1
            ? `${fmtDate(days[0])} – ${fmtDate(days[days.length - 1])}`
            : (form.start_date ? fmtDate(form.start_date) : '');
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
                {form.start_date && staff.length > 0 ? (
                  <div className="pt-1">
                    <p className="mb-2 text-[11px] text-slate-400">
                      Crew for {crewLabel}. Holiday and booked chips still save
                      {days.length > 1 ? ', and conflicts are checked on every day' : ''}.
                    </p>
                    <CrewChips
                      staff={staff}
                      selectedIds={crew}
                      onToggle={(uid) => toggleCrew(job.id, uid)}
                      holidays={dayHolidays}
                      bookings={dayBookings}
                      workDate={form.start_date}
                      workDates={days}
                      excludeJobId={job.id}
                      requiredSkills={skills}
                      disabled={saving === job.id}
                    />
                    <CrewFitNotes
                      missingSkills={missingRequiredSkills(staff, crew, skills)}
                      needsDriver={!!job.needs_driver}
                      hasDriver={crewHasDriver(staff, crew)}
                    />
                    <CrewConflictNotes
                      staff={staff}
                      selectedIds={crew}
                      holidays={dayHolidays}
                      bookings={dayBookings}
                      workDate={form.start_date}
                      workDates={days}
                      excludeJobId={job.id}
                    />
                  </div>
                ) : null}
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
      <CrewConflictModal
        open={!!conflictJob}
        conflicts={conflict?.conflicts || []}
        dateLabel={conflictDays.length > 1
          ? `${fmtDate(conflictDays[0])} – ${fmtDate(conflictDays[conflictDays.length - 1])}`
          : (conflictForm?.start_date ? fmtDate(conflictForm.start_date) : '')}
        saving={conflictJob ? saving === conflictJob.id : false}
        onCancel={() => { if (!saving) setConflict(null); }}
        onConfirm={() => { if (conflictJob) writePlace(conflictJob, true); }}
      />
    </div>
  );
}
