import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight, CalendarDays, CalendarOff, Check, Loader2, MapPin, MessageSquare, Pencil, Receipt, Send, Users, Wrench, X,
} from 'lucide-react';
import { api, fmtDate } from '../lib/api';
import { leadPath } from '../lib/customerRoutes.js';
import { Modal, StatusBadge, PriorityBadge, HoverTooltip } from './ui.jsx';
import ContactPickers from './ContactPickers.jsx';
import JobKit from './JobKit.jsx';
import JobFiles from './JobFiles.jsx';
import JobVariations from './JobVariations.jsx';
import { JOB_STATUSES, canAdvanceJobStatus, canUnscheduleJob, JOB_PRIORITY_OPTIONS } from '../lib/jobStatus';
import { SKILL_OPTIONS, skillLabel, missingRequiredSkills, crewHasDriver } from '../lib/skills';
import { datesInRange, localIsoDate, parseIsoDate, crewIdsForDate, crewSaveConflicts, bookingsFromJobsRange, mergeCrewBookings, jobDatesForCrewDay } from '../lib/schedule';
import DatePicker from './DatePicker.jsx';
import SelectMenu from './SelectMenu.jsx';
import CrewChips, { CrewFitNotes, CrewConflictNotes } from './CrewChips.jsx';
import CrewConflictModal from './CrewConflictModal.jsx';

