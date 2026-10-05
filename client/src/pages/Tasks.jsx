import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, CheckSquare, Search, Pencil, ListTodo, AlertTriangle, CalendarDays, Clock, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api';
import { PageLoading, EmptyState, Modal, useToast, Toast } from '../components/ui.jsx';
import { TASK_VIEWS, normalizeTaskView, tasksQueryPath, viewForDueDate, localToday, filterTasks, assigneeRoleLabel } from '../lib/taskList.js';
import { ROLES } from '../lib/roles';
import SelectMenu from '../components/SelectMenu.jsx';
import MultiSelect from '../components/MultiSelect.jsx';
import SearchSelect from '../components/SearchSelect.jsx';
import DatePicker from '../components/DatePicker.jsx';
import TaskCard from '../components/TaskCard.jsx';

const TASK_TAB_STYLE = {
  ALL: {
    Icon: ListTodo,
    rail: 'bg-sky-400',
    iconWrap: 'bg-sky-100 text-sky-700',
    active: 'bg-sky-50 ring-2 ring-sky-400/80',
    idle: 'bg-white hover:bg-sky-50/50',
  },
  overdue: {
    Icon: AlertTriangle,
    rail: 'bg-rose-400',
    iconWrap: 'bg-rose-100 text-rose-700',
    active: 'bg-rose-50 ring-2 ring-rose-400/80',
    idle: 'bg-white hover:bg-rose-50/50',
  },
  today: {
    Icon: CalendarDays,
    rail: 'bg-amber-400',
    iconWrap: 'bg-amber-100 text-amber-700',
    active: 'bg-amber-50 ring-2 ring-amber-400/80',
    idle: 'bg-white hover:bg-amber-50/50',
  },
  due: {
    Icon: Clock,
    rail: 'bg-indigo-400',
    iconWrap: 'bg-indigo-100 text-indigo-700',
    active: 'bg-indigo-50 ring-2 ring-indigo-400/80',
    idle: 'bg-white hover:bg-indigo-50/50',
  },
  done: {
    Icon: CheckCircle2,
    rail: 'bg-emerald-400',
    iconWrap: 'bg-emerald-100 text-emerald-700',
    active: 'bg-emerald-50 ring-2 ring-emerald-400/80',
    idle: 'bg-white hover:bg-emerald-50/50',
  },
};

