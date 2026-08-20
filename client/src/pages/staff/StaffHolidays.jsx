import React, { useEffect, useState } from 'react';
import { Plus, PlaneTakeoff } from 'lucide-react';
import { api, fmtDate } from '../../lib/api';
import { PageLoading, StatusBadge, EmptyState, Modal, useToast, Toast } from '../../components/ui.jsx';

export default function StaffHolidays() {
  const [data, setData] = useState(null);
  const [team, setTeam] = useState([]);
  const [open, setOpen] = useState(false);
  const { toast, show } = useToast();

  const load = () => {
    api.get('/staff/holidays/mine').then(setData);
    api.get('/staff/holidays/team').then((d) => setTeam(d.holidays));
  };
  useEffect(() => { load(); }, []);

  if (!data) return <PageLoading />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">My Holidays</h1>
          <p className="text-slate-500 text-sm mt-0.5">{data.notice_days} days' notice needed · {data.allowance} days/year allowance</p>
        </div>
        <button className="btn-primary !px-3" onClick={() => setOpen(true)}><Plus size={16} /></button>
      </div>

      {data.holidays.length === 0 ? (
        <EmptyState icon={PlaneTakeoff} title="No requests yet" />
      ) : (
        <div className="space-y-2">
          {data.holidays.map((h) => (
            <div key={h.id} className="card p-3.5">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm text-slate-800">{fmtDate(h.start_date)} – {fmtDate(h.end_date)}</span>
                <StatusBadge status={h.status} />
              </div>
              <div className="text-xs text-slate-400 mt-0.5">{h.days} day{h.days > 1 ? 's' : ''}{h.reason ? ` · ${h.reason}` : ''}</div>
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
                <span>{h.user_name}</span><span>{fmtDate(h.start_date)} – {fmtDate(h.end_date)}</span>
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
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const minDate = new Date(Date.now() + noticeDays * 86400000).toISOString().slice(0, 10);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try { await api.post('/holidays', { start_date: start, end_date: end, reason }); onSaved(); setStart(''); setEnd(''); setReason(''); }
    catch (err) { onError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Request holiday">
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-slate-400">Dates less than {noticeDays} days away can't be selected — company policy.</p>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">From</label><input className="input" type="date" min={minDate} value={start} onChange={(e) => setStart(e.target.value)} required /></div>
          <div><label className="label">To</label><input className="input" type="date" min={start || minDate} value={end} onChange={(e) => setEnd(e.target.value)} required /></div>
        </div>
        <div><label className="label">Reason (optional)</label><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        <button className="btn-primary w-full" disabled={saving}>{saving ? 'Submitting…' : 'Submit request'}</button>
      </form>
    </Modal>
  );
}
