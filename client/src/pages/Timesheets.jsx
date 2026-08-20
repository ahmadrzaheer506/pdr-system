import React, { useEffect, useState } from 'react';
import { Clock, MapPin, AlertTriangle, Check, Download, TrendingUp, TrendingDown, Radio, Square } from 'lucide-react';
import { api, money, fmtDate } from '../lib/api';
import { PageLoading, StatusBadge, Avatar, EmptyState, Modal, useToast, Toast } from '../components/ui.jsx';

const TABS = [
  { id: 'review', label: 'Review & approve' },
  { id: 'totals', label: 'Weekly totals' },
  { id: 'costing', label: 'Job profitability' },
];

function hrs(mins) {
  if (mins === null || mins === undefined) return '—';
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}
function weekAgo(n = 6) { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10); }
function today() { return new Date().toISOString().slice(0, 10); }

export default function Timesheets() {
  const [tab, setTab] = useState('review');
  const [from, setFrom] = useState(weekAgo(6));
  const [to, setTo] = useState(today());
  const { toast, show } = useToast();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Timesheets</h1>
          <p className="text-slate-500 text-sm mt-0.5">Hours the lads have clocked, and what each job actually cost.</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" className="input !py-1.5 !w-auto text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="text-slate-400 text-sm">to</span>
          <input type="date" className="input !py-1.5 !w-auto text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
          <a href={`/api/timesheets/export.csv?from=${from}&to=${to}`} className="btn-secondary !py-1.5"><Download size={15} /> CSV</a>
        </div>
      </div>

      <LiveBoard show={show} />

      <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1 w-fit">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`px-3.5 py-1.5 text-sm rounded-md font-medium ${tab === t.id ? 'bg-navy-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'review' && <ReviewTab from={from} to={to} show={show} />}
      {tab === 'totals' && <TotalsTab from={from} to={to} />}
      {tab === 'costing' && <CostingTab />}
      <Toast {...toast} />
    </div>
  );
}