export default function Tasks() {
  const [searchParams, setSearchParams] = useSearchParams();
  const when = normalizeTaskView(searchParams.get('when'));
  const focusId = Number(searchParams.get('task') || 0) || null;
  const focusRef = useRef(null);
  const [data, setData] = useState(null);
  const [taskForm, setTaskForm] = useState(null);
  const [pendingDone, setPendingDone] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [dueOn, setDueOn] = useState('');
  const { toast, show } = useToast();

  const load = useCallback(() => {
    api.get(tasksQueryPath(when)).then(setData).catch((err) => {
      show(err.message, 'error');
      setData((current) => current || { tasks: [] });
    });
  }, [when, show]);

  useEffect(() => {
    let cancelled = false;
    api.get(tasksQueryPath(when)).then((d) => {
      if (!cancelled) setData(d);
    }).catch((err) => {
      if (cancelled) return;
      show(err.message, 'error');
      setData((current) => current || { tasks: [] });
    });
    return () => { cancelled = true; };
  }, [when, show]);

  useEffect(() => {
    if (!focusId || searchParams.get('when') || !data) return;
    const t = (data.tasks || []).find((row) => row.id === focusId);
    const next = new URLSearchParams();
    next.set('task', String(focusId));
    if (t) {
      const nextWhen = viewForDueDate(t.due_date);
      if (nextWhen !== 'ALL') next.set('when', nextWhen);
    } else {
      next.set('when', 'done');
    }
    setSearchParams(next, { replace: true });
  }, [data, focusId, searchParams, setSearchParams]);

  const setWhen = (next) => {
    const params = new URLSearchParams();
    if (next !== 'ALL') params.set('when', next);
    if (focusId) params.set('task', String(focusId));
    setSearchParams(params);
  };

  const complete = async () => {
    if (!pendingDone) return;
    setBusy(true);
    try {
      await api.put(`/tasks/${pendingDone.id}`, { status: 'done' });
      show('Task completed');
      setPendingDone(null);
      load();
    } catch (err) {
      show(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await api.del(`/tasks/${pendingDelete.id}`);
      show('Task deleted');
      setPendingDelete(null);
      load();
    } catch (err) {
      show(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (focusRef.current) focusRef.current.scrollIntoView({ block: 'center' });
  }, [data, focusId]);

  if (!data) return <PageLoading />;

  const counts = { open: 0, overdue: 0, today: 0, due: 0, done: 0, ...data.counts };
  const isDoneView = when === 'done';
  const visible = filterTasks(data.tasks, { q: query, dueDate: dueOn });
  const filtering = Boolean(query.trim() || dueOn);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[1.7rem] font-semibold tracking-tight text-slate-900">Tasks & Reminders</h1>
          <p className="text-slate-500 text-sm mt-1">Generated automatically by the system, plus anything you add manually.</p>
        </div>
        <button className="btn-primary" onClick={() => setTaskForm('new')}><Plus size={16} /> Add task</button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
        {TASK_VIEWS.map(({ id, label, countKey }) => {
          const style = TASK_TAB_STYLE[id] || TASK_TAB_STYLE.ALL;
          const Icon = style.Icon;
          const selected = when === id;
          const count = counts[countKey] ?? 0;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setWhen(id)}
              aria-pressed={selected}
              className={`relative overflow-hidden rounded-2xl px-4 py-3.5 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 transition sm:flex-1 sm:min-w-[7.5rem] ${
                id === 'done' ? 'col-span-2 sm:col-auto' : ''
              } ${selected ? style.active : `${style.idle} ring-slate-200/70 hover:ring-slate-300`}`}
            >
              <span className={`absolute inset-x-0 top-0 h-0.5 ${style.rail}`} aria-hidden="true" />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className={`text-2xl font-semibold tabular-nums tracking-tight ${count === 0 && !selected ? 'text-slate-400' : 'text-slate-900'}`}>
                    {count}
                  </div>
                  <div className="mt-0.5 text-xs font-medium text-slate-500">{label}</div>
                </div>
                <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${style.iconWrap}`}>
                  <Icon size={15} strokeWidth={2} />
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[16rem] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input !pl-9 w-full"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, lead or assignee…"
              aria-label="Search tasks"
            />
          </div>
          <DatePicker
            className="w-[12.5rem]"
            label="Filter by due date"
            placeholder="Due date"
            value={dueOn}
            onChange={setDueOn}
            allowClear
          />
        </div>
      </div>

      {data.tasks.length === 0 ? (
        <TasksEmpty icon={CheckSquare} title="All clear" detail="Nothing outstanding right now." />
      ) : visible.length === 0 ? (
        <TasksEmpty icon={Search} title="No matching tasks" detail="Try a different search or due date." />
      ) : (
        <div className="space-y-2">
          {filtering && (
            <p className="text-xs text-slate-500 px-0.5">Showing {visible.length} of {data.tasks.length}</p>
          )}
          {visible.map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              rowRef={focusId === t.id ? focusRef : undefined}
              focused={focusId === t.id}
              isDoneView={isDoneView}
              onDone={() => setPendingDone(t)}
              onEdit={() => setTaskForm(t)}
              onDelete={() => setPendingDelete(t)}
            />
          ))}
        </div>
      )}

      <TaskFormModal
        open={taskForm != null}
        task={taskForm && taskForm !== 'new' ? taskForm : null}
        onClose={() => setTaskForm(null)}
        onSaved={(wasEdit) => {
          setTaskForm(null);
          load();
          show(wasEdit ? 'Task updated' : 'Task added');
        }}
        onError={(msg) => show(msg, 'error')}
      />
      <Modal open={!!pendingDone} onClose={() => !busy && setPendingDone(null)} title="Mark task done">
        <p className="text-sm text-slate-600">
          Are you sure you want to mark “{pendingDone?.title}” as done?
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => setPendingDone(null)}>
            Cancel
          </button>
          <button type="button" className="btn-primary" disabled={busy} onClick={complete}>
            {busy ? 'Saving…' : 'Mark done'}
          </button>
        </div>
      </Modal>
      <Modal open={!!pendingDelete} onClose={() => !busy && setPendingDelete(null)} title="Delete task">
        <p className="text-sm text-slate-600">
          Are you sure you want to delete “{pendingDelete?.title}”? This cannot be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => setPendingDelete(null)}>
            Cancel
          </button>
          <button type="button" className="btn-danger" disabled={busy} onClick={remove}>
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </Modal>
      <Toast {...toast} />
    </div>
  );
}

function TasksEmpty({ icon, title, detail }) {
  return (
    <div className="card flex min-h-[18rem] items-center justify-center px-6 py-16">
      <EmptyState icon={icon} title={title} detail={detail} />
    </div>
  );
}

function isAssignableUser(u) {
  return u && u.active !== false && (u.role === ROLES.OFFICE || u.role === ROLES.STAFF);
}

function canAttachLead(task) {
  if (!task) return true;
  return task.type === 'manual' || !task.entity_type || task.entity_type === 'customer';
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

function TaskFormModal({ open, task, onClose, onSaved, onError }) {
  const editing = Boolean(task);
  const leadRequired = canAttachLead(task);
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
        lead_id: task.lead_id ? String(task.lead_id) : '',
        assignee_ids: ids.length ? ids : fallback,
      });
      setLeadQuery(task.lead_name || '');
      setChangingLead(!task.lead_id);
    } else {
      setForm({ title: '', detail: '', due_date: localToday(), priority: 'normal', lead_id: '', assignee_ids: [] });
      setLeadQuery('');
      setChangingLead(true);
    }
  }, [open, task]);

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
    if (!open) return undefined;
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
  }, [open, leadQuery, onError]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    if (leadRequired && !form.lead_id) {
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
      if (leadRequired) payload.lead_id = Number(form.lead_id);
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
  const selectedLeadLabel = selectedLead
    ? leadOptionLabel(selectedLead)
    : (form.lead_id ? (task?.lead_name || leadQuery || 'Selected lead') : '');
  const selectedLeadHint = selectedLead ? leadOptionHint(selectedLead) : '';
  const showLeadCard = Boolean(form.lead_id) && !changingLead;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit task' : 'Add a task'}
      subtitle={editing ? 'Update the lead, people, and timing.' : 'Link this to a lead and assign office or field staff.'}
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
                  <button
                    type="button"
                    aria-label="Change"
                    className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700"
                    onClick={() => setChangingLead(true)}
                  >
                    <Pencil size={14} />
                  </button>
                  <input tabIndex={-1} required value={form.lead_id} readOnly className="sr-only" aria-hidden="true" />
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
