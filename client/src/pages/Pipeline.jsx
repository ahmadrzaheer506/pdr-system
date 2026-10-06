import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Check, ChevronDown, Clock, MapPin, Search, X } from 'lucide-react';
import { money, fmtTimeAgo, api } from '../lib/api';
import { EmptyState, PageLoading, Toast, useToast } from '../components/ui.jsx';
import LostReasonModal from '../components/LostReasonModal.jsx';
import { stallLevel, sumPipelineTotals } from '../lib/pipelineBoard.js';
import { leadPath } from '../lib/customerRoutes.js';
import { leadDisplayName } from '../lib/leads.js';
import SelectMenu from '../components/SelectMenu.jsx';
import DatePicker from '../components/DatePicker.jsx';

const COL_META = {
  ENQUIRY: { color: '#64748b', wash: 'bg-slate-50' },
  SITE_VISIT_BOOKED: { color: '#0284c7', wash: 'bg-sky-50' },
  QUOTE_PENDING: { color: '#d97706', wash: 'bg-amber-50' },
  QUOTED: { color: '#4f46e5', wash: 'bg-indigo-50' },
  FOLLOW_UP: { color: '#9333ea', wash: 'bg-purple-50' },
  WON: { color: '#059669', wash: 'bg-emerald-50' },
  LOST: { color: '#e11d48', wash: 'bg-rose-50' },
  SCHEDULED: { color: '#0891b2', wash: 'bg-cyan-50' },
  IN_PROGRESS: { color: '#2563eb', wash: 'bg-blue-50' },
  COMPLETED: { color: '#0d9488', wash: 'bg-teal-50' },
  INVOICED: { color: '#ea580c', wash: 'bg-orange-50' },
  PAID: { color: '#16a34a', wash: 'bg-green-50' },
};

function findCardStage(boardData, cardId) {
  if (!boardData) return null;
  for (const s of boardData.stages) {
    if (boardData.board[s]?.some((c) => c.id === cardId)) return s;
  }
  return null;
}

function findCard(boardData, cardId) {
  if (!boardData) return null;
  for (const s of boardData.stages) {
    const card = boardData.board[s]?.find((c) => c.id === cardId);
    if (card) return card;
  }
  return null;
}

function cardCustomerId(card, fallbackId) {
  return card?.customer_id || fallbackId;
}

const SOURCE_OPTIONS = [
  { value: 'manual', label: 'Manual' },
  { value: 'phone', label: 'Phone' },
  { value: 'email', label: 'Email' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'facebook_lead', label: 'Facebook lead' },
  { value: 'sms', label: 'SMS' },
  { value: 'website', label: 'Website' },
  { value: 'referral', label: 'Referral' },
];

function boardQuery(params) {
  const qs = params.toString();
  return `/customers/pipeline/board${qs ? `?${qs}` : ''}`;
}

