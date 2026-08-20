import React, { useEffect, useState } from 'react';
import { Mic, MessageSquare } from 'lucide-react';
import { api, money, fmtDate } from '../lib/api';
import { Modal, StatusBadge, PriorityBadge, Avatar } from './ui.jsx';

const STATUSES = ['PENDING', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'INVOICED', 'PAID'];

export default function JobModal({ jobId, onClose, onChanged, staff = [] }) {
  const [job, setJob] = useState(null);
  const [messages, setMessages] = useState([]);
  const [crew, setCrew] = useState([]);
  const [msg, setMsg] = useState('');

  const load = () => api.get(`/jobs/${jobId}`).then((d) => { setJob(d.job); setMessages(d.messages); setCrew(d.job.crew.map((c) => c.id)); });
  useEffect(() => { if (jobId) load(); }, [jobId]);

  if (!jobId) return null;

  const toggleCrew = (uid) => setCrew((c) => (c.includes(uid) ? c.filter((x) => x !== uid) : [...c, uid]));
  const saveCrew = async () => { await api.put(`/jobs/${jobId}/assignments`, { user_ids: crew }); onChanged(); load(); };
  const setStatus = async (status) => { await api.put(`/jobs/${jobId}/status`, { status }); onChanged(); load(); };
  const sendMsg = async () => {
    if (!msg.trim()) return;
    await api.post(`/jobs/${jobId}/messages`, { body: msg });
    setMsg('');
    load();
  };

  return (
    <Modal open={!!jobId} onClose={onClose} title={job?.title || 'Job'} wide>
      {!job ? <div className="text-sm text-slate-400">Loading…</div> : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={job.status} />
            <PriorityBadge priority={job.priority} />
            {job.start_date && <span className="text-sm text-slate-500">{fmtDate(job.start_date)}{job.end_date && job.end_date !== job.start_date ? ` – ${fmtDate(job.end_date)}` : ''} · {job.start_time}–{job.end_time}</span>}
          </div>
          <div className="text-sm text-slate-600">{job.customer_name} · {job.address}</div>
          {job.description && <p className="text-sm text-slate-600">{job.description}</p>}
          {job.materials && <div className="text-sm bg-amber-50 text-amber-800 rounded-lg px-3 py-2">Materials: {job.materials}</div>}

          <div>
            <div className="label mb-2">Status</div>
            <div className="flex gap-1 flex-wrap">
              {STATUSES.map((s) => (
                <button key={s} onClick={() => setStatus(s)} className={`px-2.5 py-1 rounded-md text-xs font-medium ${job.status === s ? 'bg-navy-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{s.replace('_', ' ')}</button>
              ))}
            </div>
          </div>

          <div>
            <div className="label mb-2">Crew assigned</div>
            <div className="flex flex-wrap gap-2">
              {staff.map((s) => (
                <button key={s.id} onClick={() => toggleCrew(s.id)} className={`flex items-center gap-1.5 rounded-full pl-1 pr-3 py-1 text-xs font-medium border ${crew.includes(s.id) ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500'}`}>
                  <Avatar name={s.name} color={s.color} size={5} /> {s.name.split(' ')[0]}
                </button>
              ))}
            </div>
            <button onClick={saveCrew} className="btn-secondary !py-1 !px-3 text-xs mt-2">Save crew</button>
          </div>

          <div>
            <div className="label mb-2 flex items-center gap-1.5"><MessageSquare size={13} /> Job chat</div>
            <div className="space-y-1.5 max-h-40 overflow-y-auto mb-2">
              {messages.length === 0 && <p className="text-xs text-slate-400">No messages yet.</p>}
              {messages.map((m) => (
                <div key={m.id} className="text-sm bg-slate-50 rounded-lg px-3 py-1.5">
                  <span className="font-medium text-slate-700">{m.user_name}: </span>
                  <span className="text-slate-600">{m.body}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input className="input flex-1 !py-1.5 text-sm" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Message the crew…" onKeyDown={(e) => e.key === 'Enter' && sendMsg()} />
              <button onClick={sendMsg} className="btn-secondary !py-1.5 text-xs">Send</button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
