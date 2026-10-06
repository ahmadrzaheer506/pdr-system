import React, { useState } from 'react';
import { Plus, Trash2, Star, MapPin, Phone, Mail } from 'lucide-react';
import { api } from '../lib/api';
import { PHONE_TYPES, EMAIL_TYPES, formatSite, typeLabel, emailFormatError } from '../lib/contacts';
import { duplicateFromError } from '../lib/duplicates';
import DuplicateCustomerNotice from './DuplicateCustomerNotice.jsx';
import SelectMenu from './SelectMenu.jsx';

function PrimaryBadge({ on }) {
  if (!on) return null;
  return <span className="badge bg-brand-50 text-brand-700 !text-[10px]">Primary</span>;
}

function Empty({ children }) {
  return (
    <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-3 py-3 text-sm text-slate-400">
      {children}
    </p>
  );
}

function ContactRow({ icon: Icon, children, onPrimary, onRemove }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-100">
        <Icon size={14} />
      </div>
      <div className="min-w-0 flex-1 text-sm text-slate-700">{children}</div>
      <div className="flex gap-0.5 shrink-0">
        {onPrimary && (
          <button type="button" className="btn-ghost !p-1.5" title="Set as primary" onClick={onPrimary}>
            <Star size={13} />
          </button>
        )}
        <button type="button" className="btn-ghost !p-1.5 !text-rose-600" title="Remove" onClick={onRemove}>
          <Trash2 size={13} />
        </button>
      </div>
    </li>
  );
}

function SectionHead({ title, onAdd }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-2">
      <h4 className="text-sm font-medium text-slate-700">{title}</h4>
      <button type="button" className="btn-secondary !py-1 !px-2.5 text-xs" onClick={onAdd}>
        <Plus size={12} /> Add
      </button>
    </div>
  );
}

function AddBar({ children, onCancel, saving, saveLabel, onSubmit }) {
  return (
    <form onSubmit={onSubmit} className="mt-2 space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      {children}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary !py-1.5 text-xs" onClick={onCancel}>Cancel</button>
        <button className="btn-primary !py-1.5 text-xs" disabled={saving}>{saving ? 'Saving…' : saveLabel}</button>
      </div>
    </form>
  );
}

/**
 * Add / edit / remove / set-primary for sites, phones, and emails (requirement 2.2).
 */
export default function CustomerContacts({ customer, onChanged, onError }) {
  return (
    <div className="card !rounded-2xl p-5 sm:p-6 space-y-5">
      <div>
        <h3 className="font-semibold text-slate-900">Sites, phones & emails</h3>
        <p className="text-xs text-slate-400 mt-0.5">Where the work is, and how to reach them.</p>
      </div>
      <SiteList customer={customer} onChanged={onChanged} onError={onError} />
      <div className="border-t border-slate-100" />
      <PhoneList customer={customer} onChanged={onChanged} onError={onError} />
      <div className="border-t border-slate-100" />
      <EmailList customer={customer} onChanged={onChanged} onError={onError} />
    </div>
  );
}

