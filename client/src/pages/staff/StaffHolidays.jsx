import React, { useEffect, useState } from 'react';
import { Plus, PlaneTakeoff } from 'lucide-react';
import { api, fmtDate } from '../../lib/api';
import { PageLoading, StatusBadge, EmptyState, Modal, useToast, Toast } from '../../components/ui.jsx';
import { HolidayDateFields, HolidayKindTabs, nextHolidayKind } from '../../components/HolidayDateFields.jsx';
import {
  HOLIDAY_KIND_SINGLE,
  holidayDateRange,
  holidayKindLabel,
  holidayKindOf,
  holidayPayload,
} from '../../lib/holidays.js';

export default function StaffHolidays() {
  const [data, setData] = useState(null);
  const [team, setTeam] = useState([]);
  const [open, setOpen] = useState(false);
  const { toast, show } = useToast();

  const load = () => {
    api.get('/staff/holidays/mine').then(setData).catch((err) => {
      show(err.message, 'error');
      setData((current) => current || { holidays: [], notice_days: 28, used: 0, remaining: 0, allowance: 0 });
    });
    api.get('/staff/holidays/team').then((d) => setTeam(d.holidays)).catch(() => setTeam([]));
  };
  useEffect(() => { load(); }, []);

  const withdraw = async (h) => {
    try {
      await api.del(`/holidays/${h.id}`);
      show('Request withdrawn');
      load();
    } catch (err) {
      show(err.message, 'error');
    }
  };

  if (!data) return <PageLoading />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">My Holidays</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {data.notice_days} days&apos; notice needed · {data.used ?? 0} used · {data.remaining ?? data.allowance} of {data.allowance} left in {data.year || new Date().getFullYear()}
          </p>
        </div>
        <button type="button" className="btn-primary !px-3" onClick={() => setOpen(true)} aria-label="Request holiday"><Plus size={16} /></button>
      </div>

      {data.holidays.length === 0 ? (
        <EmptyState icon={PlaneTakeoff} title="No requests yet" />
      ) : (
        <div className="space-y-2">
          {data.holidays.map((h) => (
            <div key={h.id} className="card p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm text-slate-800">{holidayDateRange(h, fmtDate)}</span>
                <div className="flex items-center gap-1.5">
                  <StatusBadge status={h.status} className="capitalize" />
                  {h.status === 'pending' && (
                    <button type="button" className="btn-ghost !py-1 !px-2 text-xs text-slate-500" onClick={() => withdraw(h)}>Withdraw</button>
                  )}
                </div>
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {holidayKindLabel(holidayKindOf(h))} · {h.days} day{h.days > 1 ? 's' : ''}{h.reason ? ` · ${h.reason}` : ''}
              </div>
              {h.decline_reason && <div className="text-xs text-rose-500 mt-1">{h.decline_reason}</div>}
            </div>
          ))}
        </div>
      )}

      {team.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-600 mb-2 mt-6">Teammates off soon</h3>
          <div className="space-y-1.5">
            {team.map((h) => (
              <div key={h.id} className="text-sm text-slate-500 flex justify-between card p-2.5">
                <span>{h.user_name}</span>
                <span>{holidayKindLabel(holidayKindOf(h))} · {holidayDateRange(h, fmtDate)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <RequestModal open={open} onClose={() => setOpen(false)} noticeDays={data.notice_days} onSaved={() => { setOpen(false); load(); show('Request submitted'); }} onError={(e) => show(e, 'error')} />
      <Toast {...toast} />
    </div>
  );
}

function RequestModal({ open, onClose, noticeDays, onSaved, onError }) {
  const [kind, setKind] = useState(HOLIDAY_KIND_SINGLE);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const minDate = new Date(Date.now() + noticeDays * 86400000).toISOString().slice(0, 10);

  const changeKind = (next) => {
    const state = nextHolidayKind(kind, next, start, end);
    setKind(state.kind);
    setStart(state.start);
    setEnd(state.end);
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/holidays', holidayPayload({ kind, start, end, reason }));
      onSaved();
      setKind(HOLIDAY_KIND_SINGLE);
      setStart('');
      setEnd('');
      setReason('');
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Request holiday">
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-slate-400">Dates less than {noticeDays} days away can't be selected — company policy.</p>
        <HolidayKindTabs kind={kind} onChange={changeKind} />
        <HolidayDateFields
          kind={kind}
          start={start}
          end={end}
          onStart={(value) => {
            setStart(value);
            if (kind === HOLIDAY_KIND_SINGLE) setEnd(value);
          }}
          onEnd={setEnd}
          minDate={minDate}
          idPrefix="staff-hol"
        />
        <div><label className="label">Reason (optional)</label><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        <button className="btn-primary w-full" disabled={saving}>{saving ? 'Submitting…' : 'Submit request'}</button>
      </form>
    </Modal>
  );
}
