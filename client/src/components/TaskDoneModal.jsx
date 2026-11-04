import React, { useEffect, useState } from 'react';
import { Modal } from './ui.jsx';

/**
 * Confirm marking a task done, with optional completion remarks (same pattern as visits).
 */
export default function TaskDoneModal({ task, open, saving, onClose, onConfirm }) {
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) setNote('');
  }, [open]);

  const submit = (e) => {
    e.preventDefault();
    onConfirm(note.trim());
  };

  return (
    <Modal open={open} onClose={() => !saving && onClose()} title="Mark task done">
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-slate-600">
          Are you sure you want to mark “{task?.title}” as done? Add remarks if anything is worth recording.
        </p>
        <div>
          <label className="label" htmlFor="complete-task-note">Completion remarks (optional)</label>
          <textarea
            id="complete-task-note"
            className="input"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What was done - call outcome, next step…"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Mark done'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