function SiteList({ customer, onChanged, onError }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ address: '' });
  const [saving, setSaving] = useState(false);
  const sites = customer.sites || [];

  const add = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/customers/${customer.id}/sites`, form);
      setForm({ address: '' });
      setAdding(false);
      onChanged();
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const setPrimary = async (id) => {
    try {
      await api.put(`/customers/${customer.id}/sites/${id}`, { is_primary: true });
      onChanged();
    } catch (err) { onError(err.message); }
  };

  const remove = async (id) => {
    try {
      await api.del(`/customers/${customer.id}/sites/${id}`);
      onChanged();
    } catch (err) { onError(err.message); }
  };

  return (
    <section>
      <SectionHead title="Site addresses" onAdd={() => setAdding((v) => !v)} />
      {sites.length === 0 && !adding && <Empty>No sites yet.</Empty>}
      <ul className="space-y-2">
        {sites.map((s) => (
          <ContactRow
            key={s.id}
            icon={MapPin}
            onPrimary={!s.is_primary ? () => setPrimary(s.id) : undefined}
            onRemove={() => remove(s.id)}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{formatSite(s)}</span>
              <PrimaryBadge on={s.is_primary} />
            </div>
          </ContactRow>
        ))}
      </ul>
      {adding && (
        <AddBar
          onCancel={() => { setAdding(false); setForm({ address: '' }); }}
          saving={saving}
          saveLabel="Save site"
          onSubmit={add}
        >
          <input
            className="input"
            placeholder="Address"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            required
            aria-label="New site address"
          />
        </AddBar>
      )}
    </section>
  );
}

function PhoneList({ customer, onChanged, onError }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ value: '', type: 'mobile' });
  const [saving, setSaving] = useState(false);
  const [duplicate, setDuplicate] = useState(null);
  const phones = customer.phones || [];

  const add = async (e) => {
    e.preventDefault();
    setSaving(true);
    setDuplicate(null);
    try {
      await api.post(`/customers/${customer.id}/phones`, form);
      setForm({ value: '', type: 'mobile' });
      setAdding(false);
      onChanged();
    } catch (err) {
      const dup = duplicateFromError(err);
      if (dup) setDuplicate(dup);
      onError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const setPrimary = async (id) => {
    try {
      await api.put(`/customers/${customer.id}/phones/${id}`, { is_primary: true });
      onChanged();
    } catch (err) { onError(err.message); }
  };

  const remove = async (id) => {
    try {
      await api.del(`/customers/${customer.id}/phones/${id}`);
      onChanged();
    } catch (err) { onError(err.message); }
  };

  return (
    <section>
      <SectionHead title="Contact numbers" onAdd={() => setAdding((v) => !v)} />
      {phones.length === 0 && !adding && <Empty>No phone numbers yet.</Empty>}
      <ul className="space-y-2">
        {phones.map((p) => (
          <ContactRow
            key={p.id}
            icon={Phone}
            onPrimary={!p.is_primary ? () => setPrimary(p.id) : undefined}
            onRemove={() => remove(p.id)}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{p.value}</span>
              <span className="text-xs text-slate-400">{typeLabel(PHONE_TYPES, p.type)}</span>
              <PrimaryBadge on={p.is_primary} />
            </div>
          </ContactRow>
        ))}
      </ul>
      {adding && (
        <AddBar
          onCancel={() => { setAdding(false); setForm({ value: '', type: 'mobile' }); setDuplicate(null); }}
          saving={saving}
          saveLabel="Save phone"
          onSubmit={add}
        >
          <div className="grid sm:grid-cols-[1fr_140px] gap-2">
            <input
              className="input"
              placeholder="Phone number"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              required
              aria-label="New phone number"
            />
            <SelectMenu
              label="New phone type"
              value={form.type}
              onChange={(type) => setForm({ ...form, type })}
              options={PHONE_TYPES}
            />
          </div>
        </AddBar>
      )}
      <div className="mt-2"><DuplicateCustomerNotice duplicate={duplicate} /></div>
    </section>
  );
}

function EmailList({ customer, onChanged, onError }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ value: '', type: 'personal' });
  const [saving, setSaving] = useState(false);
  const [duplicate, setDuplicate] = useState(null);
  const emails = customer.emails || [];

  const add = async (e) => {
    e.preventDefault();
    const emailErr = emailFormatError(form.value);
    if (emailErr) {
      onError(emailErr);
      return;
    }
    setSaving(true);
    setDuplicate(null);
    try {
      await api.post(`/customers/${customer.id}/emails`, form);
      setForm({ value: '', type: 'personal' });
      setAdding(false);
      onChanged();
    } catch (err) {
      const dup = duplicateFromError(err);
      if (dup) setDuplicate(dup);
      onError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const setPrimary = async (id) => {
    try {
      await api.put(`/customers/${customer.id}/emails/${id}`, { is_primary: true });
      onChanged();
    } catch (err) { onError(err.message); }
  };

  const remove = async (id) => {
    try {
      await api.del(`/customers/${customer.id}/emails/${id}`);
      onChanged();
    } catch (err) { onError(err.message); }
  };

  return (
    <section>
      <SectionHead title="Email addresses" onAdd={() => setAdding((v) => !v)} />
      {emails.length === 0 && !adding && <Empty>No email addresses yet.</Empty>}
      <ul className="space-y-2">
        {emails.map((em) => (
          <ContactRow
            key={em.id}
            icon={Mail}
            onPrimary={!em.is_primary ? () => setPrimary(em.id) : undefined}
            onRemove={() => remove(em.id)}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{em.value}</span>
              <span className="text-xs text-slate-400">{typeLabel(EMAIL_TYPES, em.type)}</span>
              <PrimaryBadge on={em.is_primary} />
            </div>
          </ContactRow>
        ))}
      </ul>
      {adding && (
        <AddBar
          onCancel={() => { setAdding(false); setForm({ value: '', type: 'personal' }); setDuplicate(null); }}
          saving={saving}
          saveLabel="Save email"
          onSubmit={add}
        >
          <div className="grid sm:grid-cols-[1fr_140px] gap-2">
            <input
              className="input"
              type="email"
              placeholder="Email"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              required
              aria-label="New email address"
            />
            <SelectMenu
              label="New email type"
              value={form.type}
              onChange={(type) => setForm({ ...form, type })}
              options={EMAIL_TYPES}
            />
          </div>
        </AddBar>
      )}
      <div className="mt-2"><DuplicateCustomerNotice duplicate={duplicate} /></div>
    </section>
  );
}
