import React from 'react';

/**
 * Count filter cards for staff visits and tasks. Selected state uses a tint,
 * a left rail, and a stronger ring so it is obvious on a phone.
 */
export default function FilterCountCards({ items, selected, onSelect }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((item) => {
        const on = selected === item.id;
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(item.id)}
            className={`relative overflow-hidden rounded-2xl px-3.5 py-3 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 transition ${
              on
                ? `${item.active} ring-2 shadow-sm`
                : 'bg-white ring-slate-200/70 hover:bg-slate-50 hover:ring-slate-300'
            }`}
          >
            <span className={`absolute inset-y-0 left-0 w-1 ${on ? item.rail : 'bg-transparent'}`} aria-hidden="true" />
            <div className="pl-1.5">
              <div className="text-xl font-semibold tabular-nums tracking-tight text-slate-900">{item.count}</div>
              <div className={`mt-0.5 text-[11px] font-semibold ${on ? item.labelClass : 'text-slate-500'}`}>
                {item.label}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
