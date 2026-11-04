import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, CheckSquare, Search, ListTodo, AlertTriangle, CalendarDays, Clock, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api';
import { PageLoading, EmptyState, Modal, useToast, Toast } from '../components/ui.jsx';
import { TASK_VIEWS, normalizeTaskView, tasksQueryPath, viewForDueDate, filterTasks } from '../lib/taskList.js';
import DatePicker from '../components/DatePicker.jsx';
import TaskCard from '../components/TaskCard.jsx';
import TaskFormModal from '../components/TaskFormModal.jsx';
import TaskDoneModal from '../components/TaskDoneModal.jsx';

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

  const complete = async (note) => {
    if (!pendingDone) return;
    setBusy(true);
    try {
      await api.put(`/tasks/${pendingDone.id}`, { status: 'done', complete_note: note || null });
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
      <div>
        <div className="flex items-center justify-between gap-3">
          <h1 className="min-w-0 text-[1.7rem] font-semibold tracking-tight text-slate-900">Tasks & Reminders</h1>
          <button type="button" className="btn-primary shrink-0" onClick={() => setTaskForm('new')}>
            <Plus size={16} /> Add task
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-500">Generated automatically by the system, plus anything you add manually.</p>
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
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          <div className="relative w-full min-w-0 sm:min-w-[16rem] sm:flex-1">
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
            className="w-full sm:w-[12.5rem] sm:shrink-0"
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
      <TaskDoneModal
        open={!!pendingDone}
        task={pendingDone}
        saving={busy}
        onClose={() => setPendingDone(null)}
        onConfirm={complete}
      />
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
