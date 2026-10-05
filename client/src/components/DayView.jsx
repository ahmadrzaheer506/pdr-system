import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import CrewChips, { CrewFitNotes, CrewConflictNotes } from './CrewChips.jsx';
import {
  addIsoDays, jobOnDate, parseIsoDate, crewIdsForDate,
  holidaysOnDate, bookingsFromJobs, crewSaveConflicts,
} from '../lib/schedule';
import { missingRequiredSkills, crewHasDriver } from '../lib/skills';
import CrewConflictModal from './CrewConflictModal.jsx';

function heading(iso) {
  const [year, month, day] = parseIsoDate(iso).split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
}

function DayJobCard({ job, dateIso, staff, holidays, bookings, onJobClick, onCrewAssigned, onCrewError, saving, onSaving }) {
  const serverIds = crewIdsForDate(job, dateIso);
  const [selectedIds, setSelectedIds] = useState(serverIds);
  const selectedRef = useRef(serverIds);
  const serverKey = serverIds.join(',');
  const [conflicts, setConflicts] = useState([]);
  const [pendingIds, setPendingIds] = useState(null);

  useEffect(() => {
    selectedRef.current = serverIds;
    setSelectedIds(serverIds);
  }, [job.id, dateIso, serverKey]);

  const writeCrew = async (userIds, confirmConflicts = false) => {
    onSaving(job.id);
    try {
      const result = await api.put(`/jobs/${job.id}/assignments`, {
        work_date: dateIso,
        user_ids: userIds,
        ...(confirmConflicts ? { confirm_conflicts: true } : {}),
      });
      selectedRef.current = userIds;
      setSelectedIds(userIds);
      setConflicts([]);
      setPendingIds(null);
      onCrewAssigned?.(result);
    } catch (err) {
      if (err.status === 409 && err.data?.needs_confirm) {
        setPendingIds(userIds);
        setConflicts(err.data.conflicts || []);
        return;
      }
      selectedRef.current = crewIdsForDate(job, dateIso);
      setSelectedIds(selectedRef.current);
      onCrewError?.(err.message);
    } finally {
      onSaving(null);
    }
  };

  const toggle = async (uid) => {
    const current = selectedRef.current;
    const next = current.includes(uid) ? current.filter((id) => id !== uid) : [...current, uid];
    const added = !current.includes(uid);
    const nextConflicts = added
      ? crewSaveConflicts({
        staff, selectedIds: [uid], holidays, bookings, iso: dateIso, excludeJobId: job.id,
      })
      : [];
    if (nextConflicts.length) {
      setPendingIds(next);
      setConflicts(nextConflicts);
      return;
    }
    await writeCrew(next, false);
  };

  return (
    <div className="bg-slate-100 rounded-md px-2 py-2">
      <button
        type="button"
        onClick={() => onJobClick(job.id)}
        className="block w-full text-left hover:bg-slate-200 rounded px-1 py-1 -mx-1"
      >
        <div className="text-sm font-medium text-slate-800 truncate">{job.title}</div>
        <div className="text-[11px] text-slate-500 truncate">{job.customer_name}</div>
      </button>
      <div className="mt-2">
        <p className="text-[10px] text-slate-400 mb-1">Crew this day</p>
        <CrewChips
          staff={staff}
          selectedIds={selectedIds}
          onToggle={toggle}
          holidays={holidays}
          bookings={bookings}
          workDate={dateIso}
          excludeJobId={job.id}
          requiredSkills={job.required_skills || []}
          disabled={saving === job.id}
        />
        <CrewFitNotes
          missingSkills={missingRequiredSkills(staff, selectedIds, job.required_skills)}
          needsDriver={!!job.needs_driver}
          hasDriver={crewHasDriver(staff, selectedIds)}
        />
        <CrewConflictNotes
          staff={staff}
          selectedIds={selectedIds}
          holidays={holidays}
          bookings={bookings}
          workDate={dateIso}
          excludeJobId={job.id}
        />
      </div>
      <CrewConflictModal
        open={conflicts.length > 0}
        conflicts={conflicts}
        onCancel={() => { if (saving !== job.id) { setConflicts([]); setPendingIds(null); } }}
        onConfirm={() => writeCrew(pendingIds || selectedIds, true)}
        saving={saving === job.id}
      />
    </div>
  );
}

/**
 * Single-day board (requirement 8.1 / 8.2). Same jobs as week view, with crew picking for this date.
 */
export default function DayView({
  dateIso, jobs, holidays, staff = [], onJobClick, onDateChange, onBackToWeek,
  onCrewAssigned, onCrewError,
}) {
  const [saving, setSaving] = useState(null);
  const dayJobs = (jobs || []).filter((j) => jobOnDate(j, dateIso));
  const dayHolidays = holidaysOnDate(holidays, dateIso);
  const dayBookings = bookingsFromJobs(jobs, dateIso);

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <button type="button" onClick={onBackToWeek} className="btn-ghost !py-1 !px-2.5 text-xs">Week view</button>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => onDateChange(addIsoDays(dateIso, -1))} className="btn-ghost !p-1.5" aria-label="Previous day">
            <ChevronLeft size={16} />
          </button>
          <div className="text-sm font-semibold text-slate-800 min-w-[10rem] text-center">{heading(dateIso)}</div>
          <button type="button" onClick={() => onDateChange(addIsoDays(dateIso, 1))} className="btn-ghost !p-1.5" aria-label="Next day">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-3 min-h-[6rem]">
        <div
          role="region"
          aria-label={`Jobs on ${heading(dateIso)}`}
          className="space-y-2 overflow-y-auto max-h-[32rem] overscroll-contain pr-0.5"
        >
          {dayJobs.map((j) => (
            <DayJobCard
              key={j.id}
              job={j}
              dateIso={dateIso}
              staff={staff}
              holidays={holidays}
              bookings={dayBookings}
              onJobClick={onJobClick}
              onCrewAssigned={onCrewAssigned}
              onCrewError={onCrewError}
              saving={saving}
              onSaving={setSaving}
            />
          ))}
          {dayHolidays.map((h) => (
            <div key={h.id} className="text-[10px] bg-amber-50 text-amber-700 rounded px-2 py-1">🏖 {(h.user_name || '').split(' ')[0]} off</div>
          ))}
          {dayJobs.length === 0 && dayHolidays.length === 0 && <div className="text-sm text-slate-300 text-center py-4">No jobs this day</div>}
        </div>
      </div>
    </div>
  );
}
