import React from 'react';
import { Briefcase, PlaneTakeoff, UserCheck, Users } from 'lucide-react';
import { Avatar, avatarUrl } from './ui.jsx';
import { skillLabel } from '../lib/skills';
import { localIsoDate, teamAvailabilityRows } from '../lib/schedule';

const GROUPS = [
  {
    status: 'available',
    title: 'Available',
    hint: 'Ready to assign',
    empty: 'Nobody free today',
    Icon: UserCheck,
    column: 'bg-emerald-50/80 ring-emerald-100/90',
    rail: 'bg-emerald-400',
    heading: 'text-emerald-950',
    count: 'bg-white text-emerald-800 ring-emerald-100',
  },
  {
    status: 'busy',
    title: 'On a job',
    hint: 'Already booked',
    empty: 'Nobody on a job',
    Icon: Briefcase,
    column: 'bg-amber-50/80 ring-amber-100/90',
    rail: 'bg-amber-400',
    heading: 'text-amber-950',
    count: 'bg-white text-amber-900 ring-amber-100',
  },
  {
    status: 'holiday',
    title: 'On holiday',
    hint: 'Not working today',
    empty: 'Nobody off today',
    Icon: PlaneTakeoff,
    column: 'bg-slate-50 ring-slate-200/80',
    rail: 'bg-slate-300',
    heading: 'text-slate-800',
    count: 'bg-white text-slate-700 ring-slate-200/80',
  },
];

function formatBoardDate(iso) {
  const [year, month, day] = String(iso || '').split('-').map(Number);
  if (!year || !month || !day) return '';
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
}

function PersonRow({ row }) {
  const { person, status, jobs } = row;
  const jobTitles = jobs.map((job) => job.job_title).filter(Boolean).join(' · ');
  const skills = (person.skills || []).map(skillLabel);

  return (
    <li className="flex items-start gap-2.5 rounded-xl bg-white px-2.5 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-black/[0.04]">
      <Avatar name={person.name} color={person.color} size={9} src={avatarUrl(person)} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-slate-900">{person.name}</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {person.is_driver ? (
            <span className="rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 ring-1 ring-sky-100">
              Driver
            </span>
          ) : null}
          {skills.length ? skills.map((skill) => (
            <span key={skill} className="rounded-md bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200/70">
              {skill}
            </span>
          )) : !person.is_driver ? (
            <span className="text-[11px] text-slate-400">No skills tagged</span>
          ) : null}
        </div>
        {status === 'busy' && jobTitles ? (
          <p className="mt-1.5 truncate text-xs font-medium text-amber-800" title={jobTitles}>
            {jobTitles}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function StatusColumn({ group, rows }) {
  const Icon = group.Icon;
  return (
    <section className={`relative flex h-full min-h-[12rem] flex-col overflow-hidden rounded-2xl p-3 ring-1 ${group.column}`}>
      <span className={`absolute inset-y-0 left-0 w-1 ${group.rail}`} aria-hidden="true" />
      <header className="mb-3 flex items-start justify-between gap-2 pl-2">
        <div>
          <h4 className={`flex items-center gap-1.5 text-sm font-semibold ${group.heading}`}>
            <Icon size={14} strokeWidth={2.2} />
            {group.title}
          </h4>
          <p className="mt-0.5 text-[11px] text-slate-500">{group.hint}</p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ring-1 ${group.count}`}>
          {rows.length}
        </span>
      </header>
      {rows.length === 0 ? (
        <p className="pl-2 text-sm text-slate-400">{group.empty}</p>
      ) : (
        <ul className="max-h-[22rem] space-y-2 overflow-y-auto overscroll-contain pr-0.5" aria-label={group.title}>
          {rows.map((row) => (
            <PersonRow key={row.person.id} row={row} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Schedule board: who is free, already on a job, or off today.
 */
export default function TeamAvailability({ staff, holidays, jobs, today = localIsoDate() }) {
  const rows = teamAvailabilityRows(staff, holidays, jobs, today);
  const available = rows.filter((row) => row.status === 'available').length;
  const busy = rows.filter((row) => row.status === 'busy').length;
  const holiday = rows.filter((row) => row.status === 'holiday').length;
  const dateLabel = formatBoardDate(today);

  return (
    <div className="card overflow-hidden" id="team-availability">
      <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
        <h3 className="flex items-center gap-2 font-semibold text-slate-800">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <Users size={16} />
          </span>
          Team availability today
        </h3>
        <p className="mt-1 pl-10 text-sm text-slate-500">
          {dateLabel ? `${dateLabel} — who can take work, already booked, or off.` : 'Who can take work, already booked, or off.'}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5 pl-10">
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
            {available} available
          </span>
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-100">
            {busy} on a job
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200/80">
            {holiday} on holiday
          </span>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-400">No field staff to show.</p>
      ) : (
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {GROUPS.map((group) => (
            <StatusColumn
              key={group.status}
              group={group}
              rows={rows.filter((row) => row.status === group.status)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
