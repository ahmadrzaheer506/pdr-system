import React from 'react';
import { Link } from 'react-router-dom';
import { Calendar, UserRound, Users, Check, Pencil, Trash2 } from 'lucide-react';
import { fmtDate } from '../lib/api';
import { isOverdueTask, taskPeople, assigneeRoleLabel } from '../lib/taskList.js';
import { leadPath } from '../lib/customerRoutes.js';
import { PriorityBadge, StatusBadge, Avatar } from './ui.jsx';

/**
 * Shared task row for office and field-staff lists.
 * Field staff pass leadAsLink={false} and omit edit/delete.
 */
export default function TaskCard({
  task,
  focused,
  isDoneView,
  onDone,
  onEdit,
  onDelete,
  rowRef,
  leadAsLink = true,
}) {
  const overdue = isOverdueTask(task);
  const people = taskPeople(task);
  const rail = overdue
    ? 'bg-rose-500'
    : (task.priority === 'high' || task.priority === 'urgent' ? 'bg-amber-400' : 'bg-slate-200');
  const canDone = !isDoneView && task.status === 'open' && onDone;
  const showActions = canDone || onEdit || onDelete;

  const leadChip = task.lead_name ? (
    leadAsLink && task.lead_id ? (
      <Link
        to={leadPath(task.lead_id, 'tasks')}
        className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-medium text-brand-800 ring-1 ring-brand-100 hover:bg-brand-100"
      >
        <UserRound size={12} strokeWidth={2} />
        Lead: {task.lead_name}
      </Link>
    ) : (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-medium text-brand-800 ring-1 ring-brand-100">
        <UserRound size={12} strokeWidth={2} />
        Lead: {task.lead_name}
      </span>
    )
  ) : null;

  return (
    <div
      ref={rowRef}
      className={`card relative overflow-hidden p-4 pl-5 transition hover:border-slate-300 hover:shadow-md ${focused ? 'ring-2 ring-brand-400' : ''}`}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${rail}`} aria-hidden="true" />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold tracking-tight text-slate-900">{task.title}</span>
            <PriorityBadge priority={task.priority} />
            {task.type === 'system' && (
              <span className="badge bg-slate-50 text-slate-500 ring-1 ring-slate-200/80">auto</span>
            )}
            {isDoneView && <StatusBadge status={task.status} />}
          </div>
          {task.detail ? (
            <p className="mt-1 text-sm leading-relaxed text-slate-500 line-clamp-2">{task.detail}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                overdue ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-100' : 'bg-slate-50 text-slate-600 ring-1 ring-slate-200/80'
              }`}
            >
              <Calendar size={12} strokeWidth={2} />
              {task.due_date ? `Due ${fmtDate(task.due_date)}${overdue ? ' — overdue' : ''}` : 'No due date'}
            </span>
            {leadChip}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="People assigned to this task">
            <span className="inline-flex items-center gap-1 pr-0.5 text-[11px] font-semibold text-slate-500">
              <Users size={12} strokeWidth={2} />
              Assigned to
            </span>
            {people.length === 0 ? (
              <span className="text-[11px] text-slate-400">Unassigned</span>
            ) : people.map((person) => {
              const role = assigneeRoleLabel(person.role);
              return (
                <span
                  key={person.id || person.name}
                  title={role ? `${person.name} · ${role}` : person.name}
                  className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 py-1 pl-1 pr-2.5 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200/80"
                >
                  <Avatar name={person.name} size={4.5} />
                  <span className="max-w-[10rem] truncate">{person.name}</span>
                  {role ? <span className="text-[10px] font-medium text-slate-400">{role}</span> : null}
                </span>
              );
            })}
          </div>
        </div>
        {showActions ? (
          <div className="flex shrink-0 items-center gap-2 self-end sm:self-start">
            {canDone && (
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 active:scale-[0.98]"
                aria-label={`Mark "${task.title}" done`}
                onClick={onDone}
              >
                <Check size={15} strokeWidth={2.4} className="text-emerald-600" />
                Mark done
              </button>
            )}
            {(onEdit || onDelete) ? (
              <div className="flex items-center gap-0.5 rounded-xl bg-slate-50 p-1 ring-1 ring-slate-200/70">
                {onEdit && (
                  <button
                    type="button"
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-slate-600 hover:bg-white hover:text-slate-900"
                    aria-label={`Edit ${task.title}`}
                    onClick={onEdit}
                  >
                    <Pencil size={13} />
                    Edit
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    aria-label={`Delete ${task.title}`}
                    onClick={onDelete}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-rose-600"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
