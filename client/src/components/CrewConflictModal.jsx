import React, { useEffect } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Modal } from './ui.jsx';

function conflictKind(row) {
  return row?.type === 'holiday' ? 'Holiday' : 'Already booked';
}

function conflictText(row) {
  return row?.detail || row?.message || '';
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

  return (
    <Modal
      open={open}
      onClose={close}
      zClass="z-[130]"
      size="xl"
      title="Assign with conflicts?"
      subtitle={dateLabel
        ? `These people are not free on ${dateLabel}. Confirm to assign them anyway, or cancel to leave the crew as it is.`
        : 'These people are not free. Confirm to assign them anyway, or cancel to leave the crew as it is.'}
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
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
          <AlertTriangle size={18} />
        </div>
        <ul className="min-w-0 flex-1 space-y-2">
          {conflicts.map((row, i) => (
            <li
              key={`${row.type}-${row.user_id}-${i}`}
              className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200/80"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-900">{row.name || `User ${row.user_id}`}</div>
                <div className="mt-0.5 truncate text-xs text-slate-500">{conflictText(row)}</div>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                row.type === 'holiday' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'
              }`}>
                {conflictKind(row)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
