import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X } from 'lucide-react';

function sameValue(a, b) {
  return String(a) === String(b);
}

/**
 * Searchable combobox: one field that types and opens a dropdown of matches.
 */
export default function SearchSelect({
  id,
  label,
  query,
  onQueryChange,
  options,
  value,
  onChange,
  placeholder = 'Search…',
  loading = false,
  emptyText = 'No matches',
  invalid = false,
  required = false,
  clearLabel = 'Clear customer',
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const menuRef = useRef(null);
  const [coords, setCoords] = useState(null);
  const selected = options.find((opt) => sameValue(opt.value, value));

  const place = () => {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.max(r.width, 152);
    const estimatedH = Math.min(Math.max(options.length, 1) * 56 + 8, 320);
    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;
    const openUp = spaceBelow < estimatedH && spaceAbove > spaceBelow;
    const maxHeight = Math.min(320, Math.max(120, (openUp ? spaceAbove : spaceBelow) - 8));
    setCoords({
      top: openUp ? undefined : r.bottom + 4,
      bottom: openUp ? window.innerHeight - r.top + 4 : undefined,
      left: r.left,
      width,
      maxHeight,
    });
  };

  useEffect(() => {
    if (!open) {
      setCoords(null);
      return undefined;
    }
    place();
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
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc, true);
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
    };
  }, [open, options.length]);

  const pick = (opt) => {
    onChange(opt.value);
    onQueryChange(opt.label);
    setOpen(false);
  };

  const clear = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onChange('');
    onQueryChange('');
    setOpen(true);
    inputRef.current?.focus();
  };

  return (
    <div className="relative" ref={rootRef}>
      {required && (
        <input
          tabIndex={-1}
          required
          value={value == null ? '' : String(value)}
          onChange={() => {}}
          className="pointer-events-none absolute h-0 w-0 opacity-0"
          aria-hidden="true"
        />
      )}
      <div className={`flex min-h-11 w-full items-center gap-2 rounded-xl border bg-white px-3 text-sm transition-colors ${
        selected?.hint ? 'py-1.5' : ''
      } ${
        open ? 'border-slate-400 ring-2 ring-slate-200' : invalid
          ? 'border-rose-400 ring-2 ring-rose-100'
          : 'border-slate-200 hover:border-slate-300'
      }`}>
        <Search size={15} className="shrink-0 text-slate-400" />
        <div className="min-w-0 flex-1">
          <input
            id={id}
            ref={inputRef}
            className="w-full bg-transparent py-1 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
            value={query}
            placeholder={placeholder}
            autoComplete="off"
            data-value={value == null ? '' : String(value)}
            aria-label={label}
            aria-required={required || undefined}
            aria-autocomplete="list"
            aria-expanded={open}
            aria-haspopup="listbox"
            role="combobox"
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onChange={(e) => {
              const next = e.target.value;
              onQueryChange(next);
              if (value) onChange('');
              setOpen(true);
            }}
          />
          {selected?.hint ? (
            <p className="truncate text-[11px] leading-tight text-slate-400">{selected.hint}</p>
          ) : null}
        </div>
        {query || value ? (
          <button
            type="button"
            aria-label={clearLabel}
            className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            onClick={clear}
          >
            <X size={14} />
          </button>
        ) : (
          <ChevronDown size={15} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </div>
      {open && coords && createPortal(
        <ul
          ref={menuRef}
          role="listbox"
          aria-label={label}
          className="overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl shadow-slate-200/70"
          style={{
            position: 'fixed',
            top: coords.top,
            bottom: coords.bottom,
            left: coords.left,
            width: coords.width,
            zIndex: 1100,
            maxHeight: coords.maxHeight || 280,
            overflowY: 'auto',
          }}
        >
          {loading && options.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-400">Loading…</li>
          ) : options.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-400">{emptyText}</li>
          ) : options.map((opt) => {
            const selectedRow = sameValue(opt.value, value);
            return (
              <li key={String(opt.value)} role="presentation">
                <button
                  type="button"
                  role="option"
                  data-value={String(opt.value)}
                  aria-label={opt.hint ? `${opt.label} — ${opt.hint}` : opt.label}
                  aria-selected={selectedRow}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left ${
                    selectedRow ? 'bg-rose-50 font-medium text-slate-900' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(opt)}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{opt.label}</span>
                    {opt.hint ? <span className="block truncate text-xs font-normal text-slate-400">{opt.hint}</span> : null}
                  </span>
                  {selectedRow ? <Check size={14} className="shrink-0 text-brand-500" /> : <span className="w-3.5 shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>,
        document.body,
      )}
    </div>
  );
}