function SourceMultiSelect({ selected, onToggle, onClearOne, onClearAll }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const chosen = SOURCE_OPTIONS.filter((s) => selected.includes(s.value));

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onEsc = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div className="text-xs text-slate-500 flex flex-col gap-1 min-w-[220px] w-72 max-w-full" ref={rootRef}>
      Source
      <div className="relative">
        <div
          className={`flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-sm text-slate-700 transition-colors ${
            open ? 'border-slate-400 ring-2 ring-slate-200' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
          }`}
          role="combobox"
          aria-label="Filter by source"
          aria-expanded={open}
          aria-haspopup="listbox"
          tabIndex={0}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setOpen((v) => !v);
            }
          }}
        >
          <div className="flex-1 min-w-0 flex items-center gap-1 flex-wrap">
            {chosen.length === 0 ? (
              <span className="text-sm font-normal text-slate-500">All sources</span>
            ) : (
              chosen.map((s) => (
                <span
                  key={s.value}
                  className="inline-flex items-center gap-1 rounded-md bg-slate-100 text-slate-700 pl-2 pr-0.5 py-0.5 text-[11px] font-medium"
                >
                  {s.label}
                  <button
                    type="button"
                    aria-label={`Remove ${s.label}`}
                    className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClearOne(s.value);
                    }}
                  >
                    <X size={11} />
                  </button>
                </span>
              ))
            )}
          </div>
          {chosen.length > 0 ? (
            <button
              type="button"
              aria-label="Clear sources"
              className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              onClick={(e) => {
                e.stopPropagation();
                onClearAll();
              }}
            >
              <X size={14} />
            </button>
          ) : null}
          <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
        {open && (
          <div
            className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
            role="listbox"
            aria-multiselectable="true"
            aria-label="Sources"
          >
            {SOURCE_OPTIONS.map((s) => {
              const on = selected.includes(s.value);
              return (
                <button
                  key={s.value}
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => onToggle(s.value)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm ${
                    on ? 'bg-slate-50 font-medium text-slate-900' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    on ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-300 bg-white'
                  }`}>
                    {on ? <Check size={11} strokeWidth={3} /> : null}
                  </span>
                  {s.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function PipelineFilters({ params, setParams, owners, customers }) {
  const sources = params.getAll('source');
  const ownerId = params.get('owner_id') || '';
  const customerId = params.get('customer_id') || '';
  const createdFrom = params.get('created_from') || '';
  const createdTo = params.get('created_to') || '';
  const urlMin = params.get('value_min') || '';
  const urlMax = params.get('value_max') || '';
  const urlQ = params.get('q') || '';
  const [minDraft, setMinDraft] = useState(urlMin);
  const [maxDraft, setMaxDraft] = useState(urlMax);
  const [qDraft, setQDraft] = useState(urlQ);
  const [open, setOpen] = useState(true);
  const minTimer = useRef(null);
  const maxTimer = useRef(null);
  const qTimer = useRef(null);

  useEffect(() => { setMinDraft(urlMin); }, [urlMin]);
  useEffect(() => { setMaxDraft(urlMax); }, [urlMax]);
  useEffect(() => { setQDraft(urlQ); }, [urlQ]);

  const write = (mutate) => {
    const next = new URLSearchParams(params);
    mutate(next);
    setParams(next, { replace: true });
  };

  const setSources = (selected) => {
    write((next) => {
      next.delete('source');
      selected.forEach((s) => next.append('source', s));
    });
  };

  const toggleSource = (value) => {
    const selected = sources.includes(value)
      ? sources.filter((s) => s !== value)
      : [...sources, value];
    setSources(selected);
  };

  const setScalar = (key, value) => {
    write((next) => {
      if (value) next.set(key, value);
      else next.delete(key);
    });
  };

  const debounceScalar = (key, value, timerRef) => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setScalar(key, value), 250);
  };

  const clearFilters = () => {
    clearTimeout(minTimer.current);
    clearTimeout(maxTimer.current);
    clearTimeout(qTimer.current);
    setMinDraft('');
    setMaxDraft('');
    setQDraft('');
    setParams({}, { replace: true });
  };

  const filterCount = [
    sources.length > 0,
    !!ownerId,
    !!customerId,
    !!createdFrom,
    !!createdTo,
    !!urlMin,
    !!urlMax,
    !!urlQ.trim(),
  ].filter(Boolean).length;
  const filtered = filterCount > 0;

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
          aria-controls="pipeline-filters"
          aria-label={open ? 'Hide filters' : 'Show filters'}
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronDown
            size={16}
            className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          />
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Filters</span>
          {!open && filtered ? (
            <span className="truncate text-xs font-medium text-slate-500">
              {filterCount} active{urlQ.trim() ? ` · “${urlQ.trim()}”` : ''}
            </span>
          ) : null}
        </button>
        {filtered ? (
          <button
            type="button"
            className="shrink-0 text-xs font-medium text-brand-600 hover:text-brand-700"
            onClick={clearFilters}
          >
            Clear filters
          </button>
        ) : null}
      </div>
      {open ? (
        <div id="pipeline-filters" className="space-y-3 border-t border-slate-100 px-3 py-3">
          <div className="flex items-end gap-2 flex-wrap">
            <label className="text-xs text-slate-500 flex flex-col gap-1 min-w-[220px] w-72 max-w-full">
              Search
              <div className="relative">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  className="input !pl-9 w-full"
                  placeholder="Name, phone, email…"
                  value={qDraft}
                  onChange={(e) => {
                    const v = e.target.value;
                    setQDraft(v);
                    debounceScalar('q', v.trim(), qTimer);
                  }}
                  aria-label="Search pipeline"
                />
              </div>
            </label>
            <SourceMultiSelect
              selected={sources}
              onToggle={toggleSource}
              onClearOne={(value) => setSources(sources.filter((s) => s !== value))}
              onClearAll={() => setSources([])}
            />
            <label className="text-xs text-slate-500 flex flex-col gap-1">
              Owner
              <SelectMenu
                className="w-44"
                label="Filter by owner"
                value={ownerId}
                onChange={(next) => setScalar('owner_id', next)}
                options={[
                  { value: '', label: 'All owners' },
                  { value: 'unassigned', label: 'Unassigned' },
                  ...(owners || []).map((o) => ({ value: String(o.id), label: o.name })),
                ]}
              />
            </label>
            <label className="text-xs text-slate-500 flex flex-col gap-1">
              Customer
              <SelectMenu
                className="w-56"
                label="Filter by customer"
                value={customerId}
                onChange={(next) => setScalar('customer_id', next)}
                options={[
                  { value: '', label: 'All customers' },
                  ...(customers || []).map((c) => ({
                    value: String(c.id),
                    label: c.company_name ? `${c.name} · ${c.company_name}` : c.name,
                  })),
                ]}
              />
            </label>
            <label className="text-xs text-slate-500 flex flex-col gap-1">
              Created from
              <DatePicker
                className="w-40"
                label="Created from"
                value={createdFrom}
                onChange={(next) => setScalar('created_from', next)}
                placeholder="Any date"
              />
            </label>
            <label className="text-xs text-slate-500 flex flex-col gap-1">
              Created to
              <DatePicker
                className="w-40"
                label="Created to"
                value={createdTo}
                onChange={(next) => setScalar('created_to', next)}
                placeholder="Any date"
              />
            </label>
            <label className="text-xs text-slate-500 flex flex-col gap-1">
              Quote min £
              <input
                className="input w-28"
                type="number"
                min="0"
                step="1"
                inputMode="decimal"
                placeholder="Any"
                value={minDraft}
                onChange={(e) => {
                  const v = e.target.value;
                  setMinDraft(v);
                  debounceScalar('value_min', v, minTimer);
                }}
                aria-label="Minimum quote value"
              />
            </label>
            <label className="text-xs text-slate-500 flex flex-col gap-1">
              Quote max £
              <input
                className="input w-28"
                type="number"
                min="0"
                step="1"
                inputMode="decimal"
                placeholder="Any"
                value={maxDraft}
                onChange={(e) => {
                  const v = e.target.value;
                  setMaxDraft(v);
                  debounceScalar('value_max', v, maxTimer);
                }}
                aria-label="Maximum quote value"
              />
            </label>
          </div>
          <p className="text-[11px] text-slate-400">Quote range uses the latest quote on each card. Cards with no quote drop out when a minimum is set.</p>
        </div>
      ) : null}
    </div>
  );
}

const SOURCE_BADGE = {
  whatsapp: 'bg-green-50 text-green-700',
  facebook: 'bg-blue-50 text-blue-700',
  facebook_lead: 'bg-blue-50 text-blue-700',
  email: 'bg-purple-50 text-purple-700',
  phone: 'bg-amber-50 text-amber-700',
  sms: 'bg-pink-50 text-pink-700',
  website: 'bg-sky-50 text-sky-700',
  referral: 'bg-teal-50 text-teal-700',
  manual: 'bg-slate-100 text-slate-600',
};

function sourceLabel(source) {
  return String(source || '').replace(/_/g, ' ');
}

function cardPlace(customer) {
  return [customer.address, customer.postcode].filter(Boolean).join(', ');
}

/** Kanban card — same fields as before, easier to scan (requirement 4.1). */
function PipelineCard({ customer, accent, onDragStart, onDragOverCard, onDropOnCard }) {
  const ago = fmtTimeAgo(customer.updated_at);
  const place = cardPlace(customer);
  const source = sourceLabel(customer.source);
  const stall = stallLevel(customer.updated_at, customer.stage);
  const stallClass = stall === 'red' ? 'text-rose-600' : stall === 'amber' ? 'text-amber-700' : 'text-slate-400';
  const href = leadPath(customer.customer_id || customer.id, 'pipeline', customer.lead_id || customer.id);
  return (
    <div
      draggable
      data-customer-id={customer.id}
      onDragStart={(e) => {
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
        onDragStart(customer.id);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDragOverCard();
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDropOnCard(customer.id);
      }}
      className="card p-0 overflow-hidden hover:shadow-md hover:border-brand-300 transition-all cursor-grab active:cursor-grabbing group"
    >
      <Link to={href} className="block">
        <div className="h-1" style={{ background: accent }} />
        <div className="p-3 pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="font-semibold text-sm text-slate-900 leading-snug group-hover:text-brand-600 line-clamp-2">{leadDisplayName(customer)}</div>
            {Number(customer.pipeline_value || 0) > 0 ? (
              <div className="text-sm font-bold tabular-nums text-slate-900 flex-shrink-0">{money(customer.pipeline_value)}</div>
            ) : null}
          </div>
          {place ? (
            <div className="flex items-start gap-1 text-xs text-slate-500 mt-1">
              <MapPin size={12} className="mt-0.5 flex-shrink-0 text-slate-400" />
              <span className="line-clamp-2">{place}</span>
            </div>
          ) : null}
          <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
            {source ? (
              <span className={`badge !text-[10px] !px-1.5 capitalize ${SOURCE_BADGE[customer.source] || 'bg-slate-100 text-slate-600'}`}>
                {source}
              </span>
            ) : null}
            {customer.open_tasks > 0 && (
              <span className="badge bg-amber-100 text-amber-700 !text-[10px] !px-1.5">
                {customer.open_tasks} task{customer.open_tasks > 1 ? 's' : ''}
              </span>
            )}
            {stall ? (
              <span className={`badge !text-[10px] !px-1.5 ${stall === 'red' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'}`}>
                Stalled
              </span>
            ) : null}
          </div>
          {ago ? (
            <div className={`mt-2 pt-2 border-t border-slate-100 inline-flex items-center gap-1 text-[11px] ${stallClass}`}>
              <Clock size={11} /> Updated {ago}
            </div>
          ) : null}
        </div>
      </Link>
      <div className="px-3 pb-3">
        <Link
          to={href}
          className="btn-secondary !py-1 !px-2 text-xs w-full inline-flex items-center justify-center gap-1"
          onMouseDown={(e) => e.stopPropagation()}
        >
          Go to lead
          <ArrowRight size={12} />
        </Link>
      </div>
    </div>
  );
}

export default function Pipeline() {
  const [params, setParams] = useSearchParams();
  const queryKey = params.toString();
  const [data, setData] = useState(null);
  const [dragCard, setDragCard] = useState(null);
  const dragCardRef = useRef(null);
  const [overStage, setOverStage] = useState(null);
  const [pendingLost, setPendingLost] = useState(null);
  const [lostSaving, setLostSaving] = useState(false);
  const { toast, show } = useToast();

  const load = () => api.get(boardQuery(params)).then(setData).catch((err) => {
    show(err.message, 'error');
    setData((current) => current || { stages: [], labels: {}, board: {}, owners: [], customers: [], totals: { board: 0, byStage: {} } });
  });
  useEffect(() => { load(); }, [queryKey]);

  const startDrag = (id) => { dragCardRef.current = id; setDragCard(id); };
  const endDrag = () => { setOverStage(null); };

  const applyLocalMove = (d, customerId, toStage, beforeId) => {
    const next = { ...d, board: { ...d.board } };
    let card = null;
    for (const s of d.stages) {
      const list = next.board[s] || [];
      const idx = list.findIndex((c) => c.id === customerId);
      if (idx > -1) {
        card = list[idx];
        next.board[s] = list.filter((c) => c.id !== customerId);
        break;
      }
    }
    if (!card) return d;
    const dest = [...(next.board[toStage] || [])];
    let at = dest.length;
    if (beforeId != null) {
      const i = dest.findIndex((c) => c.id === beforeId);
      if (i >= 0) at = i;
    }
    dest.splice(at, 0, { ...card, stage: toStage });
    next.board[toStage] = dest;
    next.totals = sumPipelineTotals(next.board, next.stages);
    return next;
  };

  const moveStage = async (cardId, toStage, extra = {}) => {
    const from = findCardStage(data, cardId);
    const beforeId = extra.before_id ?? extra.beforeId ?? null;
    const card = findCard(data, cardId);
    const customerId = cardCustomerId(card, cardId);
    setData((d) => applyLocalMove(d, cardId, toStage, beforeId));
    try {
      await api.put(`/customers/${customerId}/stage`, { stage: toStage, lead_id: cardId, ...extra });
      const label = data?.labels?.[toStage] || toStage.replace(/_/g, ' ');
      show(from === toStage ? 'Order updated' : `Moved to ${label}`);
    } catch (err) {
      show(err.message, 'error');
      load();
    }
  };

  const requestMove = (customerId, toStage, beforeId = null) => {
    if (!customerId) return;
    if (beforeId != null && Number(beforeId) === Number(customerId)) return;
    const from = findCardStage(data, customerId);
    if (toStage === 'LOST' && from !== 'LOST') {
      setPendingLost({ id: customerId, beforeId });
      return;
    }
    moveStage(customerId, toStage, { before_id: beforeId });
  };

  const confirmLost = async (payload) => {
    const pending = pendingLost;
    setLostSaving(true);
    try {
      await moveStage(pending.id, 'LOST', { ...payload, before_id: pending.beforeId });
      setPendingLost(null);
    } finally {
      setLostSaving(false);
    }
  };

  if (!data) return <PageLoading />;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900">Pipeline</h1>
          <p className="text-slate-500 text-sm mt-0.5">Drag a card to any stage, or drop it on another card to reorder. Open a card for full detail.</p>
          <p className="text-sm font-semibold tabular-nums text-slate-800 mt-1.5" data-testid="pipeline-value">
            Pipeline value {money(data.totals?.board || 0)}
          </p>
        </div>
      </div>
      <PipelineFilters params={params} setParams={setParams} owners={data.owners} customers={data.customers} />
      {data.stages.length === 0 ? (
        <EmptyState title="Pipeline could not be loaded" detail="Try refreshing. If this keeps happening, check you are signed in as office." />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0">
          {data.stages.map((stage) => {
            const meta = COL_META[stage] || { color: '#64748b', wash: 'bg-slate-50' };
            const cards = data.board[stage] || [];
            const highlighted = overStage === stage;
            const columnValue = data.totals?.byStage?.[stage];
            return (
              <div
                key={stage}
                data-stage={stage}
                className={`flex-shrink-0 w-72 rounded-xl transition-shadow ${highlighted ? 'ring-2 ring-[#dc1114] ring-offset-2' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setOverStage(stage); }}
                onDrop={() => {
                  requestMove(dragCardRef.current || dragCard, stage, null);
                  endDrag();
                }}
                onDragEnd={endDrag}
              >
                <div className={`rounded-xl border ${highlighted ? 'border-[#dc1114]' : 'border-slate-200/80'} ${meta.wash} p-2 min-h-[calc(100vh-220px)]`}>
                  <div className="flex items-center gap-2 mb-1 px-1">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: meta.color }} />
                    <h3 className="font-semibold text-sm text-slate-800 truncate">{data.labels[stage]}</h3>
                    <span className="text-[11px] font-semibold tabular-nums text-slate-600 bg-white/80 border border-slate-200/80 rounded-full px-1.5 py-0.5 ml-auto">
                      {cards.length}
                    </span>
                  </div>
                  {columnValue != null ? (
                    <div className="text-[11px] font-semibold tabular-nums text-slate-700 px-1 mb-2" data-stage-value={stage}>
                      {money(columnValue)}
                    </div>
                  ) : (
                    <div className="mb-2" />
                  )}
                  <div className="kanban-col space-y-2 max-h-[calc(100vh-268px)] overflow-y-auto pr-0.5">
                    {cards.map((c) => (
                      <PipelineCard
                        key={c.id}
                        accent={meta.color}
                        customer={c}
                        onDragStart={startDrag}
                        onDragOverCard={() => setOverStage(stage)}
                        onDropOnCard={(beforeId) => {
                          requestMove(dragCardRef.current || dragCard, stage, beforeId);
                          endDrag();
                        }}
                      />
                    ))}
                    {cards.length === 0 && (
                      <div className="text-xs text-slate-400 text-center py-8 border border-dashed border-slate-200 bg-white/60 rounded-lg">
                        No customers
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <LostReasonModal
        open={pendingLost != null}
        onClose={() => setPendingLost(null)}
        onConfirm={confirmLost}
        saving={lostSaving}
      />
      <Toast {...toast} />
    </div>
  );
}
