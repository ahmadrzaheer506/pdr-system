import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

function sameValue(a, b) {
  return String(a) === String(b);
}

/**
 * Catalogue-style listbox used across Settings (and any labelled filter/form field).
 * Portals the menu so it is not clipped inside modals.
 */
export default function SelectMenu({
  id,
  label,
  value,
  onChange,
  options,
  disabled = false,
  required = false,
  invalid = false,
  className = '',
  align = 'left',
  size = 'md',
  multiline = false,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const [coords, setCoords] = useState(null);
  const current = options.find((opt) => sameValue(opt.value, value)) || options[0];
  const compact = size === 'sm';
  const detailed = Boolean(multiline || options.some((opt) => opt.hint));

  const place = () => {
    const btn = buttonRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const width = Math.max(r.width, size === 'sm' ? r.width : 152);
    const rowH = compact ? 32 : detailed ? 52 : 40;
    const estimatedH = Math.min(options.length * rowH + 8, 280);
    const openUp = window.innerHeight - r.bottom < estimatedH && r.top > estimatedH;
    setCoords({
      top: openUp ? undefined : r.bottom + 4,
      bottom: openUp ? window.innerHeight - r.top + 4 : undefined,
      left: align === 'right' ? r.right - width : r.left,
      width,
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
  }, [open, align, options.length, size]);

  return (
    <div className={`relative min-w-0 ${className}`} ref={rootRef}>
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
      <button
        type="button"
        id={id}
        ref={buttonRef}
        disabled={disabled}
        data-value={value == null ? '' : String(value)}
        aria-label={label}
        aria-required={required || undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => { if (!disabled) setOpen((v) => !v); }}
        className={`inline-flex w-full min-w-0 max-w-full justify-between gap-2 rounded-lg border bg-white text-slate-700 transition-colors ${
          compact ? 'h-8 items-center px-2 text-xs' : (multiline || current?.hint)
            ? 'min-h-11 items-start px-3 py-2 text-sm'
            : 'h-10 items-center px-3 text-sm'
        } ${
          disabled ? 'cursor-not-allowed opacity-60' : ''
        } ${
          open ? 'border-slate-400 ring-2 ring-slate-200' : invalid
            ? 'border-rose-400 ring-2 ring-rose-100'
            : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
        }`}
      >
        <span className="min-w-0 flex-1 overflow-hidden text-left">
          <span className={`block ${multiline ? 'whitespace-normal break-words leading-snug' : 'truncate'}`}>
            {current?.label || '—'}
          </span>
          {current?.hint ? (
            <span className="mt-0.5 block truncate text-[11px] font-normal text-slate-400">{current.hint}</span>
          ) : null}
        </span>
        <ChevronDown size={compact ? 13 : 15} className={`mt-0.5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && coords && createPortal(
        <ul
          ref={menuRef}
          role="listbox"
          aria-label={label}
          className="overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          style={{
            position: 'fixed',
            top: coords.top,
            bottom: coords.bottom,
            left: coords.left,
            width: coords.width,
            zIndex: 200,
            maxHeight: 280,
            overflowY: 'auto',
          }}
        >
          {options.map((opt) => {
            const selected = sameValue(opt.value, value);
            return (
              <li key={String(opt.value)} role="presentation">
                <button
                  type="button"
                  role="option"
                  data-value={String(opt.value)}
                  aria-selected={selected}
                  className={`flex w-full items-start justify-between gap-3 text-left ${
                    compact ? 'px-2 py-1.5 text-xs' : 'px-3 py-2 text-sm'
                  } ${
                    selected ? 'bg-slate-50 font-medium text-slate-900' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  <span className="min-w-0">
                    <span className="block whitespace-normal break-words">{opt.label}</span>
                    {opt.hint ? (
                      <span className="mt-0.5 block text-[11px] font-normal text-slate-400">{opt.hint}</span>
                    ) : null}
                  </span>
                  {selected ? <Check size={14} className="mt-0.5 shrink-0 text-brand-500" /> : <span className="w-3.5 shrink-0" />}
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
