import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Modal } from './ui.jsx';

/**
 * Tick box to mark a booked site visit complete (office lead card and staff visit page).
 */
export default function VisitCompleteTick({ done, saving, onComplete, large = false }) {
  if (done) {
    return (
      <div
        className={`inline-flex items-center gap-2 font-medium text-emerald-700 ${large ? 'text-base' : 'text-sm'}`}
      >
        <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-emerald-600 bg-emerald-600 text-white">
          <Check size={14} strokeWidth={3} />
        </span>
        Visit completed
      </div>
    );
  }

  return (
    <label className={`inline-flex cursor-pointer select-none items-center gap-2 font-medium text-slate-800 ${large ? 'text-base' : 'text-sm'} ${saving ? 'opacity-60' : ''}`}>
      <input
        type="checkbox"
        className="h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
        checked={false}
        disabled={saving}
        onChange={() => onComplete()}
        aria-label="Visit completed"
      />
      {saving ? 'Saving…' : 'Visit completed'}
    </label>
  );
}

export function VisitCompleteRemarks({ note, className = 'text-sm text-slate-600' }) {
  if (!note) return null;
  return (
    <p className={className}>
      <span className="font-medium text-slate-500">Remarks: </span>
      {note}
    </p>
  );
}

/**
 * Optional completion remarks before marking a site visit done.
 */
export function VisitCompleteModal({ visit, open, saving, onClose, onConfirm }) {
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) setNote('');
  }, [open]);

  const submit = (e) => {
    e.preventDefault();
    onConfirm(note.trim());
  };

  const title = visit?.customer_name || visit?.title || 'this visit';

  return (
    <Modal open={open} onClose={() => !saving && onClose()} title="Complete visit">
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-slate-500">
          Mark the site visit for {title} as completed. Add remarks if anything is worth recording.
        </p>
        <div>
          <label className="label" htmlFor="complete-visit-note">Completion remarks (optional)</label>
          <textarea
            id="complete-visit-note"
            className="input"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What was found on site"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button type="button" className="btn-secondary" disabled={saving} onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Complete visit'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
