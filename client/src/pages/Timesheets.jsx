import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock, MapPin, AlertTriangle, Check, Download, TrendingUp, TrendingDown, Radio, Square, Coffee, X, Pencil, Layers, CheckCircle2, XCircle } from 'lucide-react';
import { api, money, fmtDate } from '../lib/api';
import { formatClockTime } from '../lib/clockTime';
import { PageLoading, StatusBadge, Avatar, EmptyState, Modal, useToast, Toast } from '../components/ui.jsx';
import { useAuth } from '../lib/auth.jsx';
import { canSeeLabourCosts, ROLES } from '../lib/roles';
import DatePicker from '../components/DatePicker.jsx';
import SelectMenu from '../components/SelectMenu.jsx';

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Split an API timestamp into local YYYY-MM-DD and HH:MM for the edit pickers. */
function splitLocalDateTime(value) {
  if (!value) return { date: '', time: '' };
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  return {
    date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
  };
}

/** Combine picker values into an ISO timestamp the timesheet API accepts. */
function joinLocalDateTime(date, time) {
  if (!date || !time) return '';
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const clock = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!day || !clock) return '';
  const dt = new Date(
    Number(day[1]),
    Number(day[2]) - 1,
    Number(day[3]),
    Number(clock[1]),
    Number(clock[2]),
    0,
    0,
  );
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toISOString();
}

const TABS = [
  { id: 'live', label: 'On the clock' },
  { id: 'review', label: 'Review & approve' },
  { id: 'totals', label: 'Weekly totals' },
  { id: 'costing', label: 'Job profitability' },
];
const LIVE_POLL_MS = 10000;

const REVIEW_VIEWS = [
  {
    id: 'ALL',
    label: 'All shifts',
    countKey: 'all',
    Icon: Layers,
    rail: 'bg-slate-400',
    iconWrap: 'bg-slate-100 text-slate-600',
    active: 'bg-slate-50 ring-2 ring-slate-400/70',
    idle: 'bg-white hover:bg-slate-50/80',
  },
  {
    id: 'completed',
    label: 'Awaiting approval',
    countKey: 'completed',
    Icon: Clock,
    rail: 'bg-amber-400',
    iconWrap: 'bg-amber-100 text-amber-700',
    active: 'bg-amber-50 ring-2 ring-amber-400/80',
    idle: 'bg-white hover:bg-amber-50/50',
  },
  {
    id: 'flagged',
    label: 'Flagged',
    countKey: 'flagged',
    Icon: AlertTriangle,
    rail: 'bg-orange-400',
    iconWrap: 'bg-orange-100 text-orange-700',
    active: 'bg-orange-50 ring-2 ring-orange-400/80',
    idle: 'bg-white hover:bg-orange-50/50',
  },
  {
    id: 'approved',
    label: 'Approved',
    countKey: 'approved',
    Icon: CheckCircle2,
    rail: 'bg-emerald-400',
    iconWrap: 'bg-emerald-100 text-emerald-700',
    active: 'bg-emerald-50 ring-2 ring-emerald-400/80',
    idle: 'bg-white hover:bg-emerald-50/50',
  },
  {
    id: 'rejected',
    label: 'Rejected',
    countKey: 'rejected',
    Icon: XCircle,
    rail: 'bg-rose-400',
    iconWrap: 'bg-rose-100 text-rose-700',
    active: 'bg-rose-50 ring-2 ring-rose-400/80',
    idle: 'bg-white hover:bg-rose-50/50',
  },
];

const REVIEW_STATUS_OPTIONS = [
  { value: 'ALL', label: 'All statuses' },
  { value: 'completed', label: 'Awaiting approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'active', label: 'On the clock' },
  { value: 'flagged', label: 'Flagged' },
];

const TOTALS_FOCUS_OPTIONS = [
  { value: 'ALL', label: 'All rows' },
  { value: 'worked', label: 'Worked this period' },
  { value: 'pending', label: 'Pending approval' },
  { value: 'flagged', label: 'Flagged' },
];

function matchesTotalsFocus(row, focus) {
  if (!focus || focus === 'ALL') return true;
  if (focus === 'worked') return Number(row.shifts) > 0 || Number(row.hours) > 0;
  if (focus === 'pending') return Number(row.awaiting_approval) > 0;
  if (focus === 'flagged') return Number(row.flagged) > 0;
  return true;
}

function matchesReviewView(row, view) {
  if (!view || view === 'ALL') return true;
  if (view === 'flagged') return Boolean(row.location_flag);
  return row.status === view;
}

function reviewCounts(rows) {
  const list = rows || [];
  return {
    all: list.length,
    completed: list.filter((t) => t.status === 'completed').length,
    flagged: list.filter((t) => t.location_flag).length,
    approved: list.filter((t) => t.status === 'approved').length,
    rejected: list.filter((t) => t.status === 'rejected').length,
    active: list.filter((t) => t.status === 'active').length,
  };
}

function timesheetListQuery(from, to, userId) {
  const params = new URLSearchParams({ from, to });
  if (userId) params.set('user_id', String(userId));
  return params.toString();
}

function timesheetCsvHref(from, to, { userId, statusView } = {}) {
  const params = new URLSearchParams({ from, to });
  if (userId) params.set('user_id', String(userId));
  if (statusView && statusView !== 'ALL' && statusView !== 'flagged') params.set('status', statusView);
  return `/api/timesheets/export.csv?${params.toString()}`;
}

function hrs(mins) {
  if (mins === null || mins === undefined) return '—';
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}
function weekAgo(n = 6) { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10); }
function today() { return new Date().toISOString().slice(0, 10); }

