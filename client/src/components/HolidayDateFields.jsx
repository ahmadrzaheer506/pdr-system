import React from 'react';
import DatePicker from './DatePicker.jsx';
import { HOLIDAY_KIND_MULTI, HOLIDAY_KIND_SINGLE, HOLIDAY_KINDS } from '../lib/holidays.js';

export function HolidayKindTabs({ kind, onChange }) {
  return (
    <div>
      <div className="label" id="holiday-kind-label">Holiday type</div>
      <div
        className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 w-fit"
        role="radiogroup"
        aria-labelledby="holiday-kind-label"
      >
        {HOLIDAY_KINDS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="radio"
            aria-checked={kind === tab.id}
            onClick={() => onChange(tab.id)}
            className={`px-3 py-1.5 text-sm rounded-md font-medium ${
              kind === tab.id ? 'bg-navy-900 text-white' : 'text-slate-500 hover:bg-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function HolidayDateFields({
  kind,
  start,
  end,
  onStart,
  onEnd,
  minDate,
  idPrefix = 'holiday',
}) {
  if (kind === HOLIDAY_KIND_SINGLE) {
    return (
      <div>
        <label className="label" htmlFor={`${idPrefix}-date`}>Date</label>
        <DatePicker
          id={`${idPrefix}-date`}
          label="Date"
          value={start}
          min={minDate}
          required
          onChange={(value) => {
            onStart(value);
            onEnd(value);
          }}
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="label" htmlFor={`${idPrefix}-from`}>From</label>
        <DatePicker
          id={`${idPrefix}-from`}
          label="From"
          value={start}
          min={minDate}
          required
          onChange={onStart}
        />
      </div>
      <div>
        <label className="label" htmlFor={`${idPrefix}-to`}>To</label>
        <DatePicker
          id={`${idPrefix}-to`}
          label="To"
          value={end}
          min={start || minDate}
          required
          onChange={onEnd}
        />
      </div>
    </div>
  );
}

export function nextHolidayKind(current, next, start, end) {
  if (next === HOLIDAY_KIND_SINGLE) return { kind: next, start, end: start };
  if (next === HOLIDAY_KIND_MULTI && (!end || end === start)) {
    return { kind: next, start, end: '' };
  }
  return { kind: next, start, end };
}
