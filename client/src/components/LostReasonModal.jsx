import React, { useEffect, useState } from 'react';
import { Modal } from './ui.jsx';
import { LOST_REASONS } from '../lib/lostReasons';
import SelectMenu from './SelectMenu.jsx';

/**
 * Required reason when moving a customer to Lost (requirement 2.6).
 * Other allows an optional note; the other three reasons are the pick-list only.
 */
export default function LostReasonModal({ open, onClose, onConfirm, saving }) {
  const [code, setCode] = useState('cheaper_quote');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      setCode('cheaper_quote');
      setNote('');
    }
  }, [open]);

  const submit = (e) => {
    e.preventDefault();
    onConfirm({ lost_reason_code: code, lost_reason_note: code === 'other' ? note.trim() : '' });
  };

  return (
    <Modal open={open} onClose={onClose} title="Why was this lost?">
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-slate-500">Pick a reason. This is stored on the customer record.</p>
        <div>
          <label className="label" htmlFor="lost-reason-code">Lost reason</label>
          <SelectMenu
            id="lost-reason-code"
            label="Lost reason"
            value={code}
            required
            onChange={setCode}
            options={LOST_REASONS}
          />
        </div>
        {code === 'other' && (
          <div>
            <label className="label" htmlFor="lost-reason-note">Note (optional)</label>
            <textarea
              id="lost-reason-note"
              className="input"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything useful for the next enquiry…"
            />
          </div>
        )}
        <div className="flex gap-2 justify-end">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Mark lost'}</button>
        </div>
      </form>
    </Modal>
  );
}
