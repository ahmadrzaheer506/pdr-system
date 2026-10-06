import React, { useState } from 'react';
import { api } from '../lib/api';
import { Modal } from './ui.jsx';
import ContactPickers from './ContactPickers.jsx';
import { primaryOf } from '../lib/contacts';
import { VISIT_TYPES, visitTitle } from '../lib/visitTypes';
import { ROLES } from '../lib/roles';
import { assigneeRoleLabel } from '../lib/taskList.js';
import SelectMenu from './SelectMenu.jsx';
import MultiSelect from './MultiSelect.jsx';
import DatePicker from './DatePicker.jsx';

const DURATIONS = [30, 45, 60, 90, 120];

function defaultDate() {
  return new Date(Date.now() + 86400000).toISOString().slice(0, 10);
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function localDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return defaultDate();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function localTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '10:00';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function durationMinutes(start, end) {
  const ms = new Date(end) - new Date(start);
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms / 60000) : 60;
}

/**
 * Book or reschedule a visit (requirements 5.1 and 5.3).
 * Pass `customer` when already loaded, or `customerId` to fetch contacts first.
 * Pass `existing` to update a booked visit that has not ended.
 */
export default function BookVisit({ open, onClose, customer, customerId, leadId, lead, existing, onSaved }) {
  const [record, setRecord] = useState(customer || null);
  const [visitType, setVisitType] = useState(existing?.visit_type || 'site_visit');
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState('10:00');
  const [duration, setDuration] = useState(60);
  const [contacts, setContacts] = useState({ site_id: '', phone_id: '', email_id: '' });
  const [assigneeIds, setAssigneeIds] = useState([]);
  const [people, setPeople] = useState([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (!open) return undefined;
    setError('');
    setVisitType(existing?.visit_type || 'site_visit');
    if (existing?.start) {
      setDate(localDate(existing.start));
      setTime(localTime(existing.start));
      setDuration(durationMinutes(existing.start, existing.end));
      setNotes(existing.notes || '');
      const ids = (existing.assignee_ids || (existing.assignees || []).map((a) => a.id)).filter(Boolean);
      setAssigneeIds(ids.map(String));
    } else {
      setNotes('');
      setDate(defaultDate());
      setTime('10:00');
      setDuration(60);
      setAssigneeIds([]);
    }
    if (customer?.id) {
      setRecord(customer);
      setLoading(false);
      return undefined;
    }
    const id = customerId;
    if (!id) {
      setRecord(null);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    api.get(`/customers/${id}`)
      .then((data) => {
        if (!cancelled) setRecord(data.customer);
      })
      .catch((err) => {
        if (!cancelled) {
          setRecord(null);
          setError(err.message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, customer, customerId, existing]);

  React.useEffect(() => {
    if (!open) return;
    setContacts({
      site_id: existing?.site_id || lead?.site_id || lead?.meta?.site_id || primaryOf(record?.sites)?.id || '',
      phone_id: existing?.phone_id || lead?.phone_id || lead?.meta?.phone_id || primaryOf(record?.phones)?.id || '',
      email_id: existing?.email_id || lead?.email_id || lead?.meta?.email_id || primaryOf(record?.emails)?.id || '',
    });
  }, [open, record, existing, lead]);

  React.useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    api.get('/settings/users')
      .then((d) => {
        if (cancelled) return;
        setPeople((d.users || []).filter((u) => u && u.active !== false && (u.role === ROLES.OFFICE || u.role === ROLES.STAFF)));
      })
      .catch((err) => {
        if (!cancelled) {
          setPeople([]);
          setError(err.message);
        }
      });
    return () => { cancelled = true; };
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    if (!record?.id) return;
    if (!assigneeIds.length) {
      setError('Assign at least one office or field staff user');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const start = new Date(`${date}T${time}`);
      const end = new Date(start.getTime() + duration * 60000);
      const payload = {
        start: start.toISOString(),
        end: end.toISOString(),
        notes,
        visit_type: visitType,
        title: visitTitle(visitType, record.name),
        site_id: contacts.site_id || null,
        phone_id: contacts.phone_id || null,
        email_id: contacts.email_id || null,
        assignee_ids: assigneeIds.map(Number),
      };
      if (existing?.id) {
        await api.put(`/appointments/${existing.id}`, payload);
      } else {
        await api.post('/appointments', { customer_id: record.id, lead_id: leadId || null, ...payload });
      }
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const durationOptions = DURATIONS.includes(duration) ? DURATIONS : [...DURATIONS, duration].sort((a, b) => a - b);
  const editing = Boolean(existing?.id);

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Reschedule visit' : 'Book a site visit'}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
        {loading && <p className="text-sm text-slate-500">Loading customer…</p>}
        <div>
          <label className="label" htmlFor="visit-type">Visit type</label>
          <SelectMenu
            id="visit-type"
            label="Visit type"
            value={visitType}
            required
            onChange={setVisitType}
            options={VISIT_TYPES.map((t) => ({ value: t.value, label: t.label }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="visit-date">Date</label>
            <DatePicker
              id="visit-date"
              label="Date"
              value={date}
              required
              onChange={setDate}
            />
          </div>
          <div><label className="label">Time</label><input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} required /></div>
        </div>
        <div>
          <label className="label">Duration (minutes)</label>
          <SelectMenu
            label="Duration (minutes)"
            value={duration}
            onChange={(next) => setDuration(Number(next))}
            options={durationOptions.map((d) => ({ value: d, label: `${d} min` }))}
          />
        </div>
        <ContactPickers
          customer={record}
          value={contacts}
          onChange={setContacts}
          idPrefix="visit-contact"
          onError={setError}
        />
        <div>
          <label className="label" htmlFor="visit-assignees">Assigned to</label>
          <MultiSelect
            id="visit-assignees"
            label="Assigned to"
            values={assigneeIds}
            onChange={setAssigneeIds}
            options={people.map((u) => ({
              value: String(u.id),
              label: u.name,
              hint: assigneeRoleLabel(u.role),
            }))}
            placeholder="Office and field staff"
            required
          />
        </div>
        <div><label className="label">Notes</label><textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What needs looking at" /></div>
        <p className="text-xs text-slate-400">Goes on your Google Calendar if you have connected it in Settings; otherwise the visit is tracked in-app.</p>
        <button className="btn-primary w-full" disabled={saving || loading || !record?.id || !assigneeIds.length}>
          {saving ? (editing ? 'Saving…' : 'Booking…') : (editing ? 'Save visit' : 'Book visit')}
        </button>
      </form>
    </Modal>
  );
}
