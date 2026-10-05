import React, { useEffect, useState } from 'react';
import {
  Bell, Inbox, FileText, CalendarDays, Receipt, CheckSquare,
  PlaneTakeoff, UserPlus, UserMinus, CheckCircle2, XCircle, Mail,
} from 'lucide-react';
import { api } from '../lib/api';
import { PageLoading, useToast, Toast } from './ui.jsx';

const KIND_META = {
  new_enquiry: { hint: 'When a new lead lands in the inbox.', Icon: Inbox },
  quote_accepted: { hint: 'When a customer accepts a quote.', Icon: FileText },
  visit_booked: { hint: 'When a site visit is booked, or when you are assigned to one. Field staff get this on by default.', Icon: CalendarDays },
  invoice_overdue: { hint: 'When an invoice goes past its due date.', Icon: Receipt },
  task_reminder: { hint: 'When a task is due today.', Icon: CheckSquare },
  holiday_submitted: { hint: 'When someone submits a holiday request.', Icon: PlaneTakeoff },
  holiday_approved: { hint: 'When your holiday request is approved.', Icon: CheckCircle2 },
  holiday_declined: { hint: 'When your holiday request is declined.', Icon: XCircle },
  crew_added: { hint: 'When you are put on a job.', Icon: UserPlus },
  crew_removed: { hint: 'When you are taken off a job.', Icon: UserMinus },
};

function PrefToggle({ checked, onChange, label, caption }) {
  return (
    <label className="inline-flex min-h-11 cursor-pointer select-none items-center gap-2.5">
      {caption ? <span className="text-xs font-medium text-slate-500">{caption}</span> : null}
      <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={onChange}
          aria-label={label}
        />
        <span className="pointer-events-none absolute inset-0 rounded-full bg-slate-200 transition-colors peer-checked:bg-brand-500 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/35" />
        <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm ring-1 ring-slate-900/5 transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

/**
 * Per-user notification opt-in (requirement 13.2). All kinds start off.
 * Email toggles exist only for field staff on crew add/remove.
 */
export default function NotificationPrefsForm() {
  const { toast, show } = useToast();
  const [kinds, setKinds] = useState(null);
  const [prefs, setPrefs] = useState({ in_app: {}, email: {} });
  const [saving, setSaving] = useState(false);

  const load = () => api.get('/notifications/preferences').then((d) => {
    setKinds(Array.isArray(d.kinds) ? d.kinds : []);
    setPrefs(d.preferences || { in_app: {}, email: {} });
  }).catch((err) => {
    show(err.message || 'Could not load notification settings', 'error');
    setKinds((current) => current || []);
  });

  useEffect(() => { load(); }, []);

  const setFlag = (channel, kind, value) => {
    setPrefs((prev) => ({
      ...prev,
      [channel]: { ...(prev[channel] || {}), [kind]: value },
    }));
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const d = await api.put('/notifications/preferences', prefs);
      setPrefs(d.preferences || prefs);
      if (Array.isArray(d.kinds)) setKinds(d.kinds);
      show('Notification preferences saved');
    } catch (err) {
      show(err.message || 'Could not save preferences', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!kinds) return <PageLoading />;

  const onCount = kinds.filter((kind) => prefs.in_app?.[kind.id] === true).length;
  const showEmail = kinds.some((kind) => kind.email);

  return (
    <form onSubmit={save} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Bell size={18} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[15px] font-semibold text-slate-900">Notifications</h3>
              {kinds.length > 0 ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-500">
                  {onCount} of {kinds.length} on
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
              Everything is off until you turn it on.
              {showEmail
                ? ' Email is only for job assignment changes, and only for field staff.'
                : ' These alerts appear in the bell.'}
            </p>
          </div>
        </div>
        <button type="submit" className="btn-primary w-full shrink-0 sm:mt-0.5 sm:w-auto" disabled={saving}>
          {saving ? 'Saving…' : 'Save preferences'}
        </button>
      </div>

      {kinds.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-400 sm:px-6">No notification types are available.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {kinds.map((kind) => {
            const meta = KIND_META[kind.id] || {};
            const Icon = meta.Icon || Bell;
            return (
              <li
                key={kind.id}
                className="flex items-start justify-between gap-3 px-4 py-3.5 sm:items-center sm:gap-6 sm:px-6"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500 ring-1 ring-slate-200/80">
                    <Icon size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800">{kind.title}</div>
                    {meta.hint ? <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{meta.hint}</p> : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-x-5">
                  <PrefToggle
                    caption="In-app"
                    label={`${kind.title} in-app`}
                    checked={prefs.in_app?.[kind.id] === true}
                    onChange={(e) => setFlag('in_app', kind.id, e.target.checked)}
                  />
                  {kind.email && (
                    <PrefToggle
                      caption="Email"
                      label={`${kind.title} email`}
                      checked={prefs.email?.[kind.id] === true}
                      onChange={(e) => setFlag('email', kind.id, e.target.checked)}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {showEmail ? (
        <div className="flex items-start gap-2 border-t border-slate-100 bg-slate-50/80 px-4 py-3 text-xs text-slate-500 sm:px-6">
          <Mail size={14} className="mt-0.5 shrink-0 text-slate-400" />
          <p>Email is sent only for job assignment changes. In-app alerts still need the bell switch on.</p>
        </div>
      ) : null}
      <Toast {...toast} />
    </form>
  );
}
