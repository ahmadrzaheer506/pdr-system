import React, { useEffect, useRef, useState } from 'react';
import { Plug, Building2, Users, Plus, ExternalLink, Copy, Shield, Trash2, Bell, Package, FileText, Search, MoreHorizontal, Landmark, Percent, Image, Clock, Mail, Upload } from 'lucide-react';
import { api, fmtTimeAgo, fmtDate, money } from '../lib/api';
import { PageLoading, LoadError, ModeBadge, Avatar, Modal, ConfirmModal, useToast, Toast, avatarUrl } from '../components/ui.jsx';
import { useAuth } from '../lib/auth.jsx';
import { ROLES } from '../lib/roles';
import { SKILL_OPTIONS, skillLabel } from '../lib/skills';
import NotificationPrefsForm from '../components/NotificationPrefsForm.jsx';
import { CORE_VAT_CODES, FALLBACK_VAT_RATES } from '../lib/taxDefaults';
import { CIS_RATE_OPTIONS } from '../lib/invoiceTax';
import CatalogueSettings from '../components/CatalogueSettings.jsx';
import TemplateSettings from '../components/TemplateSettings.jsx';
import BrandLogo, { bumpBrandLogo } from '../components/BrandLogo.jsx';
import SelectMenu from '../components/SelectMenu.jsx';
import DatePicker from '../components/DatePicker.jsx';

const TABS = [
  { id: 'company', label: 'Company', icon: Building2 },
  { id: 'catalogue', label: 'Catalogue', icon: Package },
  { id: 'staff', label: 'Staff & Users', icon: Users },
  { id: 'templates', label: 'Templates', icon: FileText },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'integrations', label: 'Integrations', icon: Plug },
  { id: 'security', label: 'Security log', icon: Shield, adminOnly: true },
];

const TIMESHEET_DEFAULTS = {
  enabled: true,
  require_location: true,
  site_radius_m: 300,
  require_photo_on_clockout: false,
  round_to_minutes: 0,
  max_shift_hours: 14,
};

function timesheetSettingsPayload(raw) {
  const src = { ...TIMESHEET_DEFAULTS, ...(raw || {}) };
  return Object.fromEntries(Object.keys(TIMESHEET_DEFAULTS).map((key) => [key, src[key]]));
}

const TIMESHEET_BOOL_FIELDS = [
  { key: 'enabled', label: 'Timesheets enabled' },
  { key: 'require_location', label: 'Require location' },
  { key: 'require_photo_on_clockout', label: 'Require photo on clock-out' },
];

const ROLE_OPTIONS = [
  { value: ROLES.STAFF, label: 'Field staff — jobs only, no prices/financials' },
  { value: ROLES.OFFICE, label: 'Office — CRM, quotes, scheduling' },
  { value: ROLES.ADMIN, label: 'Owner/Admin — full access' },
];

const CHANNEL_OPTIONS = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email' },
];