function LiveBoard({ show }) {
  const [active, setActive] = useState([]);
  const load = () => api.get('/timesheets/live').then((d) => setActive(d.active));
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);

  const forceOut = async (row) => {
    if (!window.confirm(`Clock ${row.user_name} out now?`)) return;
    try { await api.post(`/timesheets/${row.id}/force-clockout`); show(`${row.user_name} clocked out`); load(); }
    catch (err) { show(err.message, 'error'); }
  };

  if (!active.length) return null;

  return (
    <div className="card p-4 border-emerald-200 bg-emerald-50/50">
      <div className="flex items-center gap-2 mb-3">
        <Radio size={15} className="text-emerald-600 animate-pulse" />
        <h3 className="font-semibold text-slate-800">On the clock now ({active.length})</h3>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {active.map((a) => (
          <div key={a.id} className="bg-white rounded-lg border border-slate-200 p-3 flex items-center gap-2.5">
            <Avatar name={a.user_name} color={a.color} size={8} />
            <div className="min-w-0 flex-1">
              <div className="font-medium text-sm text-slate-800 truncate">{a.user_name}</div>
              <div className="text-xs text-slate-500 truncate">{a.job_title || 'General'}</div>
              <div className="text-[11px] text-slate-400">
                since {String(a.clock_in).slice(11, 16)}
                {a.break_started_at && <span className="text-amber-600 font-medium"> · on break</span>}
                {a.location_flag === 'far_from_site' && <span className="text-amber-600"> · {a.in_distance_m}m off site</span>}
              </div>
            </div>
            <button onClick={() => forceOut(a)} title="Clock out" className="text-slate-300 hover:text-slate-600 p-1"><Square size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReviewTab({ from, to, show }) {
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState([]);
  const [editRow, setEditRow] = useState(null);

  const load = () => api.get(`/timesheets?from=${from}&to=${to}`).then((d) => { setData(d); setSelected([]); });
  useEffect(() => { load(); }, [from, to]);

  if (!data) return <PageLoading />;

  const pending = data.timesheets.filter((t) => t.status === 'completed');
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const approveBatch = async () => {
    try { await api.post('/timesheets/approve-batch', { ids: selected }); show(`${selected.length} approved`); load(); }
    catch (err) { show(err.message, 'error'); }
  };
  const approveOne = async (id) => {
    try { await api.post(`/timesheets/${id}/approve`); load(); }
    catch (err) { show(err.message, 'error'); }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-3 flex-wrap">
        <div className="card px-4 py-2.5"><span className="text-lg font-bold">{data.counts.awaiting}</span> <span className="text-xs text-slate-500">awaiting approval</span></div>
        <div className="card px-4 py-2.5"><span className="text-lg font-bold text-amber-600">{data.counts.flagged}</span> <span className="text-xs text-slate-500">flagged</span></div>
        {selected.length > 0 && (
          <button onClick={approveBatch} className="btn-primary"><Check size={15} /> Approve {selected.length} selected</button>
        )}
        {pending.length > 0 && selected.length === 0 && (
          <button onClick={() => setSelected(pending.map((t) => t.id))} className="btn-secondary">Select all pending</button>
        )}
      </div>

      {data.timesheets.length === 0 ? (
        <EmptyState icon={Clock} title="No shifts in this period" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="w-8 px-3 py-2.5"></th>
                <th className="text-left px-3 py-2.5">Date</th>
                <th className="text-left px-3 py-2.5">Staff</th>
                <th className="text-left px-3 py-2.5">Job</th>
                <th className="text-left px-3 py-2.5">In / Out</th>
                <th className="text-right px-3 py-2.5">Hours</th>
                <th className="text-right px-3 py-2.5">Cost</th>
                <th className="text-left px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {data.timesheets.map((t) => (
                <tr key={t.id} className={`border-t border-slate-100 ${t.location_flag ? 'bg-amber-50/40' : ''}`}>
                  <td className="px-3 py-2.5">
                    {t.status === 'completed' && (
                      <input type="checkbox" checked={selected.includes(t.id)} onChange={() => toggle(t.id)} />
                    )}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-slate-500">{fmtDate(t.work_date, { day: 'numeric', month: 'short' })}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5"><Avatar name={t.user_name} color={t.color} size={5.5} /> <span className="font-medium">{t.user_name}</span></div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-500 max-w-[180px] truncate">{t.job_title || '—'}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-slate-500">
                    {String(t.clock_in).slice(11, 16)} – {t.clock_out ? String(t.clock_out).slice(11, 16) : <span className="text-emerald-600 font-medium">running</span>}
                    {Number(t.break_minutes) > 0 && <span className="text-xs text-slate-400"> ({Math.round(t.break_minutes)}m br)</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium whitespace-nowrap">{hrs(t.worked_minutes)}</td>
                  <td className="px-3 py-2.5 text-right text-slate-600 whitespace-nowrap">{t.labour_cost ? money(t.labour_cost) : '—'}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      <StatusBadge status={t.status} />
                      {t.location_flag === 'far_from_site' && <span title={`${t.in_distance_m}m from site`} className="text-amber-500"><MapPin size={13} /></span>}
                      {t.location_flag === 'no_location' && <span title="No location captured" className="text-slate-300"><MapPin size={13} /></span>}
                      {t.edit_reason && <span title={t.edit_reason} className="text-slate-400"><AlertTriangle size={12} /></span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <button onClick={() => setEditRow(t)} className="btn-ghost !py-1 !px-2 text-xs">Edit</button>
                    {t.status === 'completed' && <button onClick={() => approveOne(t.id)} className="btn-secondary !py-1 !px-2 text-xs ml-1">Approve</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <EditModal row={editRow} onClose={() => setEditRow(null)} onSaved={() => { setEditRow(null); load(); show('Timesheet updated'); }} onError={(e) => show(e, 'error')} />
    </div>
  );
}

function EditModal({ row, onClose, onSaved, onError }) {
  const [form, setForm] = useState({});
  useEffect(() => {
    if (row) setForm({ clock_in: row.clock_in, clock_out: row.clock_out || '', break_minutes: row.break_minutes || 0, notes: row.notes || '', edit_reason: '' });
  }, [row]);
  if (!row) return null;

  const save = async (e) => {
    e.preventDefault();
    try { await api.put(`/timesheets/${row.id}`, form); onSaved(); }
    catch (err) { onError(err.message); }
  };

  return (
    <Modal open={!!row} onClose={onClose} title={`Edit — ${row.user_name}, ${fmtDate(row.work_date)}`}>
      <form onSubmit={save} className="space-y-3">
        {row.photo_file && (
          <img src={`/api/files/${row.photo_file}`} alt="Site" className="w-full rounded-lg" />
        )}
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Clock in</label><input className="input" value={form.clock_in || ''} onChange={(e) => setForm({ ...form, clock_in: e.target.value })} /></div>
          <div><label className="label">Clock out</label><input className="input" value={form.clock_out || ''} onChange={(e) => setForm({ ...form, clock_out: e.target.value })} placeholder="YYYY-MM-DD HH:MM:SS" /></div>
        </div>
        <div><label className="label">Break (minutes)</label><input className="input" type="number" value={form.break_minutes} onChange={(e) => setForm({ ...form, break_minutes: e.target.value })} /></div>
        <div><label className="label">Notes</label><textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        <div>
          <label className="label">Reason for the change (required)</label>
          <input className="input" value={form.edit_reason} onChange={(e) => setForm({ ...form, edit_reason: e.target.value })} required placeholder="e.g. Forgot to clock out, confirmed finish time with Jamie" />
          <p className="text-xs text-slate-400 mt-1">Recorded against the timesheet so there's a clear audit trail.</p>
        </div>
        <button className="btn-primary w-full">Save changes</button>
      </form>
    </Modal>
  );
}

function TotalsTab({ from, to }) {
  const [data, setData] = useState(null);
  useEffect(() => { api.get(`/timesheets/totals?from=${from}&to=${to}`).then(setData); }, [from, to]);
  if (!data) return <PageLoading />;

  const grandHours = data.totals.reduce((s, t) => s + t.hours, 0);
  const grandCost = data.totals.reduce((s, t) => s + t.cost, 0);

  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
          <tr>
            <th className="text-left px-4 py-2.5">Staff</th>
            <th className="text-right px-4 py-2.5">Shifts</th>
            <th className="text-right px-4 py-2.5">Hours</th>
            <th className="text-right px-4 py-2.5">Rate</th>
            <th className="text-right px-4 py-2.5">Labour cost</th>
            <th className="text-right px-4 py-2.5">Flags</th>
          </tr>
        </thead>
        <tbody>
          {data.totals.map((t) => (
            <tr key={t.user_id} className="border-t border-slate-100">
              <td className="px-4 py-3"><div className="flex items-center gap-2"><Avatar name={t.name} color={t.color} size={6} /> {t.name}</div></td>
              <td className="px-4 py-3 text-right text-slate-500">{t.shifts}</td>
              <td className="px-4 py-3 text-right font-semibold">{t.hours.toFixed(2)}h</td>
              <td className="px-4 py-3 text-right text-slate-400">{t.hourly_cost ? `${money(t.hourly_cost)}/h` : '—'}</td>
              <td className="px-4 py-3 text-right font-medium">{money(t.cost)}</td>
              <td className="px-4 py-3 text-right">
                {t.awaiting_approval > 0 && <span className="badge bg-amber-100 text-amber-700 mr-1">{t.awaiting_approval} pending</span>}
                {t.flagged > 0 && <span className="badge bg-orange-100 text-orange-700">{t.flagged} flagged</span>}
              </td>
            </tr>
          ))}
          <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
            <td className="px-4 py-3">Total</td>
            <td></td>
            <td className="px-4 py-3 text-right">{grandHours.toFixed(2)}h</td>
            <td></td>
            <td className="px-4 py-3 text-right">{money(grandCost)}</td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function CostingTab() {
  const [jobs, setJobs] = useState(null);
  useEffect(() => { api.get('/timesheets/costing').then((d) => setJobs(d.jobs)); }, []);
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
