import React, { useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import {
  SKILL_LEVELS,
  skillSelected,
  selectedLevel,
  toggleStaffSkill,
  setStaffSkillLevel,
} from '../lib/skills';

/**
 * Compact catalogue picker: tick a skill, then set Trainee / Competent / Advanced.
 * Used on staff profiles, jobs, and job types.
 */
export default function SkillPicker({
  catalogue = [],
  value = [],
  onChange,
  disabled = false,
  emptyHint = 'Add skills in Settings first.',
}) {
  const [q, setQ] = useState('');
  const selectedCount = catalogue.filter((skill) => skillSelected(value, skill.id)).length;
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return catalogue;
    return catalogue.filter((skill) => String(skill.name || '').toLowerCase().includes(needle));
  }, [catalogue, q]);

  if (!catalogue.length) {
    return <p className="text-xs text-slate-400">{emptyHint}</p>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-3 py-2">
        <p className="min-w-0 flex-1 text-xs font-medium text-slate-500">
          {selectedCount === 0 ? 'None selected' : `${selectedCount} selected`}
        </p>
        {catalogue.length > 6 ? (
          <div className="relative min-w-[10rem] flex-1 sm:max-w-[14rem]">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input !py-1.5 !pl-8 !text-xs"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search skills…"
              aria-label="Search skills"
            />
          </div>
        ) : null}
      </div>
      <ul className="max-h-[16.5rem] divide-y divide-slate-100 overflow-y-auto overscroll-contain">
        {filtered.length === 0 ? (
          <li className="px-3 py-4 text-center text-xs text-slate-400">No skills match “{q.trim()}”.</li>
        ) : filtered.map((skill) => {
          const on = skillSelected(value, skill.id);
          const level = selectedLevel(value, skill.id);
          return (
            <li
              key={skill.id}
              className={`flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3 ${
                on ? 'bg-slate-50/80' : 'bg-white'
              }`}
            >
              <button
                type="button"
                disabled={disabled}
                aria-pressed={on}
                onClick={() => onChange?.(toggleStaffSkill(value, skill.id))}
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
              >
                <span
                  aria-hidden="true"
                  className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    on ? 'border-navy-900 bg-navy-900 text-white' : 'border-slate-300 bg-white'
                  }`}
                >
                  {on ? <Check size={11} strokeWidth={3} /> : null}
                </span>
                <span className={`text-sm font-medium ${on ? 'text-slate-900' : 'text-slate-600'}`}>
                  {skill.name}
                </span>
              </button>
              {on ? (
                <div
                  className="flex w-full shrink-0 rounded-lg bg-slate-100 p-0.5 sm:w-auto"
                  role="group"
                  aria-label={`${skill.name} level`}
                >
                  {SKILL_LEVELS.map((item) => {
                    const active = level === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={disabled}
                        aria-pressed={active}
                        aria-label={`${skill.name} ${item.label}`}
                        onClick={() => onChange?.(setStaffSkillLevel(value, skill.id, item.id))}
                        className={`min-w-0 flex-1 rounded-md px-2 py-1 text-[11px] font-medium sm:flex-none ${
                          active
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
