import React, { useEffect } from 'react';
import { AlertTriangle, Briefcase, CalendarDays, CalendarOff, Loader2 } from 'lucide-react';
import { Avatar, Modal } from './ui.jsx';
import { shortUkDate } from '../lib/schedule';

function conflictKind(row) {
  return row?.type === 'holiday' ? 'Holiday' : 'Already booked';
}

function conflictText(row) {
  return row?.detail || row?.message || '';
}

function bookedJobTitle(row) {
  if (row?.job_title) return row.job_title;
  const fromDetail = String(row?.detail || '').match(/Already on [“"](.+)[”"]/);
  return fromDetail ? fromDetail[1] : '';
}

function busyLabel(confirmLabel) {
  return String(confirmLabel || '').toLowerCase().includes('schedule') ? 'Scheduling…' : 'Assigning…';
}

/**
 * Confirm assigning people who are on holiday or already booked.
 */
export default function CrewConflictModal({
  open,
  conflicts = [],
  dateLabel = '',
  confirmLabel = 'Assign anyway',
  saving = false,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onEsc = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (!saving) onCancel?.();
    };
    document.addEventListener('keydown', onEsc, true);
    return () => document.removeEventListener('keydown', onEsc, true);
  }, [open, onCancel, saving]);

  const close = () => {
    if (!saving) onCancel?.();
  };

  const count = conflicts.length;
  const peopleLabel = count === 1 ? 'This person is not free' : 'These people are not free';

  return (
    <Modal
      open={open}
      onClose={close}
      zClass="z-[130]"
      size="xl"
      title="Assign with conflicts?"
      subtitle={`${peopleLabel}. Assign anyway, or cancel to leave the crew as it is.`}
      footer={(
        <>
          <button type="button" onClick={close} disabled={saving} className="btn-secondary">Cancel</button>
          <button
            type="button"
            onClick={() => { if (!saving) onConfirm?.(); }}
            disabled={saving}
            aria-busy={saving || undefined}
            className="btn-primary"
          >
            {saving ? (
              <><Loader2 size={14} className="animate-spin" /> {busyLabel(confirmLabel)}</>
            ) : confirmLabel}
          </button>
        </>
      )}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200/80">
            <AlertTriangle size={12} />
            {count} {count === 1 ? 'conflict' : 'conflicts'}
          </span>
          {dateLabel ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
              <CalendarDays size={12} className="text-slate-400" />
              {dateLabel}
            </span>
          ) : null}
        </div>

        <ul className="space-y-2">
          {conflicts.map((row, i) => {
            const holiday = row.type === 'holiday';
            const jobTitle = bookedJobTitle(row);
            const name = row.name || `User ${row.user_id}`;
            const when = shortUkDate(row.work_date);
            return (
              <li
                key={`${row.type}-${row.user_id}-${row.work_date || ''}-${i}`}
                className={`flex items-start gap-3 rounded-2xl px-3.5 py-3 ring-1 ${
                  holiday
                    ? 'bg-amber-50/80 ring-amber-200/90'
                    : 'bg-sky-50/70 ring-sky-200/90'
                }`}
              >
                <Avatar name={name} size={9} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-semibold text-slate-900">{name}</span>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      holiday ? 'bg-amber-100 text-amber-900' : 'bg-sky-100 text-sky-900'
                    }`}>
                      {conflictKind(row)}
                    </span>
                    {when ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200/80">
                        <CalendarDays size={11} className="text-slate-400" />
                        {when}
                      </span>
                    ) : null}
                  </div>
                  {holiday ? (
                    <p className="mt-1.5 flex items-start gap-1.5 text-sm leading-snug text-slate-600">
                      <CalendarOff size={14} className="mt-0.5 shrink-0 text-amber-600" />
                      <span>{conflictText(row) || 'On approved holiday'}{when ? ` on ${when}` : ''}</span>
                    </p>
                  ) : jobTitle ? (
                    <p className="mt-1.5 flex items-start gap-1.5 text-sm leading-snug text-slate-600">
                      <Briefcase size={14} className="mt-0.5 shrink-0 text-sky-600" />
                      <span>
                        Already booked on{' '}
                        <span className="font-medium text-slate-800">“{jobTitle}”</span>
                        {when ? ` on ${when}` : ''}
                      </span>
                    </p>
                  ) : (
                    <p className="mt-1.5 text-sm leading-snug text-slate-600">
                      {conflictText(row)}{when && !String(conflictText(row)).includes(when) ? ` on ${when}` : ''}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
}
