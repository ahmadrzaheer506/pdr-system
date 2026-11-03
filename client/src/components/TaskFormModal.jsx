import React, { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import { api } from '../lib/api';
import { Modal } from './ui.jsx';
import { localToday, assigneeRoleLabel } from '../lib/taskList.js';
import { ROLES } from '../lib/roles';
import SelectMenu from './SelectMenu.jsx';
import MultiSelect from './MultiSelect.jsx';
import SearchSelect from './SearchSelect.jsx';
import DatePicker from './DatePicker.jsx';

function isAssignableUser(u) {
  return u && u.active !== false && (u.role === ROLES.OFFICE || u.role === ROLES.STAFF);
}

function canAttachLead(task) {
  if (!task) return true;
  return task.type === 'manual' || !task.entity_type || task.entity_type === 'customer' || task.entity_type === 'lead';
}

function leadOptionLabel(c) {
  if (!c) return '';
  return c.company_name ? `${c.name} · ${c.company_name}` : c.name;
}

function leadOptionHint(c) {
  if (!c) return '';
  const bits = [c.address, c.postcode, c.phone, c.email].filter(Boolean);
  if (bits.length) return bits.join(' · ');
  return c.id ? `Lead #${c.id}` : '';
}

function leadInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'L';
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

export default function TaskFormModal({ open, task, onClose, onSaved, onError, lockedCustomer = null }) {
  const editing = Boolean(task);
  const leadRequired = canAttachLead(task);
  const leadLocked = Boolean(lockedCustomer?.id);
  const [form, setForm] = useState({
    title: '',
    detail: '',
    due_date: localToday(),
    priority: 'normal',
    lead_id: '',
    assignee_ids: [],
  });
  const [leadQuery, setLeadQuery] = useState('');
  const [leads, setLeads] = useState([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [people, setPeople] = useState([]);
  const [saving, setSaving] = useState(false);
  const [changingLead, setChangingLead] = useState(true);

  useEffect(() => {
    if (!open) return;
    if (task) {
      const ids = (task.assignees || []).map((a) => String(a.id));
      const fallback = task.assignee_ids ? task.assignee_ids.map(String) : [];
      setForm({
        title: task.title || '',
        detail: task.detail || '',
        due_date: task.due_date ? String(task.due_date).slice(0, 10) : '',
        priority: task.priority || 'normal',
        lead_id: task.lead_id ? String(task.lead_id) : (lockedCustomer?.id ? String(lockedCustomer.id) : ''),
        assignee_ids: ids.length ? ids : fallback,
      });
      setLeadQuery(task.lead_name || lockedCustomer?.name || '');
      setChangingLead(!task.lead_id && !leadLocked);
    } else {
      setForm({
        title: '',
        detail: '',
        due_date: localToday(),
        priority: 'normal',
        lead_id: lockedCustomer?.id ? String(lockedCustomer.id) : '',
        assignee_ids: [],
      });
      setLeadQuery(lockedCustomer?.name || '');
      setChangingLead(!leadLocked);
    }
  }, [open, task, lockedCustomer, leadLocked]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    api.get('/settings/users')
      .then((d) => {
        if (!cancelled) setPeople((d.users || []).filter(isAssignableUser));
      })
      .catch((err) => {
        if (!cancelled) {
          setPeople([]);
          onError(err.message);
        }
      });
    return () => { cancelled = true; };
  }, [open, onError]);

  useEffect(() => {
    if (!open || leadLocked) return undefined;
    let cancelled = false;
    const q = leadQuery.trim();
    const timer = setTimeout(() => {
      setLoadingLeads(true);
      const path = q ? `/customers?q=${encodeURIComponent(q)}` : '/customers';
      api.get(path)
        .then((d) => {
          if (!cancelled) setLeads(d.customers || []);
        })
        .catch((err) => {
          if (!cancelled) {
            setLeads([]);
            onError(err.message);
          }
        })
        .finally(() => {
          if (!cancelled) setLoadingLeads(false);
        });
    }, q ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, leadQuery, onError, leadLocked]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    if (leadRequired && !form.lead_id && !lockedCustomer?.enquiryId) {
      onError('Pick a lead');
      return;
    }
    if (!form.assignee_ids.length) {
      onError('Assign at least one office or field staff user');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        detail: form.detail || null,
        due_date: form.due_date || null,
        priority: form.priority,
        assignee_ids: form.assignee_ids.map(Number),
      };
      if (lockedCustomer?.enquiryId) payload.enquiry_id = Number(lockedCustomer.enquiryId);
      else if (leadRequired) payload.lead_id = Number(form.lead_id);
      if (editing) await api.put(`/tasks/${task.id}`, payload);
      else await api.post('/tasks', payload);
      onSaved(editing);
    } catch (err) {
      onError(err.message || 'Could not save task');
    } finally {
      setSaving(false);
    }
  };

  const leadOptions = (() => {
    const mapped = leads.map((c) => ({
      value: String(c.id),
      label: leadOptionLabel(c),
      hint: leadOptionHint(c),
    }));
    const q = leadQuery.trim().toLowerCase();
    const narrowed = q
      ? mapped.filter((o) => (
        o.label.toLowerCase().includes(q) || (o.hint && o.hint.toLowerCase().includes(q))
      ))
      : mapped.slice(0, 8);
    if (form.lead_id && !narrowed.some((o) => o.value === form.lead_id)) {
      const selected = leads.find((c) => String(c.id) === form.lead_id);
      narrowed.unshift({
        value: form.lead_id,
        label: selected ? leadOptionLabel(selected) : (task?.lead_name || leadQuery || 'Selected lead'),
        hint: selected ? leadOptionHint(selected) : '',
      });
    }
    return narrowed;
  })();

  const peopleOptions = (() => {
    const fromApi = people.map((u) => ({
      value: String(u.id),
      label: u.name,
      hint: assigneeRoleLabel(u.role),
    }));
    const seen = new Set(fromApi.map((o) => o.value));
    const extras = (task?.assignees || [])
      .filter((a) => a && !seen.has(String(a.id)))
      .map((a) => ({
        value: String(a.id),
        label: a.name,
        hint: assigneeRoleLabel(a.role),
      }));
    return extras.concat(fromApi);
  })();

  const selectedLead = leads.find((c) => String(c.id) === String(form.lead_id));
  const selectedLeadLabel = lockedCustomer?.label || lockedCustomer?.name
    || (selectedLead ? leadOptionLabel(selectedLead) : (form.lead_id ? (task?.lead_name || leadQuery || 'Selected lead') : ''));
  const selectedLeadHint = lockedCustomer?.hint || (selectedLead ? leadOptionHint(selectedLead) : '');
  const showLeadCard = Boolean(form.lead_id || lockedCustomer?.enquiryId) && (!changingLead || leadLocked);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit task' : 'Add a task'}
      subtitle={leadLocked
        ? (editing ? 'Update the people and timing for this enquiry.' : 'This task stays on this enquiry.')
        : (editing ? 'Update the lead, people, and timing.' : 'Link this to a lead and assign office or field staff.')}
      size="2xl"
      footer={(
        <>
          <button type="button" className="btn-secondary" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="task-form" className="btn-primary min-w-[8.5rem]" disabled={saving}>
            {saving ? 'Saving…' : (editing ? 'Save changes' : 'Add task')}
          </button>
        </>
      )}
    >
      <form id="task-form" onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="task-title">Title</label>
          <input
            id="task-title"
            className="input rounded-xl"
            value={form.title}
            onChange={set('title')}
            placeholder="What needs doing?"
            required
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {leadRequired && (
            <div>
              <label className="label" htmlFor={showLeadCard ? undefined : 'task-lead'}>Lead</label>
              {showLeadCard ? (
                <div className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                    {leadInitials(selectedLeadLabel)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{selectedLeadLabel}</p>
                    {selectedLeadHint ? <p className="truncate text-[11px] text-slate-500">{selectedLeadHint}</p> : null}
                  </div>
                  {leadLocked ? null : (
                    <button
                      type="button"
                      aria-label="Change"
                      className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700"
                      onClick={() => setChangingLead(true)}
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                  <input tabIndex={-1} required={leadRequired && !lockedCustomer?.enquiryId} value={form.lead_id} readOnly className="sr-only" aria-hidden="true" />
                </div>
              ) : (
                <SearchSelect
                  id="task-lead"
                  label="Lead"
                  query={leadQuery}
                  onQueryChange={setLeadQuery}
                  options={leadOptions}
                  value={form.lead_id}
                  onChange={(lead_id) => {
                    setForm({ ...form, lead_id });
                    if (lead_id) setChangingLead(false);
                  }}
                  placeholder="Search by name or address"
                  loading={loadingLeads}
                  emptyText="No matching leads"
                  clearLabel="Clear lead"
                  required
                />
              )}
            </div>
          )}
          <div className={leadRequired ? '' : 'sm:col-span-2'}>
            <label className="label" htmlFor="task-assignees">Assigned to</label>
            <MultiSelect
              id="task-assignees"
              label="Assigned to"
              values={form.assignee_ids}
              onChange={(assignee_ids) => setForm({ ...form, assignee_ids })}
              options={peopleOptions}
              placeholder="Office and field staff"
              required
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Due date</label>
            <DatePicker
              label="Due date"
              value={form.due_date}
              min={localToday()}
              onChange={(due_date) => setForm({ ...form, due_date })}
            />
          </div>
          <div>
            <label className="label">Priority</label>
            <SelectMenu
              label="Priority"
              value={form.priority}
              onChange={(priority) => setForm({ ...form, priority })}
              options={[
                { value: 'low', label: 'Low' },
                { value: 'normal', label: 'Normal' },
                { value: 'high', label: 'High' },
              ]}
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="task-detail">Detail</label>
          <textarea
            id="task-detail"
            className="input min-h-[3.5rem] resize-y rounded-xl"
            rows={2}
            value={form.detail}
            onChange={set('detail')}
            placeholder="Optional notes for the people doing this task"
          />
        </div>
      </form>
    </Modal>
  );
}
