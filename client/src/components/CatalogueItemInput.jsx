import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Plus } from 'lucide-react';
import { catalogueHint, matchCatalogueItems, suggestCatalogueId } from '../lib/catalogueSearch';
import CatalogueItemForm from './CatalogueItemForm.jsx';

/**
 * Combobox for a quote line name: type to search the catalogue, or keep the typed name.
 */
export default function CatalogueItemInput({
  id,
  label,
  value,
  onChange,
  onPick,
  catalogue = [],
  placeholder = 'Search or type an item',
  required = false,
  canCreate = true,
  vatRates = [],
  lineDefaults = null,
  onCreated,
}) {
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState(null);
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const menuRef = useRef(null);
  const [coords, setCoords] = useState(null);
  const matches = useMemo(() => matchCatalogueItems(catalogue, value), [catalogue, value]);
  const hasCustom = Boolean(String(value || '').trim()) && matches.length === 0;

  const place = () => {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.max(r.width, 220);
    const rows = Math.max(matches.length, hasCustom ? 1 : 1);
    const estimatedH = Math.min(rows * 56 + 8, 320);
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
  }, [open, matches.length, hasCustom]);

  useEffect(() => {
    setActive(0);
  }, [value, open]);

  const pick = (row) => {
    onPick?.(row);
    setOpen(false);
  };

  const openCreate = () => {
    const description = String(value || '').trim();
    setOpen(false);
    setCreateDraft({
      id: suggestCatalogueId(description),
      description,
      unit: lineDefaults?.unit || 'item',
      unit_price: Number(lineDefaults?.unit_price) || 0,
      vat_code: lineDefaults?.vat_code || 'standard',
      kind: lineDefaults?.kind === 'labour' || lineDefaults?.kind === 'materials' || lineDefaults?.kind === 'both'
        ? lineDefaults.kind
        : 'materials',
    });
    setCreateOpen(true);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setActive((i) => Math.min(i + 1, Math.max(matches.length - 1, 0)));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter' && open) {
      e.preventDefault();
      const row = matches[active];
      if (row) pick(row);
      else setOpen(false);
    }
  };

  return (
    <div className="relative" ref={rootRef}>
      <div className="relative">
        <input
          id={id}
          ref={inputRef}
          className="input pr-8"
          value={value}
          required={required}
          placeholder={placeholder}
          autoComplete="off"
          aria-label={label}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-haspopup="listbox"
          role="combobox"
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        <ChevronDown
          size={15}
          className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
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
          {matches.length === 0 ? (
            <li className="px-2 py-2 text-sm text-slate-500">
              {String(value || '').trim()
                ? (
                  <div className="space-y-2">
                    <p className="px-1.5 text-xs leading-relaxed text-slate-500">
                      Nothing in the catalogue matches this. You can keep it as a one-off line, or add it below.
                    </p>
                    {canCreate ? (
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ring-1 ring-slate-200/90 transition-colors hover:bg-slate-50 hover:ring-slate-300"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={openCreate}
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-700 ring-1 ring-rose-100">
                          <Plus size={16} strokeWidth={2.25} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-900" title={String(value).trim()}>
                            Create catalogue item “{String(value).trim()}”
                          </span>
                          <span className="mt-0.5 block text-xs font-normal text-slate-500">
                            Save this name to the catalogue, then use it on this line
                          </span>
                        </span>
                      </button>
                    ) : null}
                  </div>
                )
                : 'Type to search the catalogue, or enter a custom name'}
            </li>
          ) : matches.map((row, i) => {
            const selected = i === active;
            const hint = catalogueHint(row);
            return (
              <li key={String(row.id || row.description)} role="presentation">
                <button
                  type="button"
                  role="option"
                  data-value={String(row.id || '')}
                  aria-label={row.description}
                  aria-selected={selected}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left ${
                    selected ? 'bg-rose-50 font-medium text-slate-900' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(row)}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{row.description}</span>
                    {hint ? <span className="block truncate text-xs font-normal text-slate-400">{hint}</span> : null}
                  </span>
                  {selected ? <Check size={14} className="shrink-0 text-brand-500" /> : <span className="w-3.5 shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>,
        document.body,
      )}
      <CatalogueItemForm
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        initial={createDraft}
        vatRates={vatRates}
        zClass="z-[130]"
        onSaved={(item) => {
          if (!item) return;
          onCreated?.(item);
          onPick?.(item);
        }}
      />
    </div>
  );
}
