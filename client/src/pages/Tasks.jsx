import React, { useEffect, useState } from 'react';
import { Check, Plus, CheckSquare, X } from 'lucide-react';
import { api, fmtDate } from '../lib/api';
import { PageLoading, PriorityBadge, EmptyState, Modal, useToast, Toast } from '../components/ui.jsx';

export default function Tasks() {
  const [when, setWhen] = useState('ALL');
  const [data, setData] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const { toast, show } = useToast();

  const load = () => api.get(`/tasks?status=open${when !== 'ALL' ? `&when=${when}` : ''}`).then(setData);
  useEffect(() => { load(); }, [when]);

  const complete = async (t) => { await api.put(`/tasks/${t.id}`, { status: 'done' }); show('Task completed'); load(); };
  const dismiss = async (t) => { await api.put(`/tasks/${t.id}`, { status: 'dismissed' }); load(); };

  if (!data) return <PageLoading />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tasks & Reminders</h1>
          <p className="text-slate-500 text-sm mt-0.5">Generated automatically by the system, plus anything you add manually.</p>
        </div>
        <button className="btn-primary" onClick={() => setAddOpen(true)}><Plus size={16} /> Add task</button>
      </div>

      <div className="flex gap-3">
        {[['ALL', 'All open', data.counts.open], ['overdue', 'Overdue', data.counts.overdue], ['today', 'Due today', data.counts.today]].map(([key, label, count]) => (
          <button key={key} onClick={() => setWhen(key)} className={`card px-4 py-3 flex-1 text-left transition-colors ${when === key ? 'ring-2 ring-brand-400' : ''}`}>
            <div className="text-2xl font-bold text-slate-900">{count}</div>
            <div className="text-xs text-slate-500">{label}</div>
          </button>
        ))}
      </div>

      {data.tasks.length === 0 ? (
        <EmptyState icon={CheckSquare} title="All clear" detail="Nothing outstanding right now." />
      ) : (
        <div className="space-y-2">
          {data.tasks.map((t) => {
            const overdue = t.due_date && new Date(t.due_date) < new Date(new Date().toDateString());
            return (
              <div key={t.id} className="card p-4 flex items-start gap-3">
                <button onClick={() => complete(t)} className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 border-slate-300 hover:border-emerald-500 hover:bg-emerald-50 flex items-center justify-center">
                  <Check size={12} className="text-transparent hover:text-emerald-600" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-slate-800">{t.title}</span>
                    <PriorityBadge priority={t.priority} />
                    {t.type === 'system' && <span className="badge bg-slate-100 text-slate-500">auto</span>}
                  </div>
                  {t.detail && <p className="text-sm text-slate-500 mt-0.5">{t.detail}</p>}
                  <div className={`text-xs mt-1 ${overdue ? 'text-red-500 font-medium' : 'text-slate-400'}`}>
                    {t.due_date ? `Due ${fmtDate(t.due_date)}${overdue ? ' — overdue' : ''}` : 'No due date'}
                    {t.assignee_name ? ` · ${t.assignee_name}` : ''}
                  </div>
                </div>
                <button onClick={() => dismiss(t)} className="text-slate-300 hover:text-slate-500 flex-shrink-0"><X size={16} /></button>
              </div>
            );
          })}
        </div>
      )}

      <AddTaskModal open={addOpen} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); load(); }} />
      <Toast {...toast} />
    </div>
  );
}

function AddTaskModal({ open, onClose, onSaved }) {
  const [form, setForm] = useState({ title: '', detail: '', due_date: new Date().toISOString().slice(0, 10), priority: 'normal' });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try { await api.post('/tasks', form); onSaved(); setForm({ title: '', detail: '', due_date: new Date().toISOString().slice(0, 10), priority: 'normal' }); }
    finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Add a task">
      <form onSubmit={submit} className="space-y-3">
        <div><label className="label">Title</label><input className="input" value={form.title} onChange={set('title')} required /></div>
        <div><label className="label">Detail</label><textarea className="input" rows={2} value={form.detail} onChange={set('detail')} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Due date</label><input className="input" type="date" value={form.due_date} onChange={set('due_date')} /></div>
          <div>
            <label className="label">Priority</label>
            <select className="input" value={form.priority} onChange={set('priority')}>
              <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option>
            </select>
          </div>
        </div>
        <button className="btn-primary w-full" disabled={saving}>{saving ? 'Saving…' : 'Add task'}</button>
      </form>
    </Modal>
  );
}
