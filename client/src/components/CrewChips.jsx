import React from 'react';
import { Check } from 'lucide-react';
import { Avatar, HoverTooltip } from './ui.jsx';
import { staffDayFlags, crewConflictLabel, crewSaveConflicts, crewConflictSummaryLine, crewChipHoverHint } from '../lib/schedule';
import { staffMatchesRequiredSkills, skillLabel } from '../lib/skills';

function chipClass({ selected, onHoliday, busy, matches }) {
  if (onHoliday || busy) {
    return selected
      ? 'border-amber-400 bg-amber-50 text-amber-900 ring-1 ring-amber-200'
      : 'border-amber-300 bg-amber-50 text-amber-800';
  }
  if (selected) return 'border-brand-400 bg-brand-50 text-brand-700';
  if (matches) return 'border-emerald-300 bg-emerald-50 text-emerald-800';
  return 'border-slate-200 text-slate-500';
}

export function CrewFitNotes({ missingSkills = [], needsDriver = false, hasDriver = false }) {
  const lines = [];
  if (missingSkills.length) lines.push(`Nobody covering: ${missingSkills.map(skillLabel).join(', ')}`);
  if (needsDriver && !hasDriver) lines.push('Needs a driver — nobody assigned can drive');
  if (!lines.length) return null;
  return (
    <div className="text-[11px] text-amber-700 mt-1.5 space-y-0.5">
      {lines.map((line) => <div key={line}>{line}</div>)}
    </div>
  );
}

/**
 * Named holiday / already-booked warnings for the crew currently assigned
 * to this work date (same overlay as the calendar “Already booked” flag).
 */
export function CrewConflictNotes({
  staff = [],
  selectedIds = [],
  holidays = [],
  bookings = [],
  workDate,
  workDates,
  excludeJobId,
}) {
  const dates = Array.isArray(workDates) && workDates.length ? workDates : undefined;
  const rows = crewSaveConflicts({
    staff, selectedIds, holidays, bookings, iso: workDate, dates, excludeJobId,
  });
  if (!rows.length) return null;
  const booked = rows.some((row) => row.type !== 'holiday');
  const onHoliday = rows.some((row) => row.type === 'holiday');
  const multi = (dates && dates.length > 1) || rows.some((row) => row.work_date);
  const heading = booked && onHoliday
    ? (multi ? 'These people are not free on some days of this job' : 'These people are not free this day')
    : onHoliday
      ? (multi ? 'These people are on holiday on some days of this job' : 'These people are on holiday this day')
      : (multi ? 'These people are already booked on some days of this job' : 'These people are already booked');
  return (
    <div
      role="status"
      className="mt-2 rounded-xl bg-amber-50 px-3 py-2.5 ring-1 ring-amber-200"
    >
      <p className="text-xs font-semibold leading-snug text-amber-950">
        {heading}. You can still assign them.
      </p>
      <ul className="mt-1.5 space-y-1 text-xs leading-snug text-amber-900">
        {rows.map((row) => (
          <li key={`${row.type}-${row.user_id}-${row.job_id || row.detail}-${row.work_date || ''}`}>
            {crewConflictSummaryLine(row)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Staff chips for one work date (requirement 8.2 / 8.3). Holiday, other-job,
 * skill, and driver overlays are visual only — selection is never blocked.
 */
export default function CrewChips({
  staff = [],
  selectedIds = [],
  onToggle,
  holidays = [],
  bookings = [],
  workDate,
  workDates,
  excludeJobId,
  requiredSkills = [],
  disabled = false,
}) {
  const days = Array.isArray(workDates) && workDates.length ? workDates : [workDate];
  return (
    <div className="flex flex-wrap gap-2">
      {staff.map((s) => {
        const selected = selectedIds.some((id) => Number(id) === Number(s.id));
        const matches = staffMatchesRequiredSkills(s.skills, requiredSkills);
        const flags = days.map((iso) => ({
          iso,
          ...staffDayFlags({ holidays, bookings, userId: s.id, iso, excludeJobId }),
        }));
        const onHoliday = flags.some((row) => row.onHoliday);
        const holidayDate = flags.find((row) => row.onHoliday)?.iso;
        const busyOn = flags.flatMap((row) => row.busyOn);
        const conflict = crewConflictLabel({ onHoliday, busyOn });
        const hint = crewChipHoverHint({
          name: s.name, onHoliday, busyOn, workDate, holidayDate,
        });
        let label = s.name;
        if (matches) label += ' matches required skills';
        if (s.is_driver) label += ' driver';
        if (onHoliday) label += ' on holiday';
        else if (busyOn.length) label += ` already on ${busyOn[0].job_title}`;
        const chip = (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onToggle?.(s.id)}
            aria-label={label}
            aria-pressed={selected}
            className={`flex items-center gap-1.5 rounded-full pl-1 pr-3 py-1 text-xs font-medium border ${chipClass({
              selected, onHoliday, busy: busyOn.length > 0, matches,
            })} ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <Avatar name={s.name} color={s.color} size={5} /> {s.name.split(' ')[0]}
            {matches && <span className="text-[10px] uppercase tracking-wide">match</span>}
            {s.is_driver && <span className="text-[10px] uppercase tracking-wide">driver</span>}
            {conflict && <span className="text-[10px] uppercase tracking-wide">{conflict}</span>}
            {selected ? (
              <span
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white"
                aria-hidden="true"
              >
                <Check size={10} strokeWidth={3} />
              </span>
            ) : null}
          </button>
        );
        return (
          <HoverTooltip key={s.id} text={hint}>
            {chip}
          </HoverTooltip>
        );
      })}
    </div>
  );
}