function Panel({ icon: Icon, title, hint, actions, children, className = '' }) {
  return (
    <section className={`flex flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}>
      {title ? (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-slate-900">
              {Icon ? (
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-600 ring-1 ring-slate-200/70">
                  <Icon size={15} />
                </span>
              ) : null}
              {title}
            </h4>
            {hint ? <p className="mt-1 text-xs leading-relaxed text-slate-400">{hint}</p> : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      ) : null}
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

function Alert({ tone = 'error', children, role }) {
  const tones = {
    error: 'border-red-200 bg-red-50 text-red-700',
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    warn: 'border-amber-200 bg-amber-50 text-amber-800',
  };
  return (
    <div className={`rounded-xl border px-3.5 py-2.5 text-sm ${tones[tone]}`} role={role}>
      {children}
    </div>
  );
}

const STATUS_COPY = {
  PENDING: 'Waiting to be placed on the calendar',
  SCHEDULED: 'Booked — crew can be assigned',
  IN_PROGRESS: 'Work is underway on site',
  COMPLETED: 'Job finished, ready to bill',
  INVOICED: 'Invoice raised, waiting for payment',
  PAID: 'Paid in full',
};

function statusButtonName(status) {
  return String(status || '').replace('_', ' ');
}

function statusTitle(status) {
  return statusButtonName(status)
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function JobPriorityControl({ priority, saving, editing, onEdit, onCancel, onChange }) {
  const value = priority || 'normal';
  if (!editing) {
    return (
      <span className="inline-flex items-center gap-0.5">
        <PriorityBadge priority={value} />
        <HoverTooltip text="Change priority">
          <button
            type="button"
            onClick={onEdit}
            disabled={saving}
            aria-label="Change priority"
            className="btn-ghost !p-1 text-slate-400 hover:text-slate-700"
          >
            <Pencil size={12} />
          </button>
        </HoverTooltip>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <span className="w-[8.25rem]">
        <SelectMenu
          label="Priority"
          size="sm"
          value={value}
          disabled={saving}
          onChange={onChange}
          options={JOB_PRIORITY_OPTIONS}
        />
      </span>
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        aria-label="Cancel priority edit"
        className="btn-ghost !p-1 text-slate-400 hover:text-slate-700"
      >
        {saving ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
      </button>
    </span>
  );
}

function JobStatusSteps({ current, saving, onSelect }) {
  const currentIndex = JOB_STATUSES.indexOf(current);
  return (
    <ol className="space-y-0">
      {JOB_STATUSES.map((status, index) => {
        const allowed = canAdvanceJobStatus(current, status);
        const isCurrent = current === status;
        const done = currentIndex > index;
        const last = index === JOB_STATUSES.length - 1;
        return (
          <li key={status} className="relative flex gap-3">
            {!last ? (
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute left-[15px] top-8 h-[calc(100%-8px)] w-px ${
                  done ? 'bg-emerald-300' : 'bg-slate-200'
                }`}
              />
            ) : null}
            <button
              type="button"
              disabled={!allowed || !!saving}
              onClick={() => onSelect(status)}
              aria-label={statusButtonName(status)}
              aria-current={isCurrent ? 'step' : undefined}
              aria-busy={saving === status || undefined}
              className={`group relative z-[1] mb-1 flex min-w-0 flex-1 items-start gap-3 rounded-xl px-1.5 py-1.5 text-left transition ${
                isCurrent
                  ? 'bg-slate-50 ring-1 ring-slate-200/80'
                  : allowed
                    ? 'hover:bg-slate-50'
                    : 'cursor-not-allowed'
              }`}
            >
              <span
                aria-hidden="true"
                className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                  done
                    ? 'bg-emerald-500 text-white'
                    : isCurrent
                      ? 'bg-navy-900 text-white shadow-sm'
                      : allowed
                        ? 'bg-white text-slate-400 ring-1 ring-slate-200 group-hover:ring-slate-300'
                        : 'bg-slate-100 text-slate-300'
                }`}
              >
                {saving === status
                  ? <Loader2 size={13} className="animate-spin" />
                  : done
                    ? <Check size={13} strokeWidth={2.5} />
                    : index + 1}
              </span>
              <span className="min-w-0 flex-1 pt-0.5">
                <span className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${
                    isCurrent ? 'text-slate-900' : done ? 'text-slate-700' : allowed ? 'text-slate-700' : 'text-slate-400'
                  }`}
                  >
                    {statusTitle(status)}
                  </span>
                  {isCurrent ? (
                    <span className="rounded-full bg-navy-900 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-white">
                      Now
                    </span>
                  ) : null}
                </span>
                <span className={`mt-0.5 block text-[11px] leading-snug ${
                  isCurrent || done ? 'text-slate-500' : 'text-slate-400'
                }`}
                >
                  {STATUS_COPY[status]}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function JobInvoiceCard({ invoiceId, invoiceRef, saving, onCreate }) {
  if (invoiceId) {
    return (
      <div className="flex h-full min-h-[11rem] flex-col justify-between gap-4">
        <div className="flex items-start gap-3 rounded-2xl bg-emerald-50/90 px-4 py-4 ring-1 ring-emerald-100">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-600 shadow-sm ring-1 ring-emerald-100">
            <Check size={18} strokeWidth={2.5} />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Raised</p>
            <p className="mt-0.5 truncate text-base font-semibold tracking-tight text-slate-900">
              {invoiceRef || `Invoice ${invoiceId}`}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              Invoice {invoiceRef || invoiceId} already exists for this job.
            </p>
          </div>
        </div>
        <a href="/invoices" className="btn-secondary w-full !py-2.5 text-sm">
          Open invoices
        </a>
      </div>
    );
  }
  return (
    <div className="flex h-full min-h-[11rem] flex-col">
      <div className="flex flex-1 flex-col justify-center rounded-2xl bg-gradient-to-b from-slate-50 to-white px-4 py-5 ring-1 ring-slate-200/80">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-brand-50">
          <Receipt size={18} />
        </span>
        <p className="mt-3 text-sm font-semibold text-slate-900">No invoice yet</p>
        <p className="mt-1 max-w-[18rem] text-xs leading-relaxed text-slate-500">
          Raise a bill from this job’s quote. You can send it and record payment from Invoices.
        </p>
      </div>
      <button
        type="button"
        className="btn-primary mt-4 w-full !py-2.5 text-sm"
        disabled={saving}
        aria-busy={saving || undefined}
        onClick={onCreate}
      >
        {saving ? (
          <><Loader2 size={14} className="animate-spin" /> Creating…</>
        ) : 'Create invoice'}
      </button>
    </div>
  );
}