function elapsedLabel(fromSql) {
  if (!fromSql) return '0:00';
  const start = new Date(fromSql).getTime();
  if (!Number.isFinite(start)) return '0:00';
  const mins = Math.max(0, (Date.now() - start) / 60000);
  const h = Math.floor(mins / 60);
  const m = Math.floor(mins % 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}

export default function Timesheets() {
  const { user } = useAuth();
  const showCosts = canSeeLabourCosts(user);
  const [tab, setTab] = useState('live');
  const [from, setFrom] = useState(weekAgo(6));
  const [to, setTo] = useState(today());
  const { toast, show } = useToast();

  const tabs = showCosts ? TABS : TABS.filter((t) => t.id !== 'costing');
  useEffect(() => {
    if (!showCosts && tab === 'costing') setTab('review');
  }, [showCosts, tab]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Timesheets</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {tab === 'live' ? 'Who is on site now, and who on today\'s crew has not clocked in.' : 'Hours the lads have clocked, and what each job actually cost.'}
          </p>
        </div>
        {tab === 'costing' && (
          <div className="flex items-center gap-2 flex-wrap">
            <DatePicker
              className="w-40"
              size="sm"
              label="From"
              value={from}
              onChange={setFrom}
            />
            <span className="text-slate-400 text-sm">to</span>
            <DatePicker
              className="w-40"
              size="sm"
              label="To"
              value={to}
              onChange={setTo}
            />
            <a href={timesheetCsvHref(from, to)} className="btn-secondary !py-1.5">
              <Download size={15} /> CSV
            </a>
          </div>
        )}
      </div>

      <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1 w-fit">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-3.5 py-1.5 text-sm rounded-md font-medium ${tab === t.id ? 'bg-navy-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'live' && <LiveTab show={show} />}
      {tab === 'review' && <ReviewTab from={from} to={to} setFrom={setFrom} setTo={setTo} show={show} showCosts={showCosts} />}
      {tab === 'totals' && <TotalsTab from={from} to={to} setFrom={setFrom} setTo={setTo} showCosts={showCosts} />}
      {tab === 'costing' && showCosts && <CostingTab />}
      <Toast {...toast} />
    </div>
  );
}

function LiveTab({ show }) {
  const [board, setBoard] = useState(null);
  const [tick, setTick] = useState(0);
  const [clockOutRow, setClockOutRow] = useState(null);
  const [clockingOut, setClockingOut] = useState(false);

  const load = () => api.get('/timesheets/live').then(setBoard).catch(() => setBoard({ active: [], not_clocked_in: [] }));
  useEffect(() => {
    load();
    const poll = setInterval(load, LIVE_POLL_MS);
    return () => clearInterval(poll);
  }, []);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const closeClockOut = () => {
    if (clockingOut) return;
    setClockOutRow(null);
  };

  const forceOut = async () => {
    if (!clockOutRow || clockingOut) return;
    setClockingOut(true);
    try {
      await api.post(`/timesheets/${clockOutRow.id}/force-clockout`);
      show(`${clockOutRow.user_name} clocked out`);
      setClockOutRow(null);
      load();
    } catch (err) {
      show(err.message, 'error');
    } finally {
      setClockingOut(false);
    }
  };

  if (!board) return <PageLoading />;

  const active = board.active || [];
  const missing = board.not_clocked_in || [];

  return (
    <div className="space-y-6">
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Radio size={15} className="text-emerald-600 animate-pulse" />
          <h2 className="font-semibold text-slate-800">On the clock ({active.length})</h2>
        </div>
        {active.length === 0 ? (
          <div className="card">
            <EmptyState icon={Radio} title="Nobody on the clock" detail="Open shifts appear here as soon as someone clocks in." />
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {active.map((a) => (
              <div key={a.id} className={`card p-4 ${a.break_started_at ? 'border-amber-200 bg-amber-50/40' : 'border-emerald-200 bg-emerald-50/40'}`}>
                <div className="flex items-start gap-2.5">
                  <Avatar name={a.user_name} color={a.color} size={9} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-800 truncate">{a.user_name}</div>
                    <div className="text-xs text-slate-500 truncate">{a.job_title || 'yard / travel'}</div>
                    <div className={`text-2xl font-bold tabular-nums mt-1 ${a.break_started_at ? 'text-amber-700' : 'text-emerald-700'}`} data-tick={tick}>
                      {elapsedLabel(a.clock_in)}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      since {formatClockTime(a.clock_in)}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {a.break_started_at && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-800 bg-amber-100 rounded-full px-2 py-0.5">
                          <Coffee size={11} /> on break
                        </span>
                      )}
                      {a.location_flag === 'far_from_site' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-800 bg-amber-100 rounded-full px-2 py-0.5">
                          <AlertTriangle size={11} /> {a.in_distance_m != null ? `${a.in_distance_m}m off site` : 'far from site'}
                        </span>
                      )}
                      {a.location_flag === 'no_location' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-slate-100 rounded-full px-2 py-0.5">
                          <MapPin size={11} /> no location
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setClockOutRow(a)}
                  aria-label={`Clock out ${a.user_name}`}
                  className="btn-secondary w-full mt-3 !py-1.5 text-xs"
                >
                  <Square size={13} /> Clock out
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-semibold text-slate-800 mb-1">Not clocked in ({missing.length})</h2>
        <p className="text-xs text-slate-500 mb-3">On today&apos;s crew, with no open shift.</p>
        {missing.length === 0 ? (
          <div className="card px-4 py-3 text-sm text-slate-500">
            Everyone expected today is on the clock — or nobody is assigned to a crew today.
          </div>
        ) : (
          <div className="card divide-y divide-slate-100">
            {missing.map((p) => (
              <div key={p.user_id} className="flex items-center gap-2.5 px-4 py-2.5">
                <Avatar name={p.user_name} color={p.color} size={7} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm text-slate-800 truncate">{p.user_name}</div>
                  <div className="text-xs text-slate-500 truncate">{(p.jobs || []).join(' · ') || 'Assigned today'}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <Modal
        open={!!clockOutRow}
        onClose={closeClockOut}
        title="Clock out"
        footer={(
          <>
            <button type="button" className="btn-secondary" disabled={clockingOut} onClick={closeClockOut}>
              Cancel
            </button>
            <button type="button" className="btn-primary" disabled={clockingOut} onClick={forceOut}>
              {clockingOut ? 'Clocking out…' : 'Confirm clock out'}
            </button>
          </>
        )}
      >
        <p className="text-sm text-slate-600">
          Clock {clockOutRow?.user_name} out now? This closes their open shift.
        </p>
        {clockOutRow?.job_title ? (
          <p className="mt-1.5 text-xs text-slate-500">{clockOutRow.job_title}</p>
        ) : null}
      </Modal>
    </div>
  );
}

function actionBtnClass(tone) {
  const base = 'inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium transition-colors';
  if (tone === 'approve') {
    return `${base} border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100`;
  }
  if (tone === 'reject') {
    return `${base} border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100`;
  }
  return `${base} border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900`;
}

function flagIconClass(tone) {
  const base = 'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border cursor-help';
  if (tone === 'warn') return `${base} border-amber-200 bg-amber-50 text-amber-700`;
  if (tone === 'edit') return `${base} border-sky-200 bg-sky-50 text-sky-700`;
  if (tone === 'reject') return `${base} border-rose-200 bg-rose-50 text-rose-700`;
  return `${base} border-slate-200 bg-slate-50 text-slate-500`;
}

function FlagIconTip({ tone, icon: Icon, label, detail, chip = false }) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);

  const show = () => {
    const el = wrapRef.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const placeBelow = typeof window === 'undefined' || window.innerHeight - box.bottom > 96;
    const mid = box.left + box.width / 2;
    const half = 128;
    const maxLeft = typeof window === 'undefined' ? mid : window.innerWidth - half - 8;
    setCoords({
      top: placeBelow ? box.bottom + 8 : box.top - 8,
      left: Math.min(Math.max(half + 8, mid), maxLeft),
      place: placeBelow ? 'below' : 'above',
    });
    setOpen(true);
  };

  const hide = () => setOpen(false);

  return (
    <>
      <span
        ref={wrapRef}
        className="inline-flex"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        <button
          type="button"
          className={chip
            ? 'inline-flex max-w-[12rem] cursor-help truncate rounded-md bg-rose-50 px-2 py-0.5 text-left text-[11px] font-medium text-rose-700'
            : flagIconClass(tone)}
          aria-label={`${label}. ${detail}`}
        >
          {chip ? detail : <Icon size={13} aria-hidden="true" />}
        </button>
      </span>
      {open && coords && createPortal(
        <div
          role="tooltip"
          className="pointer-events-none w-max max-w-[16rem] rounded-lg bg-slate-900 px-2.5 py-1.5 text-left text-[11px] leading-snug text-white shadow-lg"
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            transform: coords.place === 'below' ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
            zIndex: 80,
          }}
        >
          <div className="font-semibold">{label}</div>
          <div className="mt-0.5 font-normal text-slate-200">{detail}</div>
        </div>,
        document.body,
      )}
    </>
  );
}

/**
 * Location and office-edit flags sit beside status as icons. Hover (or focus) shows the detail.
 * GPS is optional (9.2), far-from-site is warn-only, and edit_reason is the audit note from a correction.
 */
function TimesheetStatusFlags({ row }) {
  const flags = [];
  if (row.location_flag === 'far_from_site') {
    const metres = row.in_distance_m != null ? `${Math.round(Number(row.in_distance_m))}m off site` : 'off site';
    flags.push({
      key: 'far',
      tone: 'warn',
      icon: MapPin,
      label: 'Off site',
      detail: `Clocked in ${metres}. Warn only — the shift is still valid.`,
    });
  } else if (row.location_flag === 'no_location') {
    flags.push({
      key: 'gps',
      tone: 'muted',
      icon: MapPin,
      label: 'No location',
      detail: 'GPS was not captured. Location is optional — the shift is still valid.',
    });
  } else if (row.location_flag === 'over_max_hours') {
    flags.push({
      key: 'hours',
      tone: 'warn',
      icon: AlertTriangle,
      label: 'Long shift',
      detail: 'This shift exceeded the maximum hours rule.',
    });
  }
  if (row.status === 'rejected' && row.edit_reason) {
    flags.push({
      key: 'reject',
      tone: 'reject',
      icon: null,
      chip: true,
      label: 'Why it was rejected',
      detail: row.edit_reason,
    });
  } else if (row.status !== 'rejected' && row.edit_reason) {
    flags.push({
      key: 'edit',
      tone: 'edit',
      icon: Pencil,
      label: 'Edited',
      detail: `Office correction: ${row.edit_reason}`,
    });
  }
  if (!flags.length) return null;
  return (
    <>
      {flags.map((flag) => (
        <FlagIconTip
          key={flag.key}
          tone={flag.tone}
          icon={flag.icon}
          label={flag.label}
          detail={flag.detail}
          chip={flag.chip}
        />
      ))}
    </>
  );
}

function TimesheetRowActions({ row, onEdit, onApprove, onReject }) {
  if (row.status === 'rejected') {
    return <span className="text-xs text-slate-400">Can't edit</span>;
  }
  const canEdit = row.status === 'completed' || row.status === 'approved';
  const canReview = row.status === 'completed';
  if (!canEdit && !canReview) return null;
  return (
    <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
      {canEdit && (
        <button type="button" onClick={onEdit} className={actionBtnClass('edit')}>
          <Pencil size={13} aria-hidden="true" /> Edit
        </button>
      )}
      {canReview && (
        <>
          <button type="button" onClick={onApprove} className={actionBtnClass('approve')}>
            <Check size={13} aria-hidden="true" /> Approve
          </button>
          <button type="button" onClick={onReject} className={actionBtnClass('reject')}>
            <X size={13} aria-hidden="true" /> Reject
          </button>
        </>
      )}
    </div>
  );
}

function ReviewTab({ from, to, setFrom, setTo, show, showCosts }) {
  const [data, setData] = useState(null);
  const [staff, setStaff] = useState([]);
  const [staffId, setStaffId] = useState('');
  const [statusView, setStatusView] = useState('ALL');
  const [selected, setSelected] = useState([]);
  const [editRow, setEditRow] = useState(null);
  const [rejectRow, setRejectRow] = useState(null);

  const load = () => api.get(`/timesheets?${timesheetListQuery(from, to, staffId)}`)
    .then((d) => { setData(d); setSelected([]); })
    .catch(() => setData((current) => current || { timesheets: [] }));

  useEffect(() => { load(); }, [from, to, staffId]);
  useEffect(() => { setSelected([]); }, [statusView]);
  useEffect(() => {
    api.get('/settings/users')
      .then((d) => setStaff((d.users || []).filter((u) => u.role === ROLES.STAFF && u.active !== false)))
      .catch(() => setStaff([]));
  }, []);

  if (!data) return <PageLoading />;

  const rows = data.timesheets || [];
  const counts = reviewCounts(rows);
  const visible = rows.filter((t) => matchesReviewView(t, statusView));
  const pending = visible.filter((t) => t.status === 'completed');
  const filtering = Boolean(staffId || statusView !== 'ALL');
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const staffById = new Map(staff.map((u) => [String(u.id), u]));
  rows.forEach((t) => {
    if (t.user_id && t.user_name && !staffById.has(String(t.user_id))) {
      staffById.set(String(t.user_id), { id: t.user_id, name: t.user_name });
    }
  });
  const staffOptions = [
    { value: '', label: 'All staff' },
    ...[...staffById.values()]
      .sort((a, b) => String(a.name).localeCompare(String(b.name)))
      .map((u) => ({ value: String(u.id), label: u.name })),
  ];

  const approveBatch = async () => {
    try { await api.post('/timesheets/approve-batch', { ids: selected }); show(`${selected.length} approved`); load(); }
    catch (err) { show(err.message, 'error'); }
  };
  const approveOne = async (id) => {
    try { await api.post(`/timesheets/${id}/approve`); load(); }
    catch (err) { show(err.message, 'error'); }
  };
  const clearFilters = () => {
    setStaffId('');
    setStatusView('ALL');
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
        {REVIEW_VIEWS.map(({ id, label, countKey, Icon, rail, iconWrap, active, idle }) => {
          const selectedView = statusView === id;
          const count = counts[countKey] ?? 0;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setStatusView(id)}
              aria-pressed={selectedView}
              aria-label={`${count} ${label}`}
              className={`relative overflow-hidden rounded-2xl px-4 py-3.5 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 transition sm:flex-1 sm:min-w-[8.5rem] ${
                id === 'ALL' ? 'col-span-2 sm:col-auto' : ''
              } ${selectedView ? active : `${idle} ring-slate-200/70 hover:ring-slate-300`}`}
            >
              <span className={`absolute inset-x-0 top-0 h-0.5 ${rail}`} aria-hidden="true" />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className={`text-2xl font-semibold tabular-nums tracking-tight ${count === 0 && !selectedView ? 'text-slate-400' : 'text-slate-900'}`}>
                    {count}
                  </div>
                  <div className="mt-0.5 text-xs font-medium text-slate-500">{label}</div>
                </div>
                <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${iconWrap}`}>
                  <Icon size={15} strokeWidth={2} />
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-center gap-2">
          <SelectMenu
            className="w-44"
            label="Staff"
            value={staffId}
            onChange={setStaffId}
            options={staffOptions}
          />
          <SelectMenu
            className="w-48"
            label="Status"
            value={statusView}
            onChange={setStatusView}
            options={REVIEW_STATUS_OPTIONS}
          />
          <DatePicker
            className="w-40"
            size="sm"
            label="From"
            value={from}
            onChange={setFrom}
          />
          <span className="text-slate-400 text-sm">to</span>
          <DatePicker
            className="w-40"
            size="sm"
            label="To"
            value={to}
            onChange={setTo}
          />
          {filtering && (
            <button type="button" className="text-xs font-medium text-brand-600 hover:text-brand-700 px-1" onClick={clearFilters}>
              Clear filters
            </button>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {selected.length > 0 ? (
              <button type="button" onClick={approveBatch} className="btn-primary !py-1.5">
                <Check size={15} /> Approve {selected.length} selected
              </button>
            ) : pending.length > 0 ? (
              <button type="button" onClick={() => setSelected(pending.map((t) => t.id))} className="btn-secondary !py-1.5">
                Select all pending
              </button>
            ) : null}
            <a href={timesheetCsvHref(from, to, { userId: staffId, statusView })} className="btn-secondary !py-1.5">
              <Download size={15} /> CSV
            </a>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Clock} title="No shifts in this period" />
      ) : visible.length === 0 ? (
        <EmptyState icon={Clock} title="No matching shifts" detail="Try a different staff member, status, or date range." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="bg-slate-50/90 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="w-8 px-3 py-3"></th>
                  <th className="text-left px-3 py-3">Date</th>
                  <th className="text-left px-3 py-3">Staff</th>
                  <th className="text-left px-3 py-3">Job</th>
                  <th className="text-left px-3 py-3">In / Out</th>
                  <th className="text-right px-3 py-3">Hours</th>
                  {showCosts && <th className="text-right px-3 py-3">Cost</th>}
                  <th className="text-left px-3 py-3">Status</th>
                  <th className="px-3 py-3 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((t) => (
                  <tr key={t.id} className={`border-t border-slate-100 transition-colors hover:bg-slate-50/70 ${t.location_flag ? 'bg-amber-50/40' : ''}`}>
                    <td className="px-3 py-3">
                      {t.status === 'completed' && (
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 accent-brand-500"
                          checked={selected.includes(t.id)}
                          onChange={() => toggle(t.id)}
                          aria-label={`Select ${t.user_name}`}
                        />
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-slate-500">{fmtDate(t.work_date, { day: 'numeric', month: 'short' })}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5"><Avatar name={t.user_name} color={t.color} size={5.5} /> <span className="font-medium">{t.user_name}</span></div>
                    </td>
                    <td className="px-3 py-3 text-slate-500 max-w-[180px] truncate">{t.job_title || '—'}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-slate-500">
                      {formatClockTime(t.clock_in)} – {t.clock_out ? formatClockTime(t.clock_out) : <span className="text-emerald-600 font-medium">running</span>}
                      {Number(t.break_minutes) > 0 && <span className="text-xs text-slate-400"> ({Math.round(t.break_minutes)}m br)</span>}
                    </td>
                    <td className="px-3 py-3 text-right font-medium whitespace-nowrap">{hrs(t.worked_minutes)}</td>
                    {showCosts && <td className="px-3 py-3 text-right text-slate-600 whitespace-nowrap">{t.labour_cost ? money(t.labour_cost) : '—'}</td>}
                    <td className="px-3 py-3">
                      <div className="flex flex-nowrap items-center gap-1.5">
                        <StatusBadge status={t.status} />
                        <TimesheetStatusFlags row={t} />
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      <TimesheetRowActions
                        row={t}
                        onEdit={() => setEditRow(t)}
                        onApprove={() => approveOne(t.id)}
                        onReject={() => setRejectRow(t)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <EditModal row={editRow} onClose={() => setEditRow(null)} onSaved={() => { setEditRow(null); load(); show('Timesheet updated'); }} onError={(e) => show(e, 'error')} />
      <RejectModal row={rejectRow} onClose={() => setRejectRow(null)} onSaved={() => { setRejectRow(null); load(); show('Timesheet rejected'); }} onError={(e) => show(e, 'error')} />
    </div>
  );
}

function formFromRow(row) {
  if (!row) {
    return {
      inDate: '',
      inTime: '',
      outDate: '',
      outTime: '',
      break_minutes: 0,
      notes: '',
      edit_reason: '',
    };
  }
  const inn = splitLocalDateTime(row.clock_in);
  const out = splitLocalDateTime(row.clock_out);
  return {
    inDate: inn.date,
    inTime: inn.time,
    outDate: out.date,
    outTime: out.time,
    break_minutes: row.break_minutes || 0,
    notes: row.notes || '',
    edit_reason: '',
  };
}

function ClockStampFields({ idPrefix, heading, date, time, onDate, onTime }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-slate-700">{heading}</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label" htmlFor={`${idPrefix}-date`}>Date</label>
          <DatePicker
            id={`${idPrefix}-date`}
            label={`${heading} date`}
            value={date}
            required
            onChange={onDate}
          />
        </div>
        <div>
          <label className="label" htmlFor={`${idPrefix}-time`}>Time</label>
          <input
            id={`${idPrefix}-time`}
            className="input"
            type="time"
            required
            step="60"
            value={time}
            onChange={(e) => onTime(e.target.value)}
            aria-label={`${heading} time`}
          />
        </div>
      </div>
    </div>
  );
}

function EditModal({ row, onClose, onSaved, onError }) {
  const [form, setForm] = useState(() => formFromRow(row));
  useEffect(() => {
    setForm(formFromRow(row));
  }, [row]);
  if (!row) return null;

  const save = async (e) => {
    e.preventDefault();
    const clock_in = joinLocalDateTime(form.inDate, form.inTime);
    const clock_out = joinLocalDateTime(form.outDate, form.outTime);
    if (!clock_in || !clock_out) {
      onError('Pick a date and time for clock in and clock out');
      return;
    }
    try {
      await api.put(`/timesheets/${row.id}`, {
        clock_in,
        clock_out,
        break_minutes: form.break_minutes,
        notes: form.notes,
        edit_reason: form.edit_reason,
      });
      onSaved();
    } catch (err) {
      onError(err.message);
    }
  };

  return (
    <Modal open={!!row} onClose={onClose} title={`Edit — ${row.user_name}, ${fmtDate(row.work_date)}`}>
      <form onSubmit={save} className="space-y-3">
        {row.photo_file && (
          <img src={`/api/files/${row.photo_file}`} alt="Site" className="w-full rounded-lg" />
        )}
        <ClockStampFields
          idPrefix="edit-clock-in"
          heading="Clock in"
          date={form.inDate || ''}
          time={form.inTime || ''}
          onDate={(inDate) => setForm({ ...form, inDate })}
          onTime={(inTime) => setForm({ ...form, inTime })}
        />
        <ClockStampFields
          idPrefix="edit-clock-out"
          heading="Clock out"
          date={form.outDate || ''}
          time={form.outTime || ''}
          onDate={(outDate) => setForm({ ...form, outDate })}
          onTime={(outTime) => setForm({ ...form, outTime })}
        />
        <div>
          <label className="label">Break (minutes)</label>
          <input className="input" type="number" min="0" value={form.break_minutes ?? 0} onChange={(e) => setForm({ ...form, break_minutes: e.target.value })} />
          <p className="text-xs text-slate-400 mt-1">Paid log only — does not reduce hours.</p>
        </div>
        <div><label className="label">Notes</label><textarea className="input" rows={2} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        <div>
          <label className="label">Reason for the change (required)</label>
          <input className="input" value={form.edit_reason || ''} onChange={(e) => setForm({ ...form, edit_reason: e.target.value })} required placeholder="e.g. Forgot to clock out, confirmed finish time with Jamie" />
          <p className="text-xs text-slate-400 mt-1">Recorded against the timesheet so there's a clear audit trail.</p>
        </div>
        <button className="btn-primary w-full">Save changes</button>
      </form>
    </Modal>
  );
}

function RejectModal({ row, onClose, onSaved, onError }) {
  const [reason, setReason] = useState('');
  useEffect(() => { if (row) setReason(''); }, [row]);
  if (!row) return null;

  const save = async (e) => {
    e.preventDefault();
    try { await api.post(`/timesheets/${row.id}/reject`, { reason }); onSaved(); }
    catch (err) { onError(err.message); }
  };

  return (
    <Modal open={!!row} onClose={onClose} title={`Reject — ${row.user_name}, ${fmtDate(row.work_date)}`}>
      <form onSubmit={save} className="space-y-3">
        <p className="text-sm text-slate-500">This shift leaves the approve queue. Filter Review to Rejected to find it again.</p>
        <div>
          <label className="label" htmlFor="reject-reason">Reason (required)</label>
          <input id="reject-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} required placeholder="e.g. Clocked against the wrong job" />
        </div>
        <button className="btn-primary w-full"><X size={15} /> Reject timesheet</button>
      </form>
    </Modal>
  );
}

function TotalsTab({ from, to, setFrom, setTo, showCosts }) {
  const [data, setData] = useState(null);
  const [staffId, setStaffId] = useState('');
  const [focus, setFocus] = useState('ALL');

  useEffect(() => {
    api.get(`/timesheets/totals?from=${from}&to=${to}`).then(setData).catch(() => setData({ totals: [] }));
  }, [from, to]);
  if (!data) return <PageLoading />;

  const rows = data.totals || [];
  const staffOptions = [
    { value: '', label: 'All staff' },
    ...rows.map((t) => ({ value: String(t.user_id), label: t.name })),
  ];
  const visible = rows.filter((t) => {
    if (staffId && String(t.user_id) !== String(staffId)) return false;
    return matchesTotalsFocus(t, focus);
  });
  const filtering = Boolean(staffId || focus !== 'ALL');
  const grandHours = visible.reduce((s, t) => s + Number(t.hours || 0), 0);
  const grandCost = visible.reduce((s, t) => s + Number(t.cost || 0), 0);
  const grandShifts = visible.reduce((s, t) => s + Number(t.shifts || 0), 0);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-center gap-2">
          <SelectMenu
            className="w-44"
            label="Staff"
            value={staffId}
            onChange={setStaffId}
            options={staffOptions}
          />
          <SelectMenu
            className="w-48"
            label="Show"
            value={focus}
            onChange={setFocus}
            options={TOTALS_FOCUS_OPTIONS}
          />
          <DatePicker
            className="w-40"
            size="sm"
            label="From"
            value={from}
            onChange={setFrom}
          />
          <span className="text-slate-400 text-sm">to</span>
          <DatePicker
            className="w-40"
            size="sm"
            label="To"
            value={to}
            onChange={setTo}
          />
          {filtering && (
            <button
              type="button"
              className="text-xs font-medium text-brand-600 hover:text-brand-700 px-1"
              onClick={() => { setStaffId(''); setFocus('ALL'); }}
            >
              Clear filters
            </button>
          )}
          <a href={timesheetCsvHref(from, to, { userId: staffId })} className="btn-secondary !py-1.5 ml-auto">
            <Download size={15} /> CSV
          </a>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Clock} title="No staff in this period" />
      ) : visible.length === 0 ? (
        <EmptyState icon={Clock} title="No matching staff" detail="Try a different person, flag filter, or date range." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/90 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="text-left px-4 py-3">Staff</th>
                  <th className="text-right px-4 py-3">Shifts</th>
                  <th className="text-right px-4 py-3">Hours</th>
                  <th className="text-right px-4 py-3">Rate</th>
                  {showCosts && <th className="text-right px-4 py-3">Labour cost</th>}
                  <th className="text-right px-4 py-3">Flags</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((t) => (
                  <tr key={t.user_id} className="border-t border-slate-100 transition-colors hover:bg-slate-50/70">
                    <td className="px-4 py-3"><div className="flex items-center gap-2"><Avatar name={t.name} color={t.color} size={6} /> {t.name}</div></td>
                    <td className="px-4 py-3 text-right text-slate-500">{t.shifts}</td>
                    <td className="px-4 py-3 text-right font-semibold">{Number(t.hours || 0).toFixed(2)}h</td>
                    <td className="px-4 py-3 text-right text-slate-400">{t.hourly_cost ? `${money(t.hourly_cost)}/h` : '—'}</td>
                    {showCosts && <td className="px-4 py-3 text-right font-medium">{money(t.cost)}</td>}
                    <td className="px-4 py-3 text-right">
                      {t.awaiting_approval > 0 && <span className="badge bg-amber-100 text-amber-700 mr-1">{t.awaiting_approval} pending</span>}
                      {t.flagged > 0 && <span className="badge bg-orange-100 text-orange-700">{t.flagged} flagged</span>}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3 text-right text-slate-500 font-semibold">{grandShifts}</td>
                  <td className="px-4 py-3 text-right">{grandHours.toFixed(2)}h</td>
                  <td></td>
                  {showCosts && <td className="px-4 py-3 text-right">{money(grandCost)}</td>}
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function CostingTab() {
  const [jobs, setJobs] = useState(null);
  useEffect(() => {
    api.get('/timesheets/costing').then((d) => setJobs(d.jobs)).catch(() => setJobs([]));
  }, []);
  if (!jobs) return <PageLoading />;

  const withHours = jobs.filter((j) => j.actual_hours > 0);

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Quoted value (excluding VAT) against the labour actually clocked.
        <strong className="text-slate-700"> This is before materials</strong> — it shows what's left to cover materials, overheads and profit,
        so a healthy figure here is normal. A negative or very low number means the labour alone has eaten the job.
      </p>
      {withHours.length === 0 ? (
        <EmptyState icon={Clock} title="No costed jobs yet" detail="Once the lads clock hours against jobs, profitability appears here." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2.5">Job</th>
                <th className="text-right px-4 py-2.5">Quoted (ex VAT)</th>
                <th className="text-right px-4 py-2.5">Hours</th>
                <th className="text-right px-4 py-2.5">Labour cost</th>
                <th className="text-right px-4 py-2.5">After labour</th>
                <th className="text-right px-4 py-2.5">Labour margin</th>
              </tr>
            </thead>
            <tbody>
              {withHours.map((j) => (
                <tr key={j.id} className={`border-t border-slate-100 ${j.underquoted ? 'bg-red-50/40' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{j.title}</div>
                    <div className="text-xs text-slate-400">{j.customer_name}</div>
                  </td>
                  <td className="px-4 py-3 text-right">{money(j.net_value)}</td>
                  <td className="px-4 py-3 text-right text-slate-500">{j.actual_hours}h</td>
                  <td className="px-4 py-3 text-right">{money(j.actual_labour_cost)}</td>
                  <td className="px-4 py-3 text-right font-medium">{money(j.gross_profit)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`inline-flex items-center gap-1 font-semibold ${j.margin_percent < 20 ? 'text-red-600' : j.margin_percent < 40 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {j.margin_percent < 20 ? <TrendingDown size={13} /> : <TrendingUp size={13} />}
                      {j.margin_percent === null ? '—' : `${j.margin_percent}%`}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
