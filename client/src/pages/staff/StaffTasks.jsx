import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckSquare, Search } from 'lucide-react';
import { api } from '../../lib/api';
import { PageLoading, EmptyState, Modal, useToast, Toast } from '../../components/ui.jsx';
import TaskCard from '../../components/TaskCard.jsx';
import FilterCountCards from '../../components/FilterCountCards.jsx';
import {
  TASK_VIEWS, normalizeTaskView, staffTasksQueryPath, viewForDueDate, filterTasks,
} from '../../lib/taskList.js';

const TASK_TAB_STYLE = {
  ALL: { active: 'bg-sky-50 ring-sky-400', rail: 'bg-sky-500', labelClass: 'text-sky-800' },
  overdue: { active: 'bg-rose-50 ring-rose-400', rail: 'bg-rose-500', labelClass: 'text-rose-800' },
  today: { active: 'bg-amber-50 ring-amber-400', rail: 'bg-amber-500', labelClass: 'text-amber-800' },
  due: { active: 'bg-indigo-50 ring-indigo-400', rail: 'bg-indigo-500', labelClass: 'text-indigo-800' },
  done: { active: 'bg-emerald-50 ring-emerald-400', rail: 'bg-emerald-500', labelClass: 'text-emerald-800' },
};

function TasksEmpty({ icon, title, detail }) {
  return (
    <div className="card flex min-h-[16rem] items-center justify-center px-6 py-12">
      <EmptyState icon={icon} title={title} detail={detail} />
    </div>
  );
}

export default function StaffTasks() {
  const [searchParams, setSearchParams] = useSearchParams();
  const when = normalizeTaskView(searchParams.get('when'));
  const focusId = Number(searchParams.get('task') || 0) || null;
  const focusRef = useRef(null);
  const [data, setData] = useState(null);
  const [pendingDone, setPendingDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const { toast, show } = useToast();

  const load = useCallback(() => {
    api.get(staffTasksQueryPath(when)).then(setData).catch((err) => {
      show(err.message, 'error');
      setData((current) => current || { tasks: [] });
    });
  }, [when, show]);

  useEffect(() => {
    let cancelled = false;
    api.get(staffTasksQueryPath(when)).then((d) => {
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

  useEffect(() => {
    if (focusId && focusRef.current) focusRef.current.scrollIntoView({ block: 'center' });
  }, [data, focusId]);

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
      await api.put(`/staff/tasks/${pendingDone.id}`, { status: 'done' });
      show('Task completed');
      setPendingDone(null);
      load();
    } catch (err) {
      show(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <PageLoading />;

  const counts = { open: 0, overdue: 0, today: 0, due: 0, done: 0, ...data.counts };
  const isDoneView = when === 'done';
  const visible = filterTasks(data.tasks, { q: query });
  const filtering = Boolean(query.trim());

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">My Tasks</h1>
        <p className="text-slate-500 text-sm mt-0.5">Things assigned to you — tap Done when they are finished.</p>
      </div>

      <FilterCountCards
        selected={when}
        onSelect={setWhen}
        items={TASK_VIEWS.map(({ id, label, countKey }) => ({
          id,
          label,
          count: counts[countKey] ?? 0,
          ...TASK_TAB_STYLE[id],
        }))}
      />

      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          className="input !pl-9 w-full"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title or lead…"
          aria-label="Search tasks"
        />
      </div>

      {data.tasks.length === 0 ? (
        <TasksEmpty icon={CheckSquare} title="All clear" detail="Nothing assigned to you right now." />
      ) : visible.length === 0 ? (
        <TasksEmpty icon={Search} title="No matching tasks" detail="Try a different search." />
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
              leadAsLink={false}
              onDone={() => setPendingDone(t)}
            />
          ))}
        </div>
      )}

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
      <Toast {...toast} />
    </div>
  );
}