export default function JobModal({ jobId, crewDate, onClose, onChanged, staff = [], jobs = [], holidays: holidayRows = [], from = 'schedule' }) {
  const [job, setJob] = useState(null);
  const [messages, setMessages] = useState([]);
  const [crew, setCrew] = useState([]);
  const [crewDay, setCrewDay] = useState('');
  const [skills, setSkills] = useState([]);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [crewWarnings, setCrewWarnings] = useState([]);
  const [avail, setAvail] = useState({ holidays: [], bookings: [] });
  const [contacts, setContacts] = useState({ site_id: '', phone_id: '', email_id: '' });
  const [savingContacts, setSavingContacts] = useState(false);
  const [savingSkills, setSavingSkills] = useState(false);
  const [needsDriver, setNeedsDriver] = useState(false);
  const [savingDriver, setSavingDriver] = useState(false);
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [invoiceNote, setInvoiceNote] = useState('');
  const [crewConflicts, setCrewConflicts] = useState([]);
  const [savingDates, setSavingDates] = useState(false);
  const [savingCrew, setSavingCrew] = useState(false);
  const [savingStatus, setSavingStatus] = useState('');
  const [savingPriority, setSavingPriority] = useState(false);
  const [editingPriority, setEditingPriority] = useState(false);
  const crewPanelRef = useRef(null);
  const crewDateRef = useRef(crewDate);
  crewDateRef.current = crewDate;

  const load = () => api.get(`/jobs/${jobId}`).then((d) => {
    setJob(d.job);
    setMessages(d.messages);
    const days = datesInRange(d.job.start_date, d.job.end_date || d.job.start_date);
    const today = localIsoDate();
    const preferred = parseIsoDate(crewDateRef.current);
    const nextDay = days.includes(preferred)
      ? preferred
      : (days.includes(crewDay) ? crewDay : (days.includes(today) ? today : (days[0] || '')));
    setCrewDay(nextDay);
    setCrew(crewIdsForDate(d.job, nextDay));
    setSkills(Array.isArray(d.job.required_skills) ? d.job.required_skills : []);
    setNeedsDriver(!!d.job.needs_driver);
    setContacts({
      site_id: d.job.site_id || '',
      phone_id: d.job.phone_id || '',
      email_id: d.job.email_id || '',
    });
  }).catch((err) => setError(err.message));
  useEffect(() => { if (jobId) { setCrewWarnings([]); setInvoiceNote(''); setEditingPriority(false); load(); } }, [jobId]);
  useEffect(() => {
    const preferred = parseIsoDate(crewDate);
    if (!preferred || !job) return;
    const days = datesInRange(job.start_date, job.end_date || job.start_date);
    if (!days.includes(preferred) || preferred === crewDay) return;
    setCrewDay(preferred);
    setCrew(crewIdsForDate(job, preferred));
  }, [crewDate]);
  useEffect(() => {
    const range = datesInRange(job?.start_date, job?.end_date || job?.start_date);
    const from = range[0] || crewDay;
    const to = range[range.length - 1] || crewDay;
    if (!jobId || !from) {
      setAvail({ holidays: [], bookings: [] });
      return undefined;
    }
    let cancelled = false;
    api.get(`/jobs/availability?from=${from}&to=${to}`)
      .then((d) => {
        if (!cancelled) setAvail({ holidays: d.holidays || [], bookings: d.bookings || [] });
      })
      .catch(() => {
        if (!cancelled) setAvail({ holidays: [], bookings: [] });
      });
    return () => { cancelled = true; };
  }, [jobId, job?.start_date, job?.end_date, crewDay]);

  if (!jobId) return null;

  const jobDays = job
    ? datesInRange(job.start_date, job.end_date || job.start_date)
    : (crewDay ? [crewDay] : []);
  const dayHolidays = holidayRows.length ? holidayRows : (avail.holidays || []);
  const dayBookings = mergeCrewBookings(bookingsFromJobsRange(jobs, jobDays), avail.bookings);

  const toggleCrew = (uid) => setCrew((c) => (
    c.some((id) => Number(id) === Number(uid))
      ? c.filter((id) => Number(id) !== Number(uid))
      : [...c, uid]
  ));
  const toggleSkill = (skill) => {
    setSkills((cur) => (cur.includes(skill) ? cur.filter((s) => s !== skill) : [...cur, skill]));
  };
  const saveDates = async (patch) => {
    const today = localIsoDate();
    if (patch.start_date && patch.start_date < today) return;
    setError('');
    setSavingDates(true);
    try {
      await api.put(`/jobs/${jobId}`, patch);
      onChanged();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingDates(false);
    }
  };
  const writeCrew = async (confirmConflicts = false) => {
    setError('');
    setCrewWarnings([]);
    setSavingCrew(true);
    try {
      const nextDates = jobDatesForCrewDay(job, crewDay);
      if (nextDates) {
        await api.put(`/jobs/${jobId}`, nextDates);
      }
      const result = await api.put(`/jobs/${jobId}/assignments`, {
        work_date: crewDay,
        user_ids: crew,
        ...(confirmConflicts ? { confirm_conflicts: true } : {}),
      });
      setCrewConflicts([]);
      setCrewWarnings(result.warnings || []);
      onChanged();
      load();
    } catch (err) {
      if (err.status === 409 && err.data?.needs_confirm) {
        setCrewConflicts(err.data.conflicts || []);
        return;
      }
      setError(err.message);
    } finally {
      setSavingCrew(false);
    }
  };
  const saveCrew = async () => {
    if (savingCrew || !crewDay) return;
    const conflicts = crewSaveConflicts({
      staff,
      selectedIds: crew,
      holidays: dayHolidays,
      bookings: dayBookings,
      dates: jobDays.length ? jobDays : [crewDay],
      excludeJobId: job.id,
    });
    if (conflicts.length) {
      setError('');
      setCrewConflicts(conflicts);
      return;
    }
    await writeCrew(false);
  };
  const saveDriver = async (on) => {
    setSavingDriver(true);
    setError('');
    setNeedsDriver(on);
    try {
      await api.put(`/jobs/${jobId}`, { needs_driver: on });
      onChanged();
      load();
    } catch (err) {
      setNeedsDriver(!on);
      setError(err.message);
    } finally {
      setSavingDriver(false);
    }
  };
  const saveSkills = async () => {
    setSavingSkills(true);
    setError('');
    try {
      await api.put(`/jobs/${jobId}`, { required_skills: skills });
      onChanged();
      load();
    } catch (err) { setError(err.message); }
    finally { setSavingSkills(false); }
  };
  const saveContacts = async () => {
    setSavingContacts(true);
    setError('');
    try {
      await api.put(`/jobs/${jobId}`, {
        site_id: contacts.site_id || null,
        phone_id: contacts.phone_id || null,
        email_id: contacts.email_id || null,
      });
      onChanged();
      load();
    } catch (err) { setError(err.message); }
    finally {
      setSavingContacts(false);
    }
  };
  const setStatus = async (status) => {
    if (!job || job.status === status || !canAdvanceJobStatus(job.status, status) || savingStatus) return;
    setError('');
    setSavingStatus(status);
    try {
      await api.put(`/jobs/${jobId}/status`, { status });
      onChanged();
      load();
    } catch (err) { setError(err.message); }
    finally { setSavingStatus(''); }
  };
  const unschedule = async () => {
    if (!job || !canUnscheduleJob(job.status) || savingStatus) return;
    setError('');
    setSavingStatus('UNSCHEDULE');
    try {
      await api.post(`/jobs/${jobId}/unschedule`);
      onChanged();
      load();
    } catch (err) { setError(err.message); }
    finally { setSavingStatus(''); }
  };
  const savePriority = async (priority) => {
    const current = job?.priority || 'normal';
    if (!job || savingPriority) return;
    if (priority === current) {
      setEditingPriority(false);
      return;
    }
    const prev = job.priority;
    setError('');
    setSavingPriority(true);
    setJob({ ...job, priority });
    try {
      await api.put(`/jobs/${jobId}`, { priority });
      setEditingPriority(false);
      onChanged();
      load();
    } catch (err) {
      setJob((cur) => (cur ? { ...cur, priority: prev } : cur));
      setError(err.message);
    } finally {
      setSavingPriority(false);
    }
  };
  const sendMsg = async () => {
    if (!msg.trim()) return;
    try {
      await api.post(`/jobs/${jobId}/messages`, { body: msg });
      setMsg('');
      load();
    } catch (err) { setError(err.message); }
  };

  const createInvoice = async () => {
    setError('');
    setSavingInvoice(true);
    try {
      const created = await api.post('/invoices', { job_id: jobId });
      onChanged();
      load();
      setInvoiceNote(`Invoice ${created.ref} created`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingInvoice(false);
    }
  };

  const when = job?.start_date
    ? `${fmtDate(job.start_date)}${job.end_date && job.end_date !== job.start_date ? ` – ${fmtDate(job.end_date)}` : ''}${
      job.start_time && job.end_time ? ` · ${job.start_time}–${job.end_time}` : ''
    }`
    : '';
  const subtitle = job
    ? [job.customer_name, job.address].filter(Boolean).join(' · ')
    : '';
  const leadHref = job?.customer_id
    ? leadPath(job.customer_id, from, job.lead_id)
    : null;

  return (
    <>
    <Modal
      open={!!jobId}
      onClose={onClose}
      title={job?.title || 'Job'}
      subtitle={subtitle}
      size="4xl"
      tall
      headerActions={leadHref ? (
        <Link
          to={leadHref}
          onClick={onClose}
          className="btn-secondary !py-1.5 !px-2.5 text-xs inline-flex items-center gap-1"
        >
          Open lead
          <ArrowUpRight size={13} />
        </Link>
      ) : null}
    >
      {!job ? (
        error ? <Alert tone="error" role="alert">{error}</Alert>
          : <div className="py-10 text-center text-sm text-slate-400">Loading…</div>
      ) : (
        <div className="-mx-5 -my-4 space-y-4 bg-slate-50/90 px-5 py-5">
          {error && <Alert tone="error">{error}</Alert>}
          {invoiceNote && <Alert tone="ok">{invoiceNote}</Alert>}
          {crewWarnings.length > 0 && (
            <Alert tone="warn">
              <div className="space-y-0.5">
                {crewWarnings.map((w) => <div key={`${w.type}-${w.user_id}-${w.job_id || ''}`}>{w.message}</div>)}
              </div>
            </Alert>
          )}

          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <StatusBadge status={job.status} />
              <JobPriorityControl
                priority={job.priority}
                saving={savingPriority}
                editing={editingPriority}
                onEdit={() => setEditingPriority(true)}
                onCancel={() => { if (!savingPriority) setEditingPriority(false); }}
                onChange={savePriority}
              />
              {when ? (
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200/80 hover:bg-slate-50"
                  aria-label="Show crew dates"
                  onClick={() => crewPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                >
                  <CalendarDays size={12} className="text-slate-400" />
                  {when}
                </button>
              ) : null}
            </div>
            {canUnscheduleJob(job.status) ? (
              <HoverTooltip text="Unschedule this job">
                <button
                  type="button"
                  onClick={unschedule}
                  disabled={!!savingStatus}
                  aria-label="Unschedule this job"
                  className="btn-secondary !py-1.5 !px-3 text-xs shrink-0"
                >
                  {savingStatus === 'UNSCHEDULE' ? (
                    'Unscheduling…'
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <CalendarOff size={12} />
                      Unschedule
                    </span>
                  )}
                </button>
              </HoverTooltip>
            ) : null}
          </div>
          {job.description && <p className="text-sm leading-relaxed text-slate-600">{job.description}</p>}

          <div className="grid gap-4 md:grid-cols-2 md:items-stretch">
            <Panel
              icon={MapPin}
              title="Site, phone & email"
              className="h-full"
              actions={(job.sites?.length || job.phones?.length || job.emails?.length) ? (
                <button onClick={saveContacts} disabled={savingContacts} className="btn-secondary !py-1.5 !px-3 text-xs">
                  {savingContacts ? 'Saving…' : 'Save contacts'}
                </button>
              ) : null}
            >
              <ContactPickers
                customer={{
                  id: job.customer_id,
                  sites: job.sites,
                  phones: job.phones,
                  emails: job.emails,
                }}
                value={contacts}
                onChange={setContacts}
                idPrefix="job-contact"
                onError={setError}
                stackPhoneEmail
              />
            </Panel>

            <Panel
              icon={Check}
              title="Status"
              hint="Status can skip ahead but cannot go back."
              className="h-full"
            >
              <JobStatusSteps current={job.status} saving={savingStatus} onSelect={setStatus} />
            </Panel>
          </div>

          <Panel
            icon={Wrench}
            title="Required skills"
            actions={(
              <button type="button" onClick={saveSkills} disabled={savingSkills} className="btn-secondary !py-1.5 !px-3 text-xs">
                {savingSkills ? 'Saving…' : 'Save skills'}
              </button>
            )}
          >
            <div className="flex flex-wrap gap-1.5">
              {SKILL_OPTIONS.map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => toggleSkill(s)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    skills.includes(s)
                      ? 'bg-navy-900 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {skillLabel(s)}
                </button>
              ))}
            </div>
            <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl bg-slate-50 px-3.5 py-3 text-sm text-slate-700 ring-1 ring-slate-200/70">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 accent-brand-500"
                checked={needsDriver}
                disabled={savingDriver}
                onChange={(e) => saveDriver(e.target.checked)}
              />
              Needs a driver
            </label>
          </Panel>

          <div ref={crewPanelRef} id="job-crew-assigned">
          <Panel icon={Users} title="Crew assigned">
            <div className="mb-3 flex flex-wrap items-end gap-2">
              <div className="w-[11.75rem] shrink-0">
                <label className="label" htmlFor="job-start-date">Start date</label>
                <DatePicker
                  id="job-start-date"
                  label="Start date"
                  value={job.start_date || ''}
                  min={localIsoDate()}
                  max={job.end_date || undefined}
                  onChange={(iso) => {
                    if (savingDates) return;
                    if ((iso || '') === (job.start_date || '')) return;
                    if (iso && iso < localIsoDate()) return;
                    saveDates({ start_date: iso || null });
                  }}
                  disabled={savingDates}
                  allowClear
                  placeholder="Not set"
                  size="sm"
                />
              </div>
              <div className="w-[11.75rem] shrink-0">
                <label className="label" htmlFor="job-end-date">End date</label>
                <DatePicker
                  id="job-end-date"
                  label="End date"
                  value={job.end_date || ''}
                  min={job.start_date || undefined}
                  onChange={(iso) => {
                    if (savingDates) return;
                    if ((iso || '') === (job.end_date || '')) return;
                    saveDates({ end_date: iso || null });
                  }}
                  disabled={savingDates}
                  allowClear
                  placeholder="Not set"
                  size="sm"
                />
              </div>
              {job.start_date
                ? datesInRange(job.start_date, job.end_date || job.start_date).map((iso) => (
                  <button
                    type="button"
                    key={iso}
                    onClick={() => { setCrewDay(iso); setCrew(crewIdsForDate(job, iso)); }}
                    className={`mb-px rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      crewDay === iso ? 'bg-navy-900 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                    aria-label={`Crew for ${iso}`}
                  >
                    {fmtDate(iso)}
                  </button>
                ))
                : null}
            </div>
            {!(job.start_date) ? (
              <p className="text-xs text-slate-400">Set a start date before assigning crew.</p>
            ) : (
              <>
                <p className="mb-3 text-xs text-slate-400">
                  Crew for {crewDay ? fmtDate(crewDay) : 'this day'} only. Holiday and booked chips still save
                  {jobDays.length > 1 ? ', and conflicts are checked on every day of this job' : ''}.
                  {jobDatesForCrewDay(job, crewDay)
                    ? ` Saving crew will update the job to ${crewDay ? fmtDate(crewDay) : 'this day'}.`
                    : ''}
                </p>
                <CrewChips
                  staff={staff}
                  selectedIds={crew}
                  onToggle={toggleCrew}
                  holidays={dayHolidays}
                  bookings={dayBookings}
                  workDate={crewDay}
                  workDates={jobDays}
                  excludeJobId={job.id}
                  requiredSkills={skills}
                  disabled={savingCrew}
                />
                <CrewFitNotes
                  missingSkills={missingRequiredSkills(staff, crew, skills)}
                  needsDriver={needsDriver}
                  hasDriver={crewHasDriver(staff, crew)}
                />
                <CrewConflictNotes
                  staff={staff}
                  selectedIds={crew}
                  holidays={dayHolidays}
                  bookings={dayBookings}
                  workDate={crewDay}
                  workDates={jobDays}
                  excludeJobId={job.id}
                />
                <button
                  type="button"
                  onClick={saveCrew}
                  disabled={!crewDay || savingCrew}
                  aria-busy={savingCrew || undefined}
                  className="btn-secondary !py-1.5 !px-3 text-xs mt-3"
                >
                  {savingCrew ? (
                    <><Loader2 size={12} className="animate-spin" /> Saving…</>
                  ) : 'Save crew'}
                </button>
              </>
            )}
          </Panel>
          </div>

          <Panel>
            <JobKit
              jobId={jobId}
              apiBase="/jobs"
              materialLines={job.material_lines || []}
              checklistItems={job.checklist_items || []}
              materialsNote={job.materials}
              checklistTemplate={job.checklist_template}
              allowTemplates
              onChanged={() => { onChanged(); load(); }}
              onError={(msg) => setError(msg)}
            />
          </Panel>

          <Panel>
            <JobFiles
              jobId={jobId}
              apiBase="/jobs"
              files={job.files || []}
              notes={job.notes}
              onChanged={() => { onChanged(); load(); }}
              onError={(msg) => setError(msg)}
            />
          </Panel>

          <div className="grid gap-4 md:grid-cols-2 md:items-stretch">
            <Panel className="h-full">
              <JobVariations
                jobId={jobId}
                lines={job.variations || []}
                onChanged={() => { onChanged(); load(); }}
                onError={(msg) => setError(msg)}
              />
            </Panel>

            <Panel icon={Receipt} title="Invoice" className="h-full">
              <JobInvoiceCard
                invoiceId={job.invoice_id}
                invoiceRef={job.invoice_ref}
                saving={savingInvoice}
                onCreate={createInvoice}
              />
            </Panel>
          </div>

          <Panel icon={MessageSquare} title="Job chat">
            <div className="mb-3 max-h-44 space-y-2 overflow-y-auto">
              {messages.length === 0 && <p className="text-xs text-slate-400">No messages yet.</p>}
              {messages.map((m) => (
                <div key={m.id} className="rounded-xl bg-slate-50 px-3.5 py-2 text-sm ring-1 ring-slate-100">
                  <span className="font-medium text-slate-800">{m.user_name}: </span>
                  <span className="text-slate-600">{m.body}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="input flex-1 !py-2 text-sm"
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                placeholder="Message the crew…"
                onKeyDown={(e) => e.key === 'Enter' && sendMsg()}
              />
              <button onClick={sendMsg} className="btn-primary !px-3.5">
                <Send size={15} />
                Send
              </button>
            </div>
          </Panel>
        </div>
      )}
    </Modal>
    <CrewConflictModal
      open={crewConflicts.length > 0}
      conflicts={crewConflicts}
      dateLabel={jobDays.length > 1
        ? `${fmtDate(jobDays[0])} – ${fmtDate(jobDays[jobDays.length - 1])}`
        : (crewDay ? fmtDate(crewDay) : '')}
      saving={savingCrew}
      onCancel={() => { if (!savingCrew) setCrewConflicts([]); }}
      onConfirm={() => writeCrew(true)}
    />
    </>
  );
}
