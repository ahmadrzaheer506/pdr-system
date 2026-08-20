import React, { useEffect, useState } from 'react';
import { Plug, Building2, Users, Plus, ExternalLink, Copy } from 'lucide-react';
import { api, fmtTimeAgo } from '../lib/api';
import { PageLoading, ModeBadge, Avatar, Modal, useToast, Toast } from '../components/ui.jsx';
import { useAuth } from '../lib/auth.jsx';

const TABS = [
  { id: 'integrations', label: 'Integrations', icon: Plug },
  { id: 'company', label: 'Company', icon: Building2 },
  { id: 'staff', label: 'Staff & Users', icon: Users },
];

export default function Settings() {
  const { user } = useAuth();
  const [tab, setTab] = useState('integrations');
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500 text-sm mt-0.5">Connections, company details, and staff accounts.</p>
      </div>
      <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1 w-fit">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 px-3.5 py-1.5 text-sm rounded-md font-medium ${tab === t.id ? 'bg-navy-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>
      {tab === 'integrations' && <IntegrationsTab />}
      {tab === 'company' && <CompanyTab canEdit={user.role === 'ADMIN'} />}
      {tab === 'staff' && <StaffTab canEdit={user.role === 'ADMIN'} />}
    </div>
  );
}

function IntegrationsTab() {
  const [data, setData] = useState(null);
  const { toast, show } = useToast();
  const load = () => api.get('/settings/integrations').then(setData);
  useEffect(() => { load(); }, []);
  if (!data) return <PageLoading />;

  const connect = async (id) => {
    try {
      const { url } = await api.get(`/integrations/${id}/connect`);
      window.open(url, '_blank');
    } catch (err) { show(err.message, 'error'); }
  };
  const copy = (text) => { navigator.clipboard?.writeText(text); show('Copied to clipboard'); };

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        {data.integrations.map((intg) => (
          <div key={intg.id} className="card p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold text-slate-800">{intg.name}</div>
                <ModeBadge mode={intg.mode} />
              </div>
              {(intg.id === 'google' || intg.id === 'quickbooks') && intg.configured && !intg.connected && (
                <button onClick={() => connect(intg.id)} className="btn-primary !py-1.5 !px-3 text-xs">Connect</button>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-2">{intg.detail}</p>
            {intg.webhook_url && (
              <button onClick={() => copy(intg.webhook_url)} className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-600 font-mono bg-slate-50 rounded px-2 py-1 w-full text-left truncate">
                <Copy size={11} className="flex-shrink-0" /> <span className="truncate">{intg.webhook_url}</span>
              </button>
            )}
            {intg.env_needed && (
              <div className="mt-2 text-[11px] text-slate-400">Needs: {intg.env_needed.join(', ')}</div>
            )}
          </div>
        ))}
      </div>

      <div className="card p-4">
        <h3 className="font-semibold text-slate-800 mb-3">Recent integration activity</h3>
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {data.events.length === 0 && <p className="text-sm text-slate-400">No events yet.</p>}
          {data.events.map((e) => (
            <div key={e.id} className="flex items-center gap-2 text-xs">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${e.status === 'error' ? 'bg-red-500' : e.status === 'simulated' ? 'bg-amber-400' : 'bg-emerald-500'}`} />
              <span className="font-medium text-slate-600 capitalize">{e.provider}</span>
              <span className="text-slate-400">{e.event}</span>
              <span className="text-slate-300 ml-auto flex-shrink-0">{fmtTimeAgo(e.created_at)}</span>
            </div>
          ))}
        </div>
      </div>
      <Toast {...toast} />
    </div>
  );
}

function CompanyTab({ canEdit }) {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const { toast, show } = useToast();
  useEffect(() => { api.get('/settings').then((d) => setSettings(d.settings)); }, []);
  if (!settings) return <PageLoading />;

  const set = (k) => (e) => setSettings({ ...settings, company: { ...settings.company, [k]: e.target.value } });
  const setNum = (k) => (e) => setSettings({ ...settings, [k]: Number(e.target.value) });

  const save = async () => {
    setSaving(true);
    try { await api.put('/settings', settings); show('Saved'); } catch (err) { show(err.message, 'error'); } finally { setSaving(false); }
  };

  return (
    <div className="card p-5 max-w-2xl space-y-4">
      <h3 className="font-semibold text-slate-800">Company details</h3>
      <p className="text-xs text-slate-400 -mt-2">Used on quotes and invoices.</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><label className="label">Company name</label><input className="input" disabled={!canEdit} value={settings.company.name} onChange={set('name')} /></div>
        <div className="col-span-2"><label className="label">Address</label><input className="input" disabled={!canEdit} value={settings.company.address} onChange={set('address')} /></div>
        <div><label className="label">Phone</label><input className="input" disabled={!canEdit} value={settings.company.phone} onChange={set('phone')} /></div>
        <div><label className="label">Email</label><input className="input" disabled={!canEdit} value={settings.company.email} onChange={set('email')} /></div>
        <div><label className="label">VAT number</label><input className="input" disabled={!canEdit} value={settings.company.vat_number} onChange={set('vat_number')} /></div>
        <div><label className="label">Company number</label><input className="input" disabled={!canEdit} value={settings.company.company_number} onChange={set('company_number')} /></div>
      </div>
      <h3 className="font-semibold text-slate-800 pt-2">Rules</h3>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">VAT rate (%)</label><input className="input" type="number" disabled={!canEdit} value={settings.vat_rate} onChange={setNum('vat_rate')} /></div>
        <div><label className="label">Quote validity (days)</label><input className="input" type="number" disabled={!canEdit} value={settings.quote_validity_days} onChange={setNum('quote_validity_days')} /></div>
        <div><label className="label">Invoice due (days)</label><input className="input" type="number" disabled={!canEdit} value={settings.invoice_due_days} onChange={setNum('invoice_due_days')} /></div>
        <div><label className="label">Holiday notice required (days)</label><input className="input" type="number" disabled={!canEdit} value={settings.holiday_notice_days} onChange={setNum('holiday_notice_days')} /></div>
      </div>
      {canEdit && <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save changes'}</button>}
      <Toast {...toast} />
    </div>
  );
}

const SKILL_OPTIONS = ['roofer', 'labourer', 'slate', 'flat_roof', 'felt', 'lead_work', 'guttering', 'chimney'];

function StaffTab({ canEdit }) {
  const [users, setUsers] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const { toast, show } = useToast();
  const load = () => api.get('/settings/users').then((d) => setUsers(d.users));
  useEffect(() => { load(); }, []);
  if (!users) return <PageLoading />;

  const toggleActive = async (u) => {
    try { await api.put(`/settings/users/${u.id}`, { active: !u.active }); load(); } catch (err) { show(err.message, 'error'); }
  };

  return (
    <div className="space-y-4">
      {canEdit && <button className="btn-primary" onClick={() => setAddOpen(true)}><Plus size={16} /> Add staff member</button>}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
            <tr><th className="text-left px-4 py-2.5">Name</th><th className="text-left px-4 py-2.5">Role</th><th className="text-left px-4 py-2.5">Skills</th><th className="text-left px-4 py-2.5">Contact</th><th className="px-4 py-2.5"></th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-slate-100">
                <td className="px-4 py-3"><div className="flex items-center gap-2"><Avatar name={u.name} color={u.color} size={7} /> <span className={!u.active ? 'text-slate-400 line-through' : 'font-medium text-slate-800'}>{u.name}</span></div></td>
                <td className="px-4 py-3 text-slate-500">{u.role === 'ADMIN' ? 'Owner/Admin' : u.role === 'OFFICE' ? 'Office' : 'Field staff'}</td>
                <td className="px-4 py-3 text-slate-400 text-xs">{u.skills.join(', ') || '—'}{u.is_driver ? ' · driver' : ''}</td>
                <td className="px-4 py-3 text-slate-400 text-xs">{u.phone}<br />{u.email}</td>
                <td className="px-4 py-3 text-right">{canEdit && <button onClick={() => toggleActive(u)} className="btn-ghost !py-1 !px-2 text-xs">{u.active ? 'Deactivate' : 'Activate'}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AddStaffModal open={addOpen} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); load(); }} />
      <Toast {...toast} />
    </div>
  );
}

function AddStaffModal({ open, onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', role: 'STAFF', skills: [], is_driver: false, color: '#0ea5e9' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const toggleSkill = (s) => setForm((f) => ({ ...f, skills: f.skills.includes(s) ? f.skills.filter((x) => x !== s) : [...f.skills, s] }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try { await api.post('/settings/users', form); onSaved(); }
    catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add a staff member">
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
        <div><label className="label">Name</label><input className="input" value={form.name} onChange={set('name')} required /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Email (their login)</label><input className="input" type="email" value={form.email} onChange={set('email')} required /></div>
          <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={set('phone')} /></div>
        </div>
        <div><label className="label">Temporary password</label><input className="input" value={form.password} onChange={set('password')} required minLength={8} /></div>
        <div>
          <label className="label">Role</label>
          <select className="input" value={form.role} onChange={set('role')}>
            <option value="STAFF">Field staff — jobs only, no prices/financials</option>
            <option value="OFFICE">Office — CRM, quotes, scheduling</option>
            <option value="ADMIN">Owner/Admin — full access</option>
          </select>
        </div>
        {form.role === 'STAFF' && (
          <>
            <div>
              <label className="label">Skills</label>
              <div className="flex flex-wrap gap-1.5">
                {SKILL_OPTIONS.map((s) => (
                  <button type="button" key={s} onClick={() => toggleSkill(s)} className={`px-2.5 py-1 rounded-md text-xs font-medium ${form.skills.includes(s) ? 'bg-navy-900 text-white' : 'bg-slate-100 text-slate-500'}`}>{s}</button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={form.is_driver} onChange={(e) => setForm({ ...form, is_driver: e.target.checked })} /> Can drive
            </label>
          </>
        )}
        <button className="btn-primary w-full" disabled={saving}>{saving ? 'Creating…' : 'Create account'}</button>
      </form>
    </Modal>
  );
}
