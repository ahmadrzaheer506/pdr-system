import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export function toYmd(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseYmd(ymd) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

export function formatDateLabel(ymd) {
  const date = parseYmd(ymd);
  if (!date) return '';
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function todayDate() {
  return startOfDay(new Date());
}

function monthCells(year, month) {
  const first = new Date(year, month, 1);
  let pad = first.getDay() - 1;
  if (pad < 0) pad = 6;
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < pad; i += 1) cells.push(null);
  for (let d = 1; d <= days; d += 1) cells.push(new Date(year, month, d));
  return cells;
}

function initialCursor(value, min) {
  const selected = parseYmd(value);
  if (selected) return selected;
  const minDate = parseYmd(min);
  const today = todayDate();
  if (minDate && minDate > today) return minDate;
  return today;
}

/**
 * Catalogue-style calendar used in place of native date inputs.
 * Value is always YYYY-MM-DD (or '') so callers keep the same payloads.
 */
export default function DatePicker({
  id,
  label,
  value = '',
  onChange,
  min,
  max,
  required = false,
  disabled = false,
  allowClear,
  placeholder = 'Select date',
  className = '',
  size = 'md',
  variant = 'default',
}) {
  const canClear = allowClear ?? !required;
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const [coords, setCoords] = useState(null);
  const [cursor, setCursor] = useState(() => initialCursor(value, min));

  useEffect(() => {
    if (open) setCursor(initialCursor(value, min));
  }, [open, value, min]);

  const place = () => {
    const btn = buttonRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const width = 288;
    const margin = 8;
    const gap = 4;
    const panelH = menuRef.current?.getBoundingClientRect().height || 340;
    const spaceBelow = window.innerHeight - r.bottom - gap - margin;
    const spaceAbove = r.top - gap - margin;
    const openUp = spaceBelow < panelH && spaceAbove > spaceBelow;
    let left = r.left;
    if (left + width > window.innerWidth - margin) left = Math.max(margin, window.innerWidth - width - margin);
    if (left < margin) left = margin;
    const viewportH = window.innerHeight - margin * 2;
    const height = Math.min(panelH, viewportH);
    let top = openUp ? r.top - gap - height : r.bottom + gap;
    if (top < margin) top = margin;
    if (top + height > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - margin - height);
    }
    setCoords({ top, left, width, maxHeight: viewportH });
  };

  useEffect(() => {
    if (!open) {
      setCoords(null);
      return undefined;
    }
    place();
    const frame = requestAnimationFrame(place);
    const onDoc = (e) => {
      if (rootRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onEsc = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.stopImmediatePropagation();
      setOpen(false);
    };
    const onReposition = (e) => {
      if (menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc, true);
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc, true);
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
    };
  }, [open]);

  const compact = size === 'sm';
  const dark = variant === 'dark';
  const cells = useMemo(() => monthCells(cursor.getFullYear(), cursor.getMonth()), [cursor]);
  const monthKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
  const todayYmd = toYmd(todayDate());
  const display = formatDateLabel(value) || placeholder;

  const isDisabledDay = (date) => {
    const ymd = toYmd(date);
    if (min && ymd < min) return true;
    if (max && ymd > max) return true;
    return false;
  };

  const pick = (ymd) => {
    if (ymd && min && ymd < min) return;
    if (ymd && max && ymd > max) return;
    onChange(ymd);
    setOpen(false);
  };

  const shiftMonth = (delta) => {
    setCursor((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  };

  const prevMonthBlocked = min && toYmd(new Date(cursor.getFullYear(), cursor.getMonth(), 0)) < min;
  const nextMonthBlocked = max && toYmd(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) > max;

  return (
    <div className={`relative ${className}`} ref={rootRef}>
      {required && (
        <input
          tabIndex={-1}
          required
          value={value || ''}
          onChange={() => {}}
          className="pointer-events-none absolute h-0 w-0 opacity-0"
          aria-hidden="true"
        />
      )}
      <button
        type="button"
        id={id}
        ref={buttonRef}
        disabled={disabled}
        data-value={value || ''}
        min={min || undefined}
        max={max || undefined}
        aria-label={label}
        aria-required={required || undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => { if (!disabled) setOpen((v) => !v); }}
        className={`inline-flex w-full items-center gap-2 rounded-lg border text-left transition-colors ${
          compact ? 'h-8 px-2 text-xs' : 'h-10 px-3 text-sm'
        } ${
          disabled ? 'cursor-not-allowed opacity-60' : ''
        } ${
          dark
            ? `border-white/20 bg-white/10 text-white ${open ? 'ring-2 ring-white/20' : 'hover:bg-white/15'}`
            : `bg-white ${open ? 'border-slate-400 ring-2 ring-slate-200' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'} ${
              value ? 'text-slate-800' : 'text-slate-400'
            }`
        }`}
      >
        <CalendarDays size={compact ? 13 : 15} className={`shrink-0 ${dark ? 'text-white/70' : 'text-slate-400'}`} />
        <span className="min-w-0 flex-1 truncate">{display}</span>
        {canClear && value && !disabled ? (
          <span
            aria-hidden="true"
            className={`shrink-0 rounded p-0.5 ${dark ? 'text-white/60 hover:bg-white/10' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onChange('');
            }}
          >
            <X size={13} />
          </span>
        ) : null}
      </button>
      {open && coords && createPortal(
        <div
          ref={menuRef}
          data-datepicker-panel
          role="dialog"
          aria-label={label || 'Choose date'}
          className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg"
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            width: coords.width,
            maxHeight: coords.maxHeight,
            overflowY: 'auto',
            zIndex: 210,
          }}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              aria-label="Previous month"
              disabled={prevMonthBlocked}
              className={`rounded-lg p-1.5 ${
                prevMonthBlocked ? 'cursor-not-allowed text-slate-300' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
              onClick={() => { if (!prevMonthBlocked) shiftMonth(-1); }}
            >
              <ChevronLeft size={16} />
            </button>
            <p className="text-sm font-semibold text-slate-800">
              {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
            </p>
            <button
              type="button"
              aria-label="Next month"
              disabled={nextMonthBlocked}
              className={`rounded-lg p-1.5 ${
                nextMonthBlocked ? 'cursor-not-allowed text-slate-300' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
              onClick={() => { if (!nextMonthBlocked) shiftMonth(1); }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5" data-calendar-month={monthKey}>
            {WEEKDAYS.map((day) => (
              <div key={day} className="py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {day}
              </div>
            ))}
            {cells.map((date, i) => {
              if (!date) return <div key={`empty-${i}`} />;
              const ymd = toYmd(date);
              const selected = ymd === value;
              const isToday = ymd === todayYmd;
              const blocked = isDisabledDay(date);
              return (
                <button
                  key={ymd}
                  type="button"
                  data-date={ymd}
                  disabled={blocked}
                  aria-label={formatDateLabel(ymd)}
                  aria-pressed={selected}
                  className={`h-9 rounded-lg text-sm transition-colors ${
                    selected
                      ? 'bg-brand-500 font-semibold text-white'
                      : blocked
                        ? 'cursor-not-allowed text-slate-300'
                        : isToday
                          ? 'font-medium text-slate-900 ring-1 ring-inset ring-slate-300 hover:bg-slate-50'
                          : 'text-slate-700 hover:bg-slate-50'
                  }`}
                  onClick={() => { if (!blocked) pick(ymd); }}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
            <button
              type="button"
              className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
              disabled={isDisabledDay(todayDate())}
              onClick={() => pick(todayYmd)}
            >
              Today
            </button>
            {canClear ? (
              <button
                type="button"
                className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-50"
                onClick={() => pick('')}
              >
                Clear
              </button>
            ) : <span />}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
