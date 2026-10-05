import React from 'react';
import { RANGE_PRESETS } from '../lib/reports.js';

/** 7 / 30 / 90 day window for lead volume and win/loss (requirement 14.1). */
export default function ReportRangePills({ value, onChange }) {
  return (
    <div className="inline-flex rounded-full bg-slate-100 p-1" role="group" aria-label="Date range">
      {RANGE_PRESETS.map((d) => {
        const active = value === d;
        return (
          <button
            key={d}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(d)}
            className={`min-w-[2.75rem] rounded-full px-3.5 py-1.5 text-sm font-medium transition-all ${
              active
                ? 'bg-white text-slate-900 shadow-sm ring-1 ring-black/[0.06]'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {d}d
          </button>
        );
      })}
    </div>
  );
}
