import React, { useState } from 'react';
import { api } from '../lib/api';
import { Modal } from './ui.jsx';

export default function BookVisit({ open, onClose, customer, onSaved }) {
  const tomorrow = new Date(Date.now() + 86400000);
  const [date, setDate] = useState(tomorrow.toISOString().slice(0, 10));
  const [time, setTime] = useState('10:00');
  const [duration, setDuration] = useState(60);
  const [address, setAddress] = useState(customer?.address || '');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(() => { if (open) setAddress(customer?.address || ''); }, [open, customer]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const start = new Date(`${date}T${time}`);
      const end = new Date(start.getTime() + duration * 60000);
      await api.post('/appointments', {
        customer_id: customer.id,
        title: `Site visit — ${customer.name}`,
        start: start.toISOString(),
        end: end.toISOString(),
        address,
        notes,
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Book a site visit">
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Date</label><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></div>
          <div><label className="label">Time</label><input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} required /></div>
        </div>
        <div>
          <label className="label">Duration (minutes)</label>
          <select className="input" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
            {[30, 45, 60, 90, 120].map((d) => <option key={d} value={d}>{d} min</option>)}
          </select>
        </div>
        <div><label className="label">Address</label><input className="input" value={address} onChange={(e) => setAddress(e.target.value)} /></div>
        <div><label className="label">Notes</label><textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What needs looking at" /></div>
        <p className="text-xs text-slate-400">This will be added to Paul's Google Calendar automatically (or tracked in-app if not yet connected), with a reminder.</p>
        <button className="btn-primary w-full" disabled={saving}>{saving ? 'Booking…' : 'Book visit'}</button>
      </form>
    </Modal>
  );
}
