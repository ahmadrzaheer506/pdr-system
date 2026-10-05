import React, { useState } from 'react';
import { StickyNote, Trash2 } from 'lucide-react';
import { api, fmtDateTime } from '../lib/api';
import ScrollableLeadList from './ScrollableLeadList.jsx';

/**
 * Dated internal notes on the customer record (requirement 2.4).
 * Separate from Conversation; never sent as WhatsApp or email.
 */
export default function CustomerInternalNotes({ customer, notes, onChanged, onError }) {
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!body.trim()) return;
    setSaving(true);
    try {
      await api.post(`/customers/${customer.id}/notes`, { body: body.trim() });
      setBody('');
      onChanged();
    } catch (err) {
      onError(err.message || 'Could not save the note');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (noteId) => {
    try {
      await api.del(`/customers/${customer.id}/notes/${noteId}`);
      onChanged();
    } catch (err) {
      onError(err.message || 'Could not delete the note');
    }
  };

  return (
    <div className="card p-5">
      <h3 id="internal-notes-heading" className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
        <StickyNote size={16} /> Internal notes
      </h3>
      <p className="text-xs text-slate-400 mb-3">Office only — never sent to the customer.</p>
      {customer.notes ? (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-sm text-slate-700 whitespace-pre-wrap">
          {customer.notes}
        </div>
      ) : null}
      {(!notes || notes.length === 0) && !customer.notes && (
        <p className="text-sm text-slate-400 mb-3">No internal notes yet.</p>
      )}
      {notes?.length > 0 && (
        <ScrollableLeadList
          labelledBy="internal-notes-heading"
          count={notes.length}
          limit={4}
          fallbackClass="max-h-[18rem]"
          className="mb-3"
        >
          {notes.map((n) => (
            <div key={n.id} role="listitem" className="border border-slate-100 rounded-lg px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-slate-800 whitespace-pre-wrap flex-1">{n.body}</p>
                <button type="button" className="text-slate-400 hover:text-rose-600" onClick={() => remove(n.id)} aria-label="Delete note">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {n.user_name ? `${n.user_name} · ` : ''}{fmtDateTime(n.created_at)}
              </div>
            </div>
          ))}
        </ScrollableLeadList>
      )}
      <div className="flex gap-2">
        <textarea
          className="input flex-1 !py-2"
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add an internal note…"
          aria-label="Internal note"
        />
        <button type="button" onClick={add} disabled={saving || !body.trim()} className="btn-primary self-end">
          {saving ? 'Saving…' : 'Add'}
        </button>
      </div>
    </div>
  );
}
