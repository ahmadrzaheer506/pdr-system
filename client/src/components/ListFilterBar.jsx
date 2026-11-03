import React from 'react';
import { Search } from 'lucide-react';
import ScrollTabBar from './ScrollTabBar.jsx';
import SelectMenu from './SelectMenu.jsx';
import DatePicker from './DatePicker.jsx';

/**
 * Shared list toolbar: status/type tabs, search, optional select, From/To dates.
 * Same layout as Customers.
 */
export default function ListFilterBar({
  tabs,
  value,
  onChange,
  searchValue,
  onSearchChange,
  searchLabel,
  select = null,
  from = '',
  to = '',
  onFromChange,
  onToChange,
  fromLabel = 'Created from',
  toLabel = 'Created to',
}) {
  return (
    <div className="card p-3">
      <div className="flex w-full flex-col gap-3">
        <ScrollTabBar
          value={value}
          fadeFrom="from-slate-100"
          className="min-w-0 rounded-lg bg-slate-100 p-1"
          trackClassName="h-8 gap-1 sm:h-9"
        >
          {tabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              data-tab={tab.value}
              onClick={() => onChange(tab.value)}
              className={`h-full shrink-0 whitespace-nowrap rounded-md px-3 text-sm font-medium ${value === tab.value ? 'bg-navy-900 text-white' : 'text-slate-500 hover:bg-white'}`}
            >
              {tab.label}
            </button>
          ))}
        </ScrollTabBar>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12.5rem] flex-1 basis-[12.5rem] sm:max-w-xs">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input !pl-9 w-full"
              placeholder="Search…"
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              aria-label={searchLabel}
            />
          </div>
          {select ? (
            <SelectMenu
              className="w-full min-w-[10rem] sm:w-44"
              label={select.label}
              value={select.value}
              onChange={select.onChange}
              options={select.options}
            />
          ) : null}
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <DatePicker
              className="w-[10.5rem]"
              label={fromLabel}
              value={from}
              onChange={onFromChange}
              placeholder="From"
            />
            <span className="text-xs text-slate-400">to</span>
            <DatePicker
              className="w-[10.5rem]"
              label={toLabel}
              value={to}
              onChange={onToChange}
              placeholder="To"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
