import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, X } from 'lucide-react';

function sameValue(a, b) {
  return String(a) === String(b);
}

/**
 * Multi-select listbox. Stays open while toggling options; portals so it is
 * not clipped inside modals.
 */
export default function MultiSelect({
  id,
  label,
  values = [],
  onChange,
  options,
  placeholder = 'Select…',
  disabled = false,
  required = false,
  invalid = false,
  className = '',
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const [coords, setCoords] = useState(null);
  const selected = options.filter((opt) => values.some((v) => sameValue(opt.value, v)));

  const place = () => {
    const btn = buttonRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const width = Math.max(r.width, 152);
    const estimatedH = Math.min(options.length * 52 + 8, 320);
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
  }, [open, options.length, values.length]);

  const toggle = (opt) => {
    const exists = values.some((v) => sameValue(v, opt.value));
    const next = exists
      ? values.filter((v) => !sameValue(v, opt.value))
      : [...values, opt.value];
    onChange(next);
  };

  const remove = (opt) => {
    onChange(values.filter((v) => !sameValue(v, opt.value)));
  };

  return (
    <div className={`relative ${className}`} ref={rootRef}>
      {required && (
        <input
          tabIndex={-1}
          required
          value={values.length ? values.join(',') : ''}
          onChange={() => {}}
          className="pointer-events-none absolute h-0 w-0 opacity-0"
          aria-hidden="true"
        />
      )}
      <div
        id={id}
        ref={buttonRef}
        data-value={values.join(',')}
        aria-label={label}
        aria-required={required || undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-disabled={disabled || undefined}
        aria-multiselectable="true"
        role="combobox"
        tabIndex={disabled ? -1 : 0}
        onClick={() => { if (!disabled) setOpen((v) => !v); }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        className={`inline-flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border bg-white px-2.5 py-1.5 text-sm text-slate-700 transition-colors ${
          disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
        } ${
          open ? 'border-slate-400 ring-2 ring-slate-200' : invalid
            ? 'border-rose-400 ring-2 ring-rose-100'
            : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
        }`}
      >
        <span className={`flex min-w-0 flex-1 flex-wrap items-center gap-1 text-left ${selected.length ? 'text-slate-800' : 'text-slate-400'}`}>
          {selected.length === 0 ? (
            placeholder
          ) : selected.map((opt) => (
            <span
              key={String(opt.value)}
              className="inline-flex max-w-full items-center gap-0.5 rounded-lg bg-slate-100 py-0.5 pl-2 pr-1 text-xs font-medium text-slate-700"
            >
              <span className="truncate">{opt.label}</span>
              <button
                type="button"
                aria-label={`Remove ${opt.label}`}
                className="rounded p-0.5 text-slate-400 hover:bg-white hover:text-slate-700"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  remove(opt);
                }}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </span>
        <ChevronDown size={15} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
      {open && coords && createPortal(
        <ul
          ref={menuRef}
          role="listbox"
          aria-label={label}
          aria-multiselectable="true"
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
          {options.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-400">No people to assign</li>
          ) : options.map((opt) => {
            const isOn = values.some((v) => sameValue(v, opt.value));
            return (
              <li key={String(opt.value)} role="presentation">
                <button
                  type="button"
                  role="option"
                  data-value={String(opt.value)}
                  aria-selected={isOn}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm ${
                    isOn ? 'bg-rose-50 font-medium text-slate-900' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                  onClick={() => toggle(opt)}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{opt.label}</span>
                    {opt.hint ? <span className="block text-xs font-normal text-slate-400">{opt.hint}</span> : null}
                  </span>
                  {isOn ? <Check size={14} className="shrink-0 text-brand-500" /> : <span className="w-3.5 shrink-0" />}
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
