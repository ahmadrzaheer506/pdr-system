import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Phone, MessageSquare, Send } from 'lucide-react';
import { api, fmtDate } from '../../lib/api';
import { PageLoading, LoadError, PriorityBadge, useToast, Toast } from '../../components/ui.jsx';
import ClockWidget from '../../components/ClockWidget.jsx';
import JobKit from '../../components/JobKit.jsx';
import JobFiles from '../../components/JobFiles.jsx';

export default function StaffJobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [messages, setMessages] = useState([]);
  const [msg, setMsg] = useState('');
  const { toast, show } = useToast();

  const load = () => api.get(`/staff/jobs/${id}`).then((d) => {
    setLoadError('');
    setJob(d.job);
    setMessages(d.messages);
  }).catch((err) => {
    show(err.message, 'error');
    setLoadError(err.message || 'Could not load this job');
  });
  useEffect(() => {
    let cancelled = false;
    api.get(`/staff/jobs/${id}`).then((d) => {
      if (cancelled) return;
      setLoadError('');
      setJob(d.job);
      setMessages(d.messages);
    }).catch((err) => {
      if (cancelled) return;
      show(err.message, 'error');
      setLoadError(err.message || 'Could not load this job');
    });
    return () => { cancelled = true; };
  }, [id, show]);

  const send = async () => {
    if (!msg.trim()) return;
    try {
      await api.post(`/staff/jobs/${id}/messages`, { body: msg });
      setMsg('');
      load();
    } catch (err) {
      show(err.message, 'error');
    }
  };

  if (loadError && !job) return <LoadError message={loadError} />;
  if (!job) return <PageLoading />;

  return (
    <div className="space-y-4">
      {toast && <Toast {...toast} />}
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-slate-500"><ArrowLeft size={15} /> Back</button>

      <ClockWidget jobId={job.id} jobTitle={job.title} onChange={load} />

      <div className="card p-4">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <h1 className="text-lg font-bold text-slate-900">{job.title}</h1>
          {job.priority !== 'normal' && <PriorityBadge priority={job.priority} />}
        </div>
        <div className="text-sm text-slate-500">{job.customer_name}</div>
        <div className="mt-3 space-y-2 text-sm">
          <a href={`https://maps.google.com/?q=${encodeURIComponent(job.address)}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-brand-600"><MapPin size={15} /> {job.address}</a>
          {job.customer_phone && <a href={`tel:${job.customer_phone}`} className="flex items-center gap-2 text-brand-600"><Phone size={15} /> {job.customer_phone}</a>}
        </div>
        <div className="mt-3 text-sm text-slate-500">
          {fmtDate(job.start_date)}{job.end_date && job.end_date !== job.start_date ? ` – ${fmtDate(job.end_date)}` : ''} · {job.start_time}–{job.end_time}
        </div>
        {job.description && <p className="mt-3 text-sm text-slate-600 border-t border-slate-100 pt-3">{job.description}</p>}
        {job.crew?.length > 0 && (
          <div className="mt-3 text-sm text-slate-500">With: {job.crew.map((c) => c.name).join(', ')}</div>
        )}
      </div>

      <div className="card p-4">
        <JobKit
          jobId={job.id}
          apiBase="/staff/jobs"
          materialLines={job.material_lines || []}
          checklistItems={job.checklist_items || []}
          materialsNote={job.materials}
          allowTemplates={false}
          onChanged={load}
          onError={(msg) => show(msg, 'error')}
        />
      </div>

      <div className="card p-4">
        <JobFiles
          jobId={job.id}
          apiBase="/staff/jobs"
          files={job.files || []}
          notes={job.notes}
          onChanged={load}
          onError={(msg) => show(msg, 'error')}
        />
      </div>

      <div className="card p-4">
        <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-1.5"><MessageSquare size={15} /> Job chat</h3>
        <div className="space-y-2 max-h-64 overflow-y-auto mb-3">
          {messages.length === 0 && <p className="text-sm text-slate-400">No messages yet.</p>}
          {messages.map((m) => (
            <div key={m.id} className="bg-slate-50 rounded-lg px-3 py-2 text-sm">
              <span className="font-medium text-slate-700">{m.user_name}: </span><span className="text-slate-600">{m.body}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input className="input flex-1" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Message about this job…" onKeyDown={(e) => e.key === 'Enter' && send()} />
          <button onClick={send} className="btn-primary"><Send size={16} /></button>
        </div>
      </div>
    </div>
  );
}
