import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, X, PlaneTakeoff, Plus, ChevronLeft, ChevronRight, Mail, Phone } from 'lucide-react';
import { api, fmtDate } from '../lib/api';
import { PageLoading, StatusBadge, Avatar, EmptyState, Modal, useToast, Toast, avatarUrl } from '../components/ui.jsx';
import { ROLES } from '../lib/roles';
import SelectMenu from '../components/SelectMenu.jsx';
import { HolidayDateFields, HolidayKindTabs, nextHolidayKind } from '../components/HolidayDateFields.jsx';
import {
  HOLIDAY_KIND_SINGLE,
  holidayDateRange,
  holidayKindLabel,
  holidayKindOf,
  holidayPayload,
} from '../lib/holidays.js';
import { localIsoDate } from '../lib/schedule';

const PAGE_TABS = [
  { id: 'calendar', label: 'Calendar' },
  { id: 'requests', label: 'Requests' },
];

const HOLIDAY_TABS = [
  { id: 'ALL', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'declined', label: 'Declined' },
];

export default function Holidays() {
  const [data, setData] = useState(null);
  const [page, setPage] = useState('calendar');
  const [status, setStatus] = useState('pending');
  const [bookOpen, setBookOpen] = useState(false);
  const [declineRow, setDeclineRow] = useState(null);
  const [calTick, setCalTick] = useState(0);
  const { toast, show } = useToast();

  const load = () => api.get(`/holidays?status=${status === 'ALL' ? '' : status}`).then(setData).catch((err) => {
    show(err.message, 'error');
    setData((current) => current || { holidays: [], notice_days: 28 });
  });
  useEffect(() => { load(); }, [status]);
  const reload = () => { load(); setCalTick((n) => n + 1); };

  const approve = async (h) => {
    try {
      await api.put(`/holidays/${h.id}/decision`, { decision: 'approved' });
      show('Holiday approved');
      reload();
    } catch (err) {
      show(err.message, 'error');
    }
  };

  if (!data) return <PageLoading />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Staff Holidays</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {data.notice_days} days&apos; notice is required when the lads request.
            Office can book emergency or compassionate leave without that wait.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setBookOpen(true)}><Plus size={16} /> Book holiday</button>
      </div>

      <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1 w-fit">
        {PAGE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setPage(tab.id)}
            className={`px-3.5 py-1.5 text-sm rounded-md font-medium ${page === tab.id ? 'bg-navy-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {page === 'calendar' ? (
        <HolidayMonthGrid refreshKey={calTick} />
      ) : (
        <>
          <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1 w-fit">
            {HOLIDAY_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatus(tab.id)}
                className={`px-3.5 py-1.5 text-sm rounded-md font-medium ${status === tab.id ? 'bg-navy-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {data.holidays.length === 0 ? (
            <EmptyState icon={PlaneTakeoff} title="Nothing here" />
          ) : (
            <div className="space-y-2">
              {data.holidays.map((h) => (
                <div key={h.id} className="card p-4 flex items-center gap-3 flex-wrap">
                  <Avatar
                    name={h.user_name}
                    color={h.color}
                    size={9}
                    src={avatarUrl({ id: h.user_id, avatar_file: h.avatar_file })}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-800">{h.user_name}</div>
                    <div className="text-sm text-slate-500">
                      {holidayKindLabel(holidayKindOf(h))} · {holidayDateRange(h, fmtDate)} · {h.days} day{h.days > 1 ? 's' : ''}
                    </div>
                    {h.reason && <div className="text-xs text-slate-400 mt-0.5">{h.reason}</div>}
                    {h.decline_reason && <div className="text-xs text-rose-500 mt-0.5">Declined: {h.decline_reason}</div>}
                    {h.allowance != null && (
                      <div className="text-xs text-slate-400 mt-0.5">{h.remaining} of {h.allowance} days left in {h.year} ({h.used} used)</div>
                    )}
                  </div>
                  <StatusBadge status={h.status} className="capitalize" />
                  <div className="flex gap-1.5">
                    {h.status !== 'approved' && (
                      <button type="button" onClick={() => approve(h)} className="btn-secondary !py-1.5 !px-2.5 text-xs !text-emerald-700"><Check size={13} /> Approve</button>
                    )}
                    {h.status !== 'declined' && (
                      <button type="button" onClick={() => setDeclineRow(h)} className="btn-secondary !py-1.5 !px-2.5 text-xs !text-rose-600"><X size={13} /> Decline</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <BookModal
        open={bookOpen}
        onClose={() => setBookOpen(false)}
        onSaved={() => { setBookOpen(false); reload(); show('Holiday booked and approved'); }}
        onError={(e) => show(e, 'error')}
      />
      <DeclineModal
        row={declineRow}
        onClose={() => setDeclineRow(null)}
        onSaved={() => { setDeclineRow(null); reload(); show('Holiday declined'); }}
        onError={(e) => show(e, 'error')}
      />
      <Toast {...toast} />
    </div>
  );
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_DAY_CHIPS = 3;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function localIsoDay(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function monthCells(year, month) {
  const firstDow = new Date(year, month - 1, 1).getDay();
  const mondayPad = firstDow === 0 ? 6 : firstDow - 1;
  const days = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = 0; i < mondayPad; i += 1) cells.push(null);
  for (let d = 1; d <= days; d += 1) cells.push(`${year}-${pad2(month)}-${pad2(d)}`);
  return cells;
}

function peopleOffOn(iso, holidays) {
  const seen = new Set();
  return (holidays || []).filter((h) => {
    const from = String(h.start_date || '').slice(0, 10);
    const to = String(h.end_date || '').slice(0, 10);
    if (!(from && to && from <= iso && iso <= to)) return false;
    const key = h.user_id != null ? `u-${h.user_id}` : `h-${h.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function peopleThisMonth(holidays) {
  const map = new Map();
  for (const h of holidays || []) {
    const key = h.user_id != null ? h.user_id : h.id;
    if (!map.has(key)) map.set(key, h);
  }
  return [...map.values()].sort((a, b) => String(a.user_name || '').localeCompare(String(b.user_name || '')));
}

function colorWash(hex) {
  const raw = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return undefined;
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, 0.14)`;
}

function personLabel(person) {
  return [person?.user_name || 'Staff', person?.email, person?.phone].filter(Boolean).join(', ');
}

function offRangeLabel(person) {
  const start = person?.start_date;
  const end = person?.end_date;
  if (!start) return '';
  const from = fmtDate(start, { day: 'numeric', month: 'short' });
  if (!end || String(start).slice(0, 10) === String(end).slice(0, 10)) return from;
  return `${from} – ${fmtDate(end, { day: 'numeric', month: 'short' })}`;
}

function StaffPersonHover({ person, className, style, children }) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const name = person?.user_name || 'Staff';
  const email = person?.email || '';
  const phone = person?.phone || '';
  const range = offRangeLabel(person);

  const show = () => {
    const el = wrapRef.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const placeBelow = typeof window === 'undefined' || window.innerHeight - box.bottom > 168;
    const mid = box.left + box.width / 2;
    const maxLeft = typeof window === 'undefined' ? mid : window.innerWidth - 16;
    setCoords({
      top: placeBelow ? box.bottom + 8 : box.top - 8,
      left: Math.min(Math.max(16, mid), maxLeft),
      place: placeBelow ? 'below' : 'above',
    });
    setOpen(true);
  };

  return (
    <>
      <div
        ref={wrapRef}
        className={className}
        style={style}
        aria-label={personLabel(person)}
        onMouseEnter={show}
        onMouseOver={show}
        onMouseLeave={() => setOpen(false)}
      >
        {children}
      </div>
      {open && coords && createPortal(
        <div
          role="tooltip"
          className="pointer-events-none w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            transform: coords.place === 'below' ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
            zIndex: 80,
          }}
        >
          <div className="flex items-start gap-2.5">
            <Avatar
              name={name}
              color={person.color}
              size={8}
              src={avatarUrl({ id: person.user_id, avatar_file: person.avatar_file })}
            />
            <div className="min-w-0">
              <div className="truncate font-semibold text-slate-900">{name}</div>
              {range && <div className="text-[11px] text-slate-400">Off {range}</div>}
            </div>
          </div>
          <div className="mt-2.5 space-y-1.5 text-xs text-slate-600">
            {email && (
              <div className="flex items-center gap-1.5">
                <Mail size={12} className="flex-shrink-0 text-slate-400" />
                <span className="truncate">{email}</span>
              </div>
            )}
            {phone && (
              <div className="flex items-center gap-1.5">
                <Phone size={12} className="flex-shrink-0 text-slate-400" />
                <span>{phone}</span>
              </div>
            )}
            {!email && !phone && (
              <div className="text-slate-400">No contact details on file</div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function StaffOffChip({ person, compact = false }) {
  const name = person.user_name || 'Staff';
  return (
    <StaffPersonHover
      person={person}
      className={`flex min-w-0 items-center gap-1.5 rounded-lg px-1 py-0.5 ${compact ? '' : 'border border-white/60'}`}
      style={{ background: colorWash(person.color) || 'rgba(241, 245, 249, 0.9)' }}
    >
      <Avatar
        name={name}
        color={person.color}
        size={compact ? 4.5 : 6}
        src={avatarUrl({ id: person.user_id, avatar_file: person.avatar_file })}
      />
      <span className={`min-w-0 font-medium text-slate-800 ${compact ? 'line-clamp-2 text-[11px] leading-tight' : 'text-sm'}`}>
        {name}
      </span>
    </StaffPersonHover>
  );
}

function HolidayMonthGrid({ refreshKey }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [holidays, setHolidays] = useState([]);
  const today = localIsoDay();
  const viewingCurrent = year === now.getFullYear() && month === now.getMonth() + 1;

  const goTo = (nextYear, nextMonth) => {
    setYear(nextYear);
    setMonth(nextMonth);
  };

  const shift = (delta) => {
    const d = new Date(year, month - 1 + delta, 1);
    goTo(d.getFullYear(), d.getMonth() + 1);
  };

  useEffect(() => {
    const from = `${year}-${pad2(month)}-01`;
    const to = `${year}-${pad2(month)}-${pad2(new Date(year, month, 0).getDate())}`;
    api.get(`/holidays/calendar?from=${from}&to=${to}`).then((d) => setHolidays(d.holidays || [])).catch(() => setHolidays([]));
  }, [year, month, refreshKey]);

  const label = new Date(year, month - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const monthPeople = peopleThisMonth(holidays);

  return (
    <div className="card overflow-visible">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Team calendar</p>
          <h2 className="text-lg font-semibold text-slate-900">Approved off</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-secondary !h-9 !px-3 text-xs"
            disabled={viewingCurrent}
            onClick={() => goTo(now.getFullYear(), now.getMonth() + 1)}
          >
            Today
          </button>
          <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <button type="button" className="btn-ghost !p-1.5" onClick={() => shift(-1)} aria-label="Previous month">
              <ChevronLeft size={16} />
            </button>
            <div className="min-w-[9.5rem] px-2 text-center text-sm font-semibold text-slate-800">{label}</div>
            <button type="button" className="btn-ghost !p-1.5" onClick={() => shift(1)} aria-label="Next month">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <div className="grid grid-cols-7 gap-1.5" data-calendar-month={`${year}-${pad2(month)}`}>
          {WEEKDAYS.map((d, i) => (
            <div
              key={d}
              className={`pb-1.5 text-center text-[11px] font-semibold uppercase tracking-wide ${i >= 5 ? 'text-slate-400' : 'text-slate-500'}`}
            >
              {d}
            </div>
          ))}
          {monthCells(year, month).map((iso, i) => {
            if (!iso) return <div key={`e-${i}`} className="min-h-[6.75rem] rounded-xl bg-slate-50/60" />;
            const off = peopleOffOn(iso, holidays);
            const shown = off.slice(0, MAX_DAY_CHIPS);
            const extra = off.length - shown.length;
            const isToday = iso === today;
            const isWeekend = i % 7 >= 5;
            const dayNum = Number(iso.slice(8, 10));
            return (
              <div
                key={iso}
                    className={`flex min-h-[6.75rem] flex-col rounded-xl border p-1.5 sm:p-2 ${
                  isToday
                    ? 'border-brand-500 bg-brand-50 shadow-sm'
                    : off.length
                      ? 'border-slate-200 bg-white'
                      : isWeekend
                        ? 'border-transparent bg-slate-50/80'
                        : 'border-slate-100 bg-white'
                }`}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                      isToday ? 'bg-brand-600 text-white' : isWeekend ? 'text-slate-400' : 'text-slate-600'
                    }`}
                  >
                    {dayNum}
                  </span>
                  {off.length > 0 && (
                    <span className="text-[10px] font-medium text-slate-400">{off.length}</span>
                  )}
                </div>
                <div className="min-h-0 flex-1 space-y-1">
                  {shown.map((h) => (
                    <StaffOffChip key={h.user_id || h.id} person={h} compact />
                  ))}
                  {extra > 0 && (
                    <div className="px-1 text-[10px] font-medium text-slate-400">+{extra} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {monthPeople.length > 0 && (
          <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-3 sm:px-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {monthPeople.length} off in {label}
            </div>
            <div className="flex flex-wrap gap-2">
              {monthPeople.map((h) => (
                <StaffPersonHover
                  key={h.user_id || h.id}
                  person={h}
                  className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 shadow-sm"
                >
                  <Avatar
                    name={h.user_name}
                    color={h.color}
                    size={6}
                    src={avatarUrl({ id: h.user_id, avatar_file: h.avatar_file })}
                  />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-800">{h.user_name}</div>
                    <div className="text-[11px] text-slate-400">
                      {fmtDate(h.start_date, { day: 'numeric', month: 'short' })}
                      {String(h.start_date).slice(0, 10) !== String(h.end_date).slice(0, 10)
                        ? ` – ${fmtDate(h.end_date, { day: 'numeric', month: 'short' })}`
                        : ''}
                    </div>
                  </div>
                </StaffPersonHover>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DeclineModal({ row, onClose, onSaved, onError }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (row) setReason(''); }, [row]);
  if (!row) return null;

  const save = async (e) => {
    e.preventDefault();
    const decline_reason = reason.trim();
    if (!decline_reason) return;
    setSaving(true);
    try {
      await api.put(`/holidays/${row.id}/decision`, { decision: 'declined', decline_reason });
      onSaved();
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={!!row} onClose={onClose} title={`Decline — ${row.user_name}`}>
      <form onSubmit={save} className="space-y-3">
        <p className="text-sm text-slate-500">{holidayDateRange(row, fmtDate)}. A reason is required.</p>
        <div>
          <label className="label" htmlFor="holiday-decline-reason">Reason (required)</label>
          <input
            id="holiday-decline-reason"
            className="input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            placeholder="e.g. Crew already booked that week"
          />
        </div>
        <button type="submit" className="btn-primary w-full" disabled={saving}>{saving ? 'Saving…' : 'Decline request'}</button>
      </form>
    </Modal>
  );
}

function BookModal({ open, onClose, onSaved, onError }) {
  const [staff, setStaff] = useState([]);
  const [userId, setUserId] = useState('');
  const [kind, setKind] = useState(HOLIDAY_KIND_SINGLE);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    setError('');
    api.get('/settings/users').then((d) => {
      setStaff((d.users || []).filter((u) => u.role === ROLES.STAFF && u.active !== false));
    }).catch(() => setStaff([]));
    return undefined;
  }, [open]);

  const changeKind = (next) => {
    const state = nextHolidayKind(kind, next, start, end);
    setKind(state.kind);
    setStart(state.start);
    setEnd(state.end);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!userId) {
      const message = 'Pick a staff member';
      setError(message);
      onError(message);
      return;
    }
    if (!start || (kind !== HOLIDAY_KIND_SINGLE && !end)) {
      const message = kind === HOLIDAY_KIND_SINGLE ? 'Pick a date' : 'Pick the from and to dates';
      setError(message);
      onError(message);
      return;
    }
    setError('');
    setSaving(true);
    try {
      await api.post('/holidays', holidayPayload({ kind, start, end, reason, userId }));
      onSaved();
      setUserId(''); setKind(HOLIDAY_KIND_SINGLE); setStart(''); setEnd(''); setReason('');
    } catch (err) {
      const message = err.message || 'Could not book this holiday';
      setError(message);
      onError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Book holiday">
      <form onSubmit={submit} className="space-y-3" noValidate>
        <p className="text-xs text-slate-400">Approved immediately on the team calendar. Notice is not applied — for emergency or compassionate leave. Overlapping pending or approved dates are still blocked.</p>
        <div>
          <label className="label" htmlFor="holiday-staff">Staff</label>
          <SelectMenu
            id="holiday-staff"
            label="Staff"
            value={userId}
            required
            invalid={error === 'Pick a staff member'}
            onChange={(next) => { setUserId(next); setError(''); }}
            options={[
              { value: '', label: 'Select…' },
              ...staff.map((u) => ({ value: String(u.id), label: u.name })),
            ]}
          />
          {error && (
            <p className="mt-1.5 text-sm text-rose-600" role="alert">{error}</p>
          )}
        </div>
        <HolidayKindTabs kind={kind} onChange={changeKind} />
        <HolidayDateFields
          kind={kind}
          start={start}
          end={end}
          onStart={(value) => {
            setStart(value);
            if (kind === HOLIDAY_KIND_SINGLE) setEnd(value);
            setError('');
          }}
          onEnd={(value) => { setEnd(value); setError(''); }}
          minDate={localIsoDate()}
          idPrefix="holiday"
        />
        <div>
          <label className="label" htmlFor="holiday-reason">Reason (optional)</label>
          <input id="holiday-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <button className="btn-primary w-full" disabled={saving}>{saving ? 'Saving…' : 'Submit booking'}</button>
      </form>
    </Modal>
  );
}
