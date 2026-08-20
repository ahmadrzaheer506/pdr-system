import React, { useEffect, useState } from 'react';
import { Check, X, PlaneTakeoff } from 'lucide-react';
import { api, fmtDate } from '../lib/api';
import { PageLoading, StatusBadge, Avatar, EmptyState, useToast, Toast } from '../components/ui.jsx';

export default function Holidays() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('pending');
  const { toast, show } = useToast();

  const load = () => api.get(`/holidays?status=${status === 'ALL' ? '' : status}`).then(setData);
  useEffect(() => { load(); }, [status]);

  const decide = async (h, decision) => {
    let decline_reason;
    if (decision === 'declined') decline_reason = window.prompt('Reason for declining (optional):') || '';
    try { await api.put(`/holidays/${h.id}/decision`, { decision, decline_reason }); show(`Holiday ${decision}`); load(); }
    catch (err) { show(err.message, 'error'); }
  };

  if (!data) return <PageLoading />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Staff Holidays</h1>
        <p className="text-slate-500 text-sm mt-0.5">{data.notice_days} days' notice is required — enforced automatically when the lads request.</p>
      </div>

      <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1 w-fit">
        {['pending', 'approved', 'declined', 'ALL'].map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`px-3.5 py-1.5 text-sm rounded-md font-medium capitalize ${status === s ? 'bg-navy-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>{s}</button>
        ))}
      </div>

      {data.holidays.length === 0 ? (
        <EmptyState icon={PlaneTakeoff} title="Nothing here" />
      ) : (
        <div className="space-y-2">
          {data.holidays.map((h) => (
            <div key={h.id} className="card p-4 flex items-center gap-3 flex-wrap">
              <Avatar name={h.user_name} color={h.color} size={9} />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-slate-800">{h.user_name}</div>
                <div className="text-sm text-slate-500">{fmtDate(h.start_date)} – {fmtDate(h.end_date)} · {h.days} day{h.days > 1 ? 's' : ''}</div>
                {h.reason && <div className="text-xs text-slate-400 mt-0.5">{h.reason}</div>}
                {h.decline_reason && <div className="text-xs text-rose-500 mt-0.5">Declined: {h.decline_reason}</div>}
              </div>
              <StatusBadge status={h.status} />
              {h.status === 'pending' && (
                <div className="flex gap-1.5">
                  <button onClick={() => decide(h, 'approved')} className="btn-secondary !py-1.5 !px-2.5 text-xs !text-emerald-700"><Check size={13} /> Approve</button>
                  <button onClick={() => decide(h, 'declined')} className="btn-secondary !py-1.5 !px-2.5 text-xs !text-rose-600"><X size={13} /> Decline</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <Toast {...toast} />
    </div>
  );
}
