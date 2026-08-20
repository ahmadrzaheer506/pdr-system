import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Phone, Mail, MessageCircle, Facebook, Edit3, Plus, Sparkles } from 'lucide-react';
import { api, fmtTimeAgo } from '../lib/api';
import { PageLoading, EmptyState, Modal, StatusBadge, useToast, Toast } from '../components/ui.jsx';

const SOURCE_ICON = { whatsapp: MessageCircle, facebook: Facebook, facebook_lead: Facebook, email: Mail, phone: Phone, sms: Phone, manual: Edit3 };
const SOURCE_COLOR = { whatsapp: 'text-green-600 bg-green-50', facebook: 'text-blue-600 bg-blue-50', facebook_lead: 'text-blue-600 bg-blue-50', email: 'text-purple-600 bg-purple-50', phone: 'text-amber-600 bg-amber-50', sms: 'text-pink-600 bg-pink-50', manual: 'text-slate-600 bg-slate-100' };

export default function Inbox() {
  const [status, setStatus] = useState('NEW');
  const [data, setData] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [simLoading, setSimLoading] = useState(false);
  const { toast, show } = useToast();

  const load = () => api.get(`/leads?status=${status}`).then(setData);
  useEffect(() => { load(); }, [status]);

  const simulate = async (source) => {
    setSimLoading(true);
    try {
      await api.post('/integrations/simulate/enquiry', { source });
      show(`Simulated a new ${source} enquiry`);
      load();
    } finally { setSimLoading(false); }
  };

  const markActioned = async (id) => { await api.put(`/leads/${id}`, { status: 'ACTIONED' }); load(); };

  if (!data) return <PageLoading />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Lead Inbox</h1>
          <p className="text-slate-500 text-sm mt-0.5">Every enquiry, whatever channel it came from — one place, nothing missed.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setAddOpen(true)}><Plus size={16} /> Log enquiry</button>
        </div>
      </div>

      <div className="card p-3 flex items-center gap-2 flex-wrap bg-brand-50/50 border-brand-100">
        <Sparkles size={16} className="text-brand-500 ml-1" />
        <span className="text-sm text-slate-600 mr-1">Demo simulator — inject a test enquiry (no API keys needed):</span>
        {['whatsapp', 'facebook', 'email', 'phone'].map((s) => (
          <button key={s} disabled={simLoading} onClick={() => simulate(s)} className="btn-secondary !py-1 !px-2.5 text-xs capitalize">{s}</button>
        ))}
      </div>

      <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1 w-fit">
        {['NEW', 'ACTIONED', 'CONVERTED', 'ALL'].map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={`px-3.5 py-1.5 text-sm rounded-md font-medium ${status === s ? 'bg-navy-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
            {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()} {data.counts[s] ? <span className="opacity-60">({data.counts[s]})</span> : ''}
          </button>
        ))}
      </div>

      {data.leads.length === 0 ? (
        <EmptyState icon={Mail} title="No leads here" detail="New enquiries from WhatsApp, Facebook, email, phone or manual entry will land in this inbox automatically." />
      ) : (
        <div className="space-y-2">
          {data.leads.map((lead) => {
            const Icon = SOURCE_ICON[lead.source] || Edit3;
            return (
              <div key={lead.id} className="card p-4 flex items-start gap-3">
                <div className={`rounded-lg p-2 flex-shrink-0 ${SOURCE_COLOR[lead.source] || 'text-slate-600 bg-slate-100'}`}><Icon size={16} /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link to={`/customers/${lead.customer_id}`} className="font-semibold text-slate-900 hover:text-brand-600">{lead.customer_name}</Link>
                    <StatusBadge status={lead.status} />
                    <span className="text-xs text-slate-400 capitalize">{lead.source.replace('_', ' ')}</span>
                    <span className="text-xs text-slate-400">· {fmtTimeAgo(lead.created_at)}</span>
                  </div>
                  {lead.message && <p className="text-sm text-slate-600 mt-1 line-clamp-2">{lead.message}</p>}
                  <div className="text-xs text-slate-400 mt-1">{lead.phone || lead.email || ''}</div>
                </div>
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  <Link to={`/customers/${lead.customer_id}`} className="btn-primary !py-1.5 !px-3 text-xs">Open</Link>
                  {lead.status === 'NEW' && <button onClick={() => markActioned(lead.id)} className="btn-ghost !py-1.5 !px-3 text-xs">Mark actioned</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AddLeadModal open={addOpen} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); load(); }} />
      <Toast {...toast} />
    </div>
  );
}

function AddLeadModal({ open, onClose, onSaved }) {
  const [form, setForm] = useState({ source: 'manual', name: '', phone: '', email: '', address: '', message: '' });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try { await api.post('/leads', form); onSaved(); setForm({ source: 'manual', name: '', phone: '', email: '', address: '', message: '' }); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Log an enquiry">
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">Came in via</label>
          <select className="input" value={form.source} onChange={set('source')}>
            <option value="manual">Logged manually (e.g. personal mobile call)</option>
            <option value="phone">Phone</option>
            <option value="email">Email</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="facebook">Facebook</option>
          </select>
        </div>
        <div><label className="label">Name</label><input className="input" value={form.name} onChange={set('name')} required /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={set('phone')} /></div>
          <div><label className="label">Email</label><input className="input" value={form.email} onChange={set('email')} /></div>
        </div>
        <div><label className="label">Address</label><input className="input" value={form.address} onChange={set('address')} /></div>
        <div><label className="label">What do they need?</label><textarea className="input" rows={3} value={form.message} onChange={set('message')} /></div>
        <button className="btn-primary w-full" disabled={saving}>{saving ? 'Saving…' : 'Add to inbox'}</button>
      </form>
    </Modal>
  );
}
