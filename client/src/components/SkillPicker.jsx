import React from 'react';
import SelectMenu from './SelectMenu.jsx';
import {
  SKILL_LEVELS,
  skillSelected,
  selectedLevel,
  toggleStaffSkill,
  setStaffSkillLevel,
} from '../lib/skills';

/**
 * Pick skills from the Settings catalogue and set a level on each.
 * Used on staff profiles and job required-skills.
 */
export default function SkillPicker({
  catalogue = [],
  value = [],
  onChange,
  disabled = false,
  emptyHint = 'Add skills in Settings first.',
}) {
  if (!catalogue.length) {
    return <p className="text-xs text-slate-400">{emptyHint}</p>;
  }

  return (
    <div className="space-y-1.5">
      {catalogue.map((skill) => {
        const on = skillSelected(value, skill.id);
        const level = selectedLevel(value, skill.id);
        return (
          <div
            key={skill.id}
            className={`flex flex-wrap items-center gap-2 rounded-xl border px-2.5 py-2 ${
              on ? 'border-navy-200 bg-slate-50' : 'border-slate-200 bg-white'
            }`}
          >
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange?.(toggleStaffSkill(value, skill.id))}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                on ? 'bg-navy-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {skill.name}
            </button>
            {on ? (
              <div className="min-w-[10.5rem] flex-1">
                <SelectMenu
                  id={`skill-level-${skill.id}`}
                  label={`${skill.name} level`}
                  size="sm"
                  value={level}
                  disabled={disabled}
                  onChange={(next) => onChange?.(setStaffSkillLevel(value, skill.id, next))}
                  options={SKILL_LEVELS.map((l) => ({ value: l.id, label: l.label }))}
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
