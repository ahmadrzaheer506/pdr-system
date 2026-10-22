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
      <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <ScrollTabBar
          value={value}
          fadeFrom="from-slate-100"
          className="min-w-0 rounded-lg bg-slate-100 p-1 lg:max-w-none"
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
        <div className="flex min-w-0 items-center justify-end gap-2 overflow-x-auto">
          <div className="relative w-40 shrink-0">
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
              className="w-40 shrink-0"
              label={select.label}
              value={select.value}
              onChange={select.onChange}
              options={select.options}
            />
          ) : null}
          <div className="flex shrink-0 items-center gap-2">
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