const STAFF_STATUS_FILTER = [
  { value: 'all', label: 'Status' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

const STAFF_ROLE_FILTER = [
  { value: 'all', label: 'Role' },
  { value: ROLES.ADMIN, label: 'Owner/Admin' },
  { value: ROLES.OFFICE, label: 'Office' },
  { value: ROLES.STAFF, label: 'Field staff' },
];

const TIMESHEET_NUM_FIELDS = [
  { key: 'site_radius_m', label: 'Site radius (metres)', min: 0, max: 10000 },
  { key: 'round_to_minutes', label: 'Round to (minutes)', min: 0, max: 60 },
  { key: 'max_shift_hours', label: 'Max shift (hours)', min: 0, max: 24, step: 0.5 },
];

const SECURITY_ACTION_LABELS = {
  login_success: 'Login success',
  login_failure: 'Login failure',
  logout: 'Logout',
  user_create: 'User created',
  role_change: 'Role change',
  deactivate: 'Deactivated',
  reactivate: 'Reactivated',
  password_change: 'Password change',
  admin_temp_password: 'Admin temporary password',
  forgot_password: 'Forgot password',
  password_reset: 'Password reset',
};

function SettingsSection({ title, hint, icon: Icon, children, className = '' }) {
  return (
    <section className={`flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 ${className}`}>
      <div className="mb-5 flex items-start gap-3">
        {Icon ? (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
            <Icon size={15} />
          </div>
        ) : null}
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>
          {hint ? <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{hint}</p> : null}
        </div>
      </div>
      <div className="flex-1">{children}</div>
    </section>
  );
}

function CheckRow({ id, checked, disabled, onChange, children }) {
  return (
    <label
      htmlFor={id}
      className={`flex items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-800 ${disabled ? 'opacity-60' : 'cursor-pointer hover:border-slate-300 hover:bg-slate-50'}`}
    >
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={onChange} className="h-4 w-4 shrink-0 rounded border-slate-300 accent-brand-500" />
      {children}
    </label>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const [tab, setTab] = useState('company');
  const visibleTabs = TABS.filter((t) => !t.adminOnly || user.role === ROLES.ADMIN);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-slate-500 text-sm mt-0.5">Connections, company details, and staff accounts.</p>
      </div>
      <nav className="-mx-4 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:px-0" aria-label="Settings sections">
        <div className="flex w-max min-w-full gap-1 rounded-xl border border-slate-200 bg-white p-1.5">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 text-sm font-medium transition-colors ${
                tab === t.id ? 'bg-navy-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}
            >
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>
      </nav>
      {tab === 'integrations' && <IntegrationsTab />}
      {tab === 'notifications' && <NotificationPrefsForm />}
      {tab === 'company' && <CompanyTab canEdit={user.role === ROLES.ADMIN} />}
      {tab === 'catalogue' && <CatalogueSettings canEdit={user.role === ROLES.ADMIN} />}
      {tab === 'templates' && <TemplateSettings canEdit={user.role === ROLES.ADMIN} />}
      {tab === 'staff' && <StaffTab canEdit={user.role === ROLES.ADMIN} />}
      {tab === 'security' && user.role === ROLES.ADMIN && <SecurityLogTab />}
    </div>
  );
}

function IntegrationsTab() {
  const [data, setData] = useState(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const { toast, show } = useToast();
  const load = () => api.get('/settings/integrations').then(setData).catch((err) => {
    show(err.message, 'error');
    setData((current) => current || { integrations: [], events: [] });
  });
  useEffect(() => { load(); }, []);
  if (!data) return <PageLoading />;

  const connect = async (id) => {
    try {
      const { url } = await api.get(`/integrations/${id}/connect`);
      window.open(url, '_blank');
    } catch (err) { show(err.message, 'error'); }
  };
  const disconnectGoogle = async () => {
    setDisconnecting(true);
    try {
      await api.post('/integrations/google/disconnect');
      show('Google Calendar disconnected');
      setConfirmDisconnect(false);
      load();
    } catch (err) {
      show(err.message, 'error');
    } finally {
      setDisconnecting(false);
    }
  };
  const copy = (text) => { navigator.clipboard?.writeText(text); show('Copied to clipboard'); };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        {data.integrations.map((intg) => (
          <div key={intg.id} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-slate-900">{intg.name}</div>
                <div className="mt-1"><ModeBadge mode={intg.mode} /></div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {(intg.id === 'google' || intg.id === 'quickbooks') && intg.configured && !intg.connected && (
                  <button type="button" onClick={() => connect(intg.id)} className="btn-primary !py-1.5 !px-3 text-xs">Connect</button>
                )}
                {intg.id === 'google' && intg.connected && (
                  <button type="button" onClick={() => setConfirmDisconnect(true)} className="btn-secondary !py-1.5 !px-3 text-xs">Disconnect</button>
                )}
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-2">{intg.detail}</p>
            {intg.webhook_url && (
              <button onClick={() => copy(intg.webhook_url)} className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-600 font-mono bg-slate-50 rounded-lg px-2 py-1 w-full text-left truncate">
                <Copy size={11} className="flex-shrink-0" /> <span className="truncate">{intg.webhook_url}</span>
              </button>
            )}
            {intg.env_needed && (
              <div className="mt-2 text-[11px] text-slate-400">Needs: {intg.env_needed.join(', ')}</div>
            )}
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <h3 className="text-[15px] font-semibold text-slate-900 mb-4">Recent integration activity</h3>
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
      </section>
      <ConfirmModal
        open={confirmDisconnect}
        title="Disconnect Google Calendar?"
        message="Site visits, jobs, holidays and tasks will stop syncing to Google Calendar. Nothing already on the calendar is deleted, and you can reconnect any time from here."
        confirmLabel="Yes, disconnect"
        busyLabel="Disconnecting…"
        danger
        busy={disconnecting}
        onConfirm={disconnectGoogle}
        onCancel={() => setConfirmDisconnect(false)}
      />
      <Toast {...toast} />
    </div>
  );
}

const FALLBACK_FOLLOWUP_STEPS = [
  {
    delay_days: 2,
    channel: 'whatsapp',
    body: 'Hi {name}, just checking you received our quotation {ref} for {title}. How are you getting on with it? Happy to answer any questions.',
  },
  {
    delay_days: 5,
    channel: 'email',
    body: "Hi {name}, following up one last time on quotation {ref}. If you'd like us to adjust anything or talk it through, just let us know — otherwise we'll leave it with you.",
  },
];

function hydrateFollowups(settings) {
  const fu = settings.followups || {};
  const rawSteps = Array.isArray(fu.steps) && fu.steps.length ? fu.steps : FALLBACK_FOLLOWUP_STEPS;
  return {
    enabled: fu.enabled !== false,
    email_subject: fu.email_subject || 'How did you get on with our quotation {ref}?',
    steps: rawSteps.map((s) => ({
      delay_days: Number(s.delay_days) || 0,
      channel: s.channel === 'email' ? 'email' : 'whatsapp',
      body: s.body != null ? String(s.body).trim() : '',
    })),
  };
}

function CompanyTab({ canEdit }) {
  const [settings, setSettings] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoSrc, setLogoSrc] = useState('/api/branding/logo');
  const { toast, show } = useToast();
  useEffect(() => {
    api.get('/settings').then((d) => {
      const s = d.settings || {};
      setLoadError('');
      setSettings({
        ...s,
        followups: hydrateFollowups(s),
        automation: { interval_minutes: Number(s.automation?.interval_minutes) || 5 },
        timesheets: timesheetSettingsPayload(s.timesheets),
        holiday_allowance_days: Number.isFinite(Number(s.holiday_allowance_days))
          ? Number(s.holiday_allowance_days)
          : 28,
      });
    }).catch((err) => setLoadError(err.message || 'Could not load company settings'));
  }, []);
  if (loadError) return <LoadError message={loadError} />;
  if (!settings) return <PageLoading />;

  const company = settings.company || {};
  const set = (k) => (e) => setSettings((s) => ({ ...s, company: { ...(s.company || {}), [k]: e.target.value } }));
  const setNum = (k) => (e) => setSettings((s) => ({ ...s, [k]: Number(e.target.value) }));
  const setUkFlag = (k) => (e) => setSettings((s) => ({
    ...s,
    uk: { ...(s.uk || {}), [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value },
  }));
  const vatRates = Array.isArray(settings.uk?.vat_rates) && settings.uk.vat_rates.length
    ? settings.uk.vat_rates
    : FALLBACK_VAT_RATES.map((r) => ({ ...r }));

  const setVatRates = (next) => {
    const standard = next.find((r) => r.code === 'standard');
    setSettings((s) => ({
      ...s,
      vat_rate: standard ? Number(standard.rate) : s.vat_rate,
      uk: { ...(s.uk || {}), vat_rates: next },
    }));
  };

  const save = async () => {
    const interval = Number(settings.automation?.interval_minutes);
    if (!Number.isInteger(interval) || interval < 1 || interval > 60) {
      show('Automation interval must be a whole number of minutes from 1 to 60', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.put('/settings', {
        company: settings.company,
        uk: { ...(settings.uk || {}), vat_rates: vatRates },
        vat_rate: settings.vat_rate,
        quote_validity_days: settings.quote_validity_days,
        invoice_due_days: settings.invoice_due_days,
        holiday_notice_days: settings.holiday_notice_days,
        holiday_allowance_days: settings.holiday_allowance_days,
        automation: { interval_minutes: interval },
        followups: settings.followups,
        timesheets: timesheetSettingsPayload(settings.timesheets),
      });
      show('Saved');
    } catch (err) { show(err.message, 'error'); } finally { setSaving(false); }
  };

  const ts = timesheetSettingsPayload(settings.timesheets);
  const setTsBool = (k) => (e) => setSettings((s) => ({
    ...s,
    timesheets: timesheetSettingsPayload({ ...(s.timesheets || {}), [k]: e.target.checked }),
  }));
  const setTsNum = (k) => (e) => setSettings((s) => ({
    ...s,
    timesheets: timesheetSettingsPayload({ ...(s.timesheets || {}), [k]: Number(e.target.value) }),
  }));

  const uploadLogo = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    setLogoBusy(true);
    try {
      await api.upload('/settings/logo', fd);
      const next = `/api/branding/logo?v=${Date.now()}`;
      setLogoSrc(next);
      bumpBrandLogo(next);
      show('Logo updated');
    } catch (err) {
      show(err.message, 'error');
    } finally {
      setLogoBusy(false);
    }
  };

  const saveBar = canEdit ? (
    <div className="flex items-center justify-between gap-3">
      <p className="min-w-0 truncate text-sm text-slate-500">These details appear on quotes, invoices, and PDFs.</p>
      <button type="button" onClick={save} disabled={saving} className="btn-primary shrink-0">
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  ) : null;

  return (
    <div>
      {saveBar ? <div className="mb-5 border-b border-slate-200 pb-4">{saveBar}</div> : null}

      <div className="space-y-5">
      <div className="grid items-stretch gap-5 lg:grid-cols-5">
        <SettingsSection
          className="lg:col-span-3"
          icon={Building2}
          title="Company details"
          hint="Used on quotes and invoices."
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className="label" htmlFor="company-name">Company name</label><input id="company-name" className="input" disabled={!canEdit} value={company.name || ''} onChange={set('name')} /></div>
            <div className="sm:col-span-2"><label className="label" htmlFor="company-address">Address</label><input id="company-address" className="input" disabled={!canEdit} value={company.address || ''} onChange={set('address')} /></div>
            <div className="sm:col-span-2"><label className="label" htmlFor="company-city">City</label><input id="company-city" className="input" disabled={!canEdit} value={company.city || ''} onChange={set('city')} /></div>
            <div><label className="label" htmlFor="company-phone">Phone</label><input id="company-phone" className="input" disabled={!canEdit} value={company.phone || ''} onChange={set('phone')} /></div>
            <div><label className="label" htmlFor="company-email">Email</label><input id="company-email" className="input" disabled={!canEdit} value={company.email || ''} onChange={set('email')} /></div>
            <div><label className="label" htmlFor="company-vat-number">VAT number</label><input id="company-vat-number" className="input" disabled={!canEdit} value={company.vat_number || ''} onChange={set('vat_number')} /></div>
            <div><label className="label" htmlFor="company-number">Company number</label><input id="company-number" className="input" disabled={!canEdit} value={company.company_number || ''} onChange={set('company_number')} /></div>
          </div>
        </SettingsSection>

        <SettingsSection
          className="lg:col-span-2"
          icon={Image}
          title="Branding"
          hint="PNG or JPEG, 2MB or smaller."
        >
          <div className="flex h-full flex-col">
            <div className="flex flex-1 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-8">
              <BrandLogo src={logoSrc} alt="Company logo" className="max-h-24 w-auto max-w-[220px]" />
            </div>
            {canEdit && (
              <div className="mt-4">
                <input
                  id="company-logo"
                  className="sr-only"
                  type="file"
                  accept="image/png,image/jpeg"
                  disabled={logoBusy}
                  onChange={uploadLogo}
                />
                <label
                  htmlFor="company-logo"
                  className={`btn-secondary w-full cursor-pointer ${logoBusy ? 'pointer-events-none opacity-50' : ''}`}
                >
                  <Upload size={15} /> {logoBusy ? 'Uploading…' : 'Upload company logo'}
                </label>
              </div>
            )}
          </div>
        </SettingsSection>
      </div>

      <SettingsSection
        icon={Percent}
        title="VAT rates"
        hint="Used on every quote and invoice line. Add extra codes or change a rate; existing documents keep the rate they were saved with."
      >
        <VatRatesEditor rates={vatRates} onChange={setVatRates} canEdit={canEdit} />
      </SettingsSection>

      <div className={`grid gap-5 ${canEdit ? 'lg:grid-cols-2' : ''}`}>
        <SettingsSection
          icon={Percent}
          title="Tax (VAT / CIS)"
          hint="Company registration used as the default on quotes and invoices. Staff CIS status stays on each user record."
        >
          <div className="space-y-2">
            <CheckRow id="uk-vat-registered" checked={!!settings.uk?.vat_registered} disabled={!canEdit} onChange={setUkFlag('vat_registered')}>
              VAT registered
            </CheckRow>
            <CheckRow id="uk-cis-registered" checked={!!settings.uk?.cis_registered} disabled={!canEdit} onChange={setUkFlag('cis_registered')}>
              CIS registered
            </CheckRow>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="uk-cis-utr">CIS UTR</label>
              <input id="uk-cis-utr" className="input" disabled={!canEdit} value={settings.uk?.cis_utr || ''} onChange={setUkFlag('cis_utr')} />
            </div>
            <div>
              <label className="label" htmlFor="uk-default-cis-rate">Default CIS rate</label>
              <SelectMenu
                id="uk-default-cis-rate"
                label="Default CIS rate"
                disabled={!canEdit}
                value={[0, 20, 30].includes(Number(settings.uk?.default_cis_rate)) ? Number(settings.uk.default_cis_rate) : 20}
                onChange={(value) => setSettings((s) => ({
                  ...s,
                  uk: { ...(s.uk || {}), default_cis_rate: Number(value) },
                }))}
                options={CIS_RATE_OPTIONS}
              />
            </div>
          </div>
        </SettingsSection>

        {canEdit && (
          <SettingsSection
            icon={Landmark}
            title="Bank details"
            hint="Printed on quotes and invoices. Office users cannot see these fields."
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="company-bank-name">Bank name</label>
                <input id="company-bank-name" className="input" value={company.bank_name || ''} onChange={set('bank_name')} />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="company-bank-account-name">Account name</label>
                <input id="company-bank-account-name" className="input" value={company.bank_account_name || ''} onChange={set('bank_account_name')} />
              </div>
              <div>
                <label className="label" htmlFor="company-bank-sort-code">Sort code</label>
                <input id="company-bank-sort-code" className="input" value={company.bank_sort_code || ''} onChange={set('bank_sort_code')} />
              </div>
              <div>
                <label className="label" htmlFor="company-bank-account-number">Account number</label>
                <input id="company-bank-account-number" className="input" value={company.bank_account_number || ''} onChange={set('bank_account_number')} />
              </div>
            </div>
          </SettingsSection>
        )}
      </div>

      <SettingsSection icon={Clock} title="Rules" hint="Defaults for quotes, invoices, holidays, and automation.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div><label className="label">Quote validity (days)</label><input className="input" type="number" disabled={!canEdit} value={settings.quote_validity_days} onChange={setNum('quote_validity_days')} /></div>
          <div><label className="label">Invoice due (days)</label><input className="input" type="number" disabled={!canEdit} value={settings.invoice_due_days} onChange={setNum('invoice_due_days')} /></div>
          <div><label className="label">Holiday notice required (days)</label><input className="input" type="number" disabled={!canEdit} value={settings.holiday_notice_days} onChange={setNum('holiday_notice_days')} /></div>
          <div>
            <label className="label" htmlFor="holiday-allowance-days">Default holiday allowance (days)</label>
            <input
              id="holiday-allowance-days"
              className="input"
              type="number"
              min={0}
              max={365}
              disabled={!canEdit}
              value={settings.holiday_allowance_days}
              onChange={setNum('holiday_allowance_days')}
            />
          </div>
          <div>
            <label className="label" htmlFor="automation-interval">Automation interval (minutes)</label>
            <input
              id="automation-interval"
              className="input"
              type="number"
              min={1}
              max={60}
              disabled={!canEdit}
              value={settings.automation?.interval_minutes ?? 5}
              onChange={(e) => {
                const raw = e.target.value;
                setSettings((s) => ({
                  ...s,
                  automation: { interval_minutes: raw === '' ? '' : Number(raw) },
                }));
              }}
            />
          </div>
        </div>
      </SettingsSection>

      <FollowupsEditor
        followups={settings.followups || hydrateFollowups(settings)}
        onChange={(next) => setSettings((s) => ({ ...s, followups: next }))}
        canEdit={canEdit}
      />

      <SettingsSection
        icon={Clock}
        title="Timesheet rules"
        hint="Clock-in uses enabled, site radius, rounding, and max shift."
      >
        <div className="space-y-2">
          {TIMESHEET_BOOL_FIELDS.map((field) => (
            <CheckRow
              key={field.key}
              id={`ts-${field.key}`}
              checked={!!ts[field.key]}
              disabled={!canEdit}
              onChange={setTsBool(field.key)}
            >
              {field.label}
            </CheckRow>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TIMESHEET_NUM_FIELDS.map((field) => (
            <div key={field.key}>
              <label className="label" htmlFor={`ts-${field.key}`}>{field.label}</label>
              <input
                id={`ts-${field.key}`}
                className="input"
                type="number"
                min={field.min}
                max={field.max}
                step={field.step || 1}
                disabled={!canEdit}
                value={ts[field.key]}
                onChange={setTsNum(field.key)}
              />
            </div>
          ))}
        </div>
      </SettingsSection>
      {canEdit ? (
        <div className="flex justify-end border-t border-slate-200 pt-4">
          <button type="button" onClick={save} disabled={saving} className="btn-primary" aria-hidden="true" tabIndex={-1}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      ) : null}
      </div>
      <Toast {...toast} />
    </div>
  );
}

function FollowupsEditor({ followups, onChange, canEdit }) {
  const steps = followups.steps || [];
  const setEnabled = (e) => onChange({ ...followups, enabled: e.target.checked });
  const setSubject = (e) => onChange({ ...followups, email_subject: e.target.value });
  const patchStep = (i, patch) => {
    onChange({ ...followups, steps: steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) });
  };
  const removeStep = (i) => onChange({ ...followups, steps: steps.filter((_, idx) => idx !== i) });
  const addStep = () => onChange({
    ...followups,
    steps: [...steps, { delay_days: 7, channel: 'email', body: '' }],
  });

  return (
    <SettingsSection
      icon={Mail}
      title="Quote follow-ups"
      hint={`Steps run from the day the quote is sent. A customer reply stops remaining steps for that quote only. Tokens: {name}, {ref}, {title}, {total}.`}
    >
      <CheckRow id="followups-enabled" checked={!!followups.enabled} disabled={!canEdit} onChange={setEnabled}>
        Automatic follow-ups enabled
      </CheckRow>
      <div className="mt-4">
        <label className="label" htmlFor="followup-email-subject">Follow-up email subject</label>
        <input
          id="followup-email-subject"
          className="input"
          disabled={!canEdit}
          value={followups.email_subject || ''}
          onChange={setSubject}
        />
      </div>
      <div className="mt-4 space-y-3">
        {steps.map((s, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-900">Step {i + 1}</span>
              {canEdit && (
                <button type="button" onClick={() => removeStep(i)} className="btn-ghost !py-1 !px-2 text-xs inline-flex items-center gap-1">
                  <Trash2 size={12} /> Remove
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor={`followup-delay-${i}`}>Days after send</label>
                <input
                  id={`followup-delay-${i}`}
                  className="input"
                  type="number"
                  min={0}
                  max={365}
                  disabled={!canEdit}
                  value={s.delay_days}
                  onChange={(e) => patchStep(i, { delay_days: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="label" htmlFor={`followup-channel-${i}`}>Channel</label>
                <SelectMenu
                  id={`followup-channel-${i}`}
                  label="Channel"
                  disabled={!canEdit}
                  value={s.channel}
                  onChange={(value) => patchStep(i, { channel: value })}
                  options={CHANNEL_OPTIONS}
                />
              </div>
            </div>
            <div>
              <label className="label" htmlFor={`followup-body-${i}`}>Message template</label>
              <textarea
                id={`followup-body-${i}`}
                className="input min-h-[5.5rem]"
                rows={3}
                disabled={!canEdit}
                value={s.body}
                onChange={(e) => patchStep(i, { body: e.target.value })}
              />
            </div>
          </div>
        ))}
      </div>
      {canEdit && steps.length < 10 && (
        <button type="button" onClick={addStep} className="btn-secondary mt-4 !py-1.5 !px-3 text-sm inline-flex items-center gap-1">
          <Plus size={14} /> Add step
        </button>
      )}
    </SettingsSection>
  );
}

function VatRatesEditor({ rates, onChange, canEdit }) {
  const update = (i, field, value) => {
    onChange(rates.map((row, idx) => (idx === i ? { ...row, [field]: field === 'rate' ? Number(value) : value } : row)));
  };
  const add = () => onChange([...rates, { code: '', rate: 0, short: '', label: '', help: '' }]);
  const remove = (i) => {
    if (CORE_VAT_CODES.includes(rates[i]?.code)) return;
    onChange(rates.filter((_, idx) => idx !== i));
  };

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[36rem] overflow-hidden rounded-xl border border-slate-200">
        <div className="grid grid-cols-[8rem_5.5rem_5rem_1fr_2.5rem] gap-2 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          <div>Code</div><div>Rate %</div><div>Short</div><div>Label</div><div />
        </div>
        {rates.map((row, i) => {
          const lockedCode = CORE_VAT_CODES.includes(row.code);
          return (
            <div key={i} className="grid grid-cols-[8rem_5.5rem_5rem_1fr_2.5rem] items-center gap-2 border-t border-slate-100 px-3 py-2">
              <input
                className="input !py-1.5 !text-sm"
                value={row.code}
                disabled={!canEdit || lockedCode}
                onChange={(e) => update(i, 'code', e.target.value)}
                aria-label={`VAT code ${i + 1}`}
                placeholder="code"
              />
              <input
                className="input !py-1.5 !text-sm"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={row.rate}
                disabled={!canEdit}
                onChange={(e) => update(i, 'rate', e.target.value)}
                aria-label={`VAT rate ${i + 1}`}
              />
              <input
                className="input !py-1.5 !text-sm"
                value={row.short || ''}
                disabled={!canEdit}
                onChange={(e) => update(i, 'short', e.target.value)}
                aria-label={`VAT short label ${i + 1}`}
                placeholder="20%"
              />
              <input
                className="input !py-1.5 !text-sm"
                value={row.label || ''}
                disabled={!canEdit}
                onChange={(e) => update(i, 'label', e.target.value)}
                aria-label={`VAT label ${i + 1}`}
                placeholder="Label"
              />
              {canEdit && !lockedCode ? (
                <button type="button" onClick={() => remove(i)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove VAT rate ${i + 1}`}>
                  <Trash2 size={14} />
                </button>
              ) : <span />}
            </div>
          );
        })}
      </div>
      {canEdit && (
        <button type="button" onClick={add} className="btn-ghost mt-3 !px-2 !py-1 text-xs">
          <Plus size={14} /> Add VAT rate
        </button>
      )}
    </div>
  );
}

const CIS_STATUS_OPTIONS = [
  { value: 'none', label: 'Not under CIS' },
  { value: 'gross', label: 'Gross status (0%)' },
  { value: 'net20', label: 'Registered (20%)' },
  { value: 'higher30', label: 'Unverified (30%)' },
];

function cisShort(status) {
  const found = CIS_STATUS_OPTIONS.find((o) => o.value === status);
  if (!found || status === 'none') return '—';
  if (status === 'gross') return 'Gross';
  if (status === 'net20') return '20%';
  if (status === 'higher30') return '30%';
  return found.label;
}

function PayFields({ form, set, idPrefix }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="label" htmlFor={`${idPrefix}-hourly-cost`}>Hourly cost (£)</label>
        <input id={`${idPrefix}-hourly-cost`} className="input" type="number" min="0" step="0.01" value={form.hourly_cost} onChange={set('hourly_cost')} />
      </div>
      <div>
        <label className="label" htmlFor={`${idPrefix}-cis-status`}>CIS status</label>
        <SelectMenu
          id={`${idPrefix}-cis-status`}
          label="CIS status"
          value={form.cis_status}
          onChange={(value) => set('cis_status')({ target: { value } })}
          options={CIS_STATUS_OPTIONS}
        />
      </div>
    </div>
  );
}

function HolidayAllowanceField({ form, set, idPrefix, placeholder }) {
  return (
    <div>
      <label className="label" htmlFor={`${idPrefix}-holiday-allowance`}>Holiday allowance (days)</label>
      <input
        id={`${idPrefix}-holiday-allowance`}
        className="input"
        type="number"
        min="0"
        max="365"
        step="0.5"
        value={form.holiday_allowance}
        placeholder={placeholder}
        onChange={set('holiday_allowance')}
      />
    </div>
  );
}

function SkillFields({ form, toggleSkill, setDriver }) {
  return (
    <>
      <div>
        <label className="label">Skills</label>
        <div className="flex flex-wrap gap-1.5">
          {SKILL_OPTIONS.map((s) => (
            <button type="button" key={s} onClick={() => toggleSkill(s)} className={`px-2.5 py-1 rounded-md text-xs font-medium ${form.skills.includes(s) ? 'bg-navy-900 text-white' : 'bg-slate-100 text-slate-500'}`}>{skillLabel(s)}</button>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" className="h-4 w-4 shrink-0 rounded border-slate-300 accent-brand-500" checked={form.is_driver} onChange={(e) => setDriver(e.target.checked)} /> Can drive
      </label>
    </>
  );
}

function staffRoleLabel(role) {
  if (role === ROLES.ADMIN) return 'Owner/Admin';
  if (role === ROLES.OFFICE) return 'Office';
  return 'Field staff';
}

function addedParts(iso) {
  if (!iso) return { date: '—', time: '' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '—', time: '' };
  return {
    date: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase(),
  };
}

function isoDay(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function StaffUserActions({ user, canToggle, onEdit, onToggleActive, onToggleFinancials }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="flex items-center justify-end gap-2">
      {canToggle && (
        <button
          type="button"
          role="switch"
          aria-checked={!!user.active}
          aria-label={user.active ? 'Deactivate' : 'Activate'}
          onClick={() => onToggleActive(user)}
          className={`relative h-4 w-7 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 ${
            user.active ? 'bg-brand-500' : 'bg-slate-200'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${
              user.active ? 'translate-x-3' : ''
            }`}
          />
        </button>
      )}
      <div className="relative" ref={wrapRef}>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-700"
          aria-label={`More actions for ${user.name}`}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <MoreHorizontal size={18} />
        </button>
        {open && (
          <div className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              onClick={() => { setOpen(false); onEdit(user); }}
            >
              Edit
            </button>
            {user.role === ROLES.OFFICE && (
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => { setOpen(false); onToggleFinancials(user); }}
              >
                {user.financials_restricted ? 'Allow costing' : 'Restrict costing'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StaffTab({ canEdit }) {
  const { user: me } = useAuth();
  const [users, setUsers] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [role, setRole] = useState('all');
  const [addedFrom, setAddedFrom] = useState('');
  const { toast, show } = useToast();
  const load = () => api.get('/settings/users').then((d) => setUsers(d.users)).catch((err) => {
    show(err.message, 'error');
    setUsers((current) => current || []);
  });
  useEffect(() => { load(); }, []);
  if (!users) return <PageLoading />;

  const activeAdminCount = users.filter((x) => x.role === ROLES.ADMIN && x.active).length;
  const isLastActiveAdmin = (u) => u.role === ROLES.ADMIN && u.active && activeAdminCount <= 1;

  const toggleActive = async (u) => {
    try { await api.put(`/settings/users/${u.id}`, { active: !u.active }); load(); } catch (err) { show(err.message, 'error'); }
  };

  const toggleFinancials = async (u) => {
    try {
      await api.put(`/settings/users/${u.id}`, { financials_restricted: !u.financials_restricted });
      load();
    } catch (err) { show(err.message, 'error'); }
  };

  const needle = q.trim().toLowerCase();
  const filtered = users.filter((u) => {
    if (status === 'active' && !u.active) return false;
    if (status === 'inactive' && u.active) return false;
    if (role !== 'all' && u.role !== role) return false;
    if (addedFrom && isoDay(u.created_at) < addedFrom) return false;
    if (!needle) return true;
    const hay = [
      u.name, u.email, u.phone, staffRoleLabel(u.role),
      ...(Array.isArray(u.skills) ? u.skills : []),
    ].join(' ').toLowerCase();
    return hay.includes(needle);
  }).slice().sort((a, b) => {
    const byDate = new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    return byDate || (Number(b.id) - Number(a.id));
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(16rem,1fr)_11rem_11rem_12.5rem]">
        <div className="relative sm:col-span-2 xl:col-span-1">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input !h-10 !rounded-lg pl-10"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search..."
            aria-label="Search people"
          />
        </div>
        <SelectMenu
          label="Filter by status"
          value={status}
          onChange={setStatus}
          options={STAFF_STATUS_FILTER}
        />
        <SelectMenu
          label="Filter by role"
          value={role}
          onChange={setRole}
          options={STAFF_ROLE_FILTER}
        />
        <DatePicker
          className="min-w-[9.75rem]"
          label="Date"
          value={addedFrom}
          onChange={setAddedFrom}
          placeholder="Any date"
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-900">All users</h3>
          {canEdit && (
            <button className="btn-primary !rounded-xl" onClick={() => setAddOpen(true)}>
              <Plus size={16} /> Add user
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50/80 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <th className="px-5 py-3">User</th>
                <th className="px-4 py-3">User role</th>
                <th className="px-4 py-3 hidden md:table-cell">Skills</th>
                <th className="px-4 py-3 hidden lg:table-cell">Rate</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 hidden sm:table-cell">Date added</th>
                {canEdit && <th className="px-5 py-3 text-right">Action</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 7 : 6} className="px-5 py-12 text-center text-slate-400">
                    {users.length === 0 ? 'No accounts yet.' : 'No people match these filters.'}
                  </td>
                </tr>
              )}
              {filtered.map((u) => {
                const added = addedParts(u.created_at);
                const skills = Array.isArray(u.skills) ? u.skills.map(skillLabel) : [];
                const skillLine = [skills.join(', ') || '—', u.is_driver ? 'Driver' : ''].filter(Boolean).join(' · ');
                return (
                  <tr key={u.id} className="border-t border-slate-100 last:border-0">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3 min-w-[12rem]">
                        <Avatar name={u.name} color={u.color} size={10} src={avatarUrl(u)} />
                        <div className="min-w-0">
                          <div className={`truncate font-medium ${u.active ? 'text-slate-900' : 'text-slate-400 line-through'}`}>
                            {u.name}
                          </div>
                          <div className="truncate text-xs text-slate-400">{u.email || '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">{staffRoleLabel(u.role)}</td>
                    <td className="px-4 py-3.5 text-xs text-slate-500 hidden md:table-cell max-w-[12rem]">
                      <span className="line-clamp-2">{skillLine}</span>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-500 hidden lg:table-cell whitespace-nowrap">
                      <div>{u.hourly_cost ? `${money(u.hourly_cost)}/h` : '—'}</div>
                      <div className="text-slate-400">{cisShort(u.cis_status)}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                        u.active ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {u.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 hidden sm:table-cell whitespace-nowrap">
                      <div className="text-sm text-slate-700">{added.date}</div>
                      {added.time ? <div className="text-[11px] text-slate-400">{added.time}</div> : null}
                    </td>
                    {canEdit && (
                      <td className="px-5 py-3.5">
                        <StaffUserActions
                          user={u}
                          canToggle={me?.id !== u.id && !isLastActiveAdmin(u)}
                          onEdit={setEditUser}
                          onToggleActive={toggleActive}
                          onToggleFinancials={toggleFinancials}
                        />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <AddStaffModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={(result) => {
          setAddOpen(false);
          load();
          if (result && result.emailed === false) {
            show('Account created, but the welcome email could not be sent.', 'error');
          } else {
            show('Account created. Login details were emailed.');
          }
        }}
      />
      <EditUserModal user={editUser} lockRole={!!editUser && isLastActiveAdmin(editUser)} onClose={() => setEditUser(null)} onSaved={() => { setEditUser(null); load(); show('Account updated'); }} />
      <Toast {...toast} />
    </div>
  );
}

const ADD_STAFF_BLANK = {
  name: '', email: '', phone: '', password: '', role: ROLES.STAFF, skills: [], is_driver: false,
  color: '#0ea5e9', financials_restricted: false, hourly_cost: 0, cis_status: 'none', holiday_allowance: '',
};

function AddStaffModal({ open, onClose, onSaved }) {
  const [form, setForm] = useState(ADD_STAFF_BLANK);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [defaultAllowance, setDefaultAllowance] = useState(28);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const toggleSkill = (s) => setForm((f) => ({ ...f, skills: f.skills.includes(s) ? f.skills.filter((x) => x !== s) : [...f.skills, s] }));

  useEffect(() => {
    if (!open) return undefined;
    setForm(ADD_STAFF_BLANK);
    setError('');
    let cancelled = false;
    api.get('/settings').then((d) => {
      const n = Number(d.settings?.holiday_allowance_days);
      if (!cancelled && Number.isFinite(n)) setDefaultAllowance(n);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = { ...form };
      const rawAllowance = typeof body.holiday_allowance === 'string'
        ? body.holiday_allowance.trim()
        : body.holiday_allowance;
      if (rawAllowance === '' || rawAllowance === undefined) {
        delete body.holiday_allowance;
      } else {
        body.holiday_allowance = Number(rawAllowance);
      }
      const result = await api.post('/settings/users', body);
      onSaved(result);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add user">
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
        <div><label className="label" htmlFor="add-user-name">Name</label><input id="add-user-name" className="input" value={form.name} onChange={set('name')} required /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label" htmlFor="add-user-email">Email (their login)</label><input id="add-user-email" className="input" type="email" value={form.email} onChange={set('email')} required /></div>
          <div><label className="label" htmlFor="add-user-phone">Phone</label><input id="add-user-phone" className="input" value={form.phone} onChange={set('phone')} /></div>
        </div>
        <div><label className="label" htmlFor="add-user-password">Temporary password</label><input id="add-user-password" className="input" value={form.password} onChange={set('password')} required minLength={8} /></div>
        <div>
          <label className="label" htmlFor="add-user-role">Role</label>
          <SelectMenu
            id="add-user-role"
            label="Role"
            value={form.role}
            onChange={(value) => setForm({ ...form, role: value, financials_restricted: value === ROLES.OFFICE ? form.financials_restricted : false })}
            options={ROLE_OPTIONS}
          />
        </div>
        {form.role === ROLES.STAFF && (
          <SkillFields form={form} toggleSkill={toggleSkill} setDriver={(checked) => setForm({ ...form, is_driver: checked })} />
        )}
        {form.role === ROLES.OFFICE && (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" className="h-4 w-4 shrink-0 rounded border-slate-300 accent-brand-500" checked={form.financials_restricted} onChange={(e) => setForm({ ...form, financials_restricted: e.target.checked })} />
            Restrict job costing and labour-cost figures
          </label>
        )}
        <PayFields form={form} set={set} idPrefix="add-user" />
        <HolidayAllowanceField form={form} set={set} idPrefix="add-user" placeholder={`Company default (${defaultAllowance})`} />
        <button className="btn-primary w-full" disabled={saving}>{saving ? 'Adding…' : 'Add user'}</button>
      </form>
    </Modal>
  );
}

function EditUserModal({ user, lockRole, onClose, onSaved }) {
  const { toast, show } = useToast();
  const [form, setForm] = useState({ name: '', email: '', phone: '', role: ROLES.STAFF, financials_restricted: false, skills: [], is_driver: false, hourly_cost: 0, cis_status: 'none', holiday_allowance: '' });
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const toggleSkill = (s) => setForm((f) => ({ ...f, skills: f.skills.includes(s) ? f.skills.filter((x) => x !== s) : [...f.skills, s] }));

  useEffect(() => {
    if (!user) return;
    setForm({
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || '',
      role: user.role,
      financials_restricted: !!user.financials_restricted,
      skills: Array.isArray(user.skills) ? user.skills : [],
      is_driver: !!user.is_driver,
      hourly_cost: Number(user.hourly_cost) || 0,
      cis_status: user.cis_status || 'none',
      holiday_allowance: user.holiday_allowance ?? '',
    });
    setError('');
  }, [user]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        role: form.role,
        financials_restricted: form.financials_restricted,
        hourly_cost: Number(form.hourly_cost),
        cis_status: form.cis_status,
        skills: form.role === ROLES.STAFF ? form.skills : [],
        is_driver: form.role === ROLES.STAFF ? form.is_driver : false,
      };
      if (form.holiday_allowance !== '' && form.holiday_allowance !== undefined) {
        const n = Number(form.holiday_allowance);
        if (!Number.isFinite(n) || n < 0 || n > 365) {
          setError('Holiday allowance must be 0–365 days');
          setSaving(false);
          return;
        }
        body.holiday_allowance = n;
      }
      await api.put(`/settings/users/${user.id}`, body);
      onSaved();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const sendReset = async () => {
    if (!user) return;
    setResetting(true);
    setError('');
    try {
      await api.post(`/settings/users/${user.id}/reset-password`);
      show('Reset link sent to their email.');
    } catch (err) {
      setError(err.message || 'Could not send the reset email');
    } finally {
      setResetting(false);
    }
  };

  const busy = saving || resetting;

  return (
    <Modal
      open={!!user}
      onClose={onClose}
      title={user ? `Edit ${user.name}` : 'Edit account'}
      footer={(
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <button type="button" className="btn-secondary" onClick={sendReset} disabled={busy || !user?.active}>
            {resetting ? 'Sending…' : 'Reset password'}
          </button>
          <div className="flex items-center gap-2">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" form="edit-user-form" className="btn-primary" disabled={busy}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}
    >
      <form id="edit-user-form" onSubmit={submit} className="space-y-3">
        {error && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>}
        <div><label className="label" htmlFor="edit-user-name">Name</label><input id="edit-user-name" className="input" value={form.name} onChange={set('name')} required /></div>
        <div><label className="label" htmlFor="edit-user-email">Email (their login)</label><input id="edit-user-email" className="input" type="email" value={form.email} onChange={set('email')} required /></div>
        <div><label className="label" htmlFor="edit-user-phone">Phone</label><input id="edit-user-phone" className="input" value={form.phone} onChange={set('phone')} /></div>
        <div>
          <label className="label" htmlFor="edit-user-role">Role</label>
          <SelectMenu
            id="edit-user-role"
            label="Role"
            value={form.role}
            disabled={lockRole}
            onChange={(value) => setForm({ ...form, role: value, financials_restricted: value === ROLES.OFFICE ? form.financials_restricted : false })}
            options={ROLE_OPTIONS}
          />
        </div>
        {form.role === ROLES.STAFF && (
          <SkillFields form={form} toggleSkill={toggleSkill} setDriver={(checked) => setForm({ ...form, is_driver: checked })} />
        )}
        {form.role === ROLES.OFFICE && (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" className="h-4 w-4 shrink-0 rounded border-slate-300 accent-brand-500" checked={form.financials_restricted} onChange={(e) => setForm({ ...form, financials_restricted: e.target.checked })} />
            Restrict job costing and labour-cost figures
          </label>
        )}
        <PayFields form={form} set={set} idPrefix="edit-user" />
        <HolidayAllowanceField form={form} set={set} idPrefix="edit-user" />
      </form>
      <Toast {...toast} />
    </Modal>
  );
}

function personLabel(person) {
  if (!person) return '—';
  return person.name || person.email || '—';
}

const SECURITY_PAGE_SIZE = 20;
const SECURITY_PAGE_SIZES = [10, 20, 50, 100];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toIsoDay(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function defaultSecurityRange() {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth(), to.getDate() - 6);
  return { from: toIsoDay(from), to: toIsoDay(to) };
}

function fmtLogTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function SecurityLogTab() {
  const defaults = defaultSecurityRange();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(SECURITY_PAGE_SIZE);
  const [events, setEvents] = useState(null);
  const [total, setTotal] = useState(0);
  const { toast, show } = useToast();
  const invalidRange = Boolean(from && to && from > to);
  const pages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (invalidRange) {
      setEvents([]);
      setTotal(0);
      return undefined;
    }
    let cancelled = false;
    setEvents(null);
    const qs = new URLSearchParams({
      from,
      to,
      page: String(page),
      limit: String(pageSize),
    });
    api.get(`/settings/security-events?${qs}`)
      .then((d) => {
        if (cancelled) return;
        setEvents(d.events || []);
        setTotal(Number(d.total) || 0);
      })
      .catch((err) => {
        if (cancelled) return;
        setEvents([]);
        setTotal(0);
        show(err.message || 'Could not load the security log', 'error');
      });
    return () => { cancelled = true; };
  }, [from, to, page, pageSize, invalidRange, show]);

  const changeFrom = (value) => {
    setFrom(value);
    setPage(1);
  };
  const changeTo = (value) => {
    setTo(value);
    setPage(1);
  };
  const changePageSize = (value) => {
    setPageSize(Number(value) || SECURITY_PAGE_SIZE);
    setPage(1);
  };

  const fromIdx = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const toIdx = Math.min(page * pageSize, total);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-slate-900">Security logs</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
            Sign-ins, role changes, and other account activity.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3 sm:justify-end">
          <div>
            <label className="label" htmlFor="security-log-from">Start date</label>
            <DatePicker
              id="security-log-from"
              label="Start date"
              value={from}
              max={to || undefined}
              onChange={changeFrom}
            />
          </div>
          <div>
            <label className="label" htmlFor="security-log-to">End date</label>
            <DatePicker
              id="security-log-to"
              label="End date"
              value={to}
              min={from || undefined}
              onChange={changeTo}
            />
          </div>
        </div>
      </div>
      {invalidRange && (
        <p className="text-sm text-rose-600 sm:text-right">Start date must be on or before end date.</p>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Time</th>
                <th className="px-4 py-2.5 font-medium">Actor</th>
                <th className="px-4 py-2.5 font-medium">Action</th>
                <th className="px-4 py-2.5 font-medium">Target</th>
                <th className="px-4 py-2.5 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {!events && (
                <tr>
                  <td colSpan={6} className="px-4 py-10"><PageLoading /></td>
                </tr>
              )}
              {events && events.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">No security events in this date range.</td>
                </tr>
              )}
              {events && events.map((evt) => (
                <tr key={evt.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2.5 text-slate-800 whitespace-nowrap">{fmtDate(evt.created_at)}</td>
                  <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">{fmtLogTime(evt.created_at)}</td>
                  <td className="px-4 py-2.5 text-slate-800">{personLabel(evt.actor)}</td>
                  <td className="px-4 py-2.5 text-slate-800">{SECURITY_ACTION_LABELS[evt.action] || evt.action}</td>
                  <td className="px-4 py-2.5 text-slate-800">{personLabel(evt.target)}</td>
                  <td className="px-4 py-2.5 text-slate-500">{evt.detail || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {events && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
            <p className="text-sm text-slate-500">
              {total === 0 ? 'No results' : `Showing ${fromIdx}–${toIdx} of ${total}`}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500">Rows</span>
                <SelectMenu
                  id="security-log-page-size"
                  label="Rows per page"
                  size="sm"
                  className="w-20"
                  value={String(pageSize)}
                  onChange={changePageSize}
                  options={SECURITY_PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))}
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-secondary !py-1.5 !px-3 text-sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span className="text-sm text-slate-500">Page {page} of {pages}</span>
                <button
                  type="button"
                  className="btn-secondary !py-1.5 !px-3 text-sm"
                  disabled={page >= pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <Toast {...toast} />
    </div>
  );
}
