import React, { useEffect, useState } from 'react';
import { Mail, MapPin, Phone, Plus } from 'lucide-react';
import { api } from '../lib/api';
import { formatSite, PHONE_TYPES, EMAIL_TYPES, typeLabel, primaryOf, emailFormatError } from '../lib/contacts';
import { duplicateFromError } from '../lib/duplicates';
import DuplicateCustomerNotice from './DuplicateCustomerNotice.jsx';
import SelectMenu from './SelectMenu.jsx';

function hintParts(...parts) {
  return parts.filter(Boolean).join(' · ') || undefined;
}

function mergeList(list, extras) {
  const seen = new Set((list || []).map((row) => row.id));
  return [...(list || []), ...(extras || []).filter((row) => row?.id && !seen.has(row.id))];
}

function Field({ icon: Icon, label, addLabel, onAdd, children }) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 ring-1 ring-slate-200/70">
          <Icon size={14} />
        </span>
        <span className="min-w-0 flex-1 text-[13px] font-semibold text-slate-800">{label}</span>
        {onAdd ? (
          <button
            type="button"
            className="btn-secondary !px-2 !py-1 text-xs"
            aria-label={addLabel}
            onClick={onAdd}
          >
            <Plus size={12} /> Add
          </button>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function AddPanel({ children, onCancel, saving, saveLabel, onSave }) {
  return (
    <div
      className="mt-2 space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
      onKeyDown={(e) => {
        if (e.key !== 'Enter' || e.target.tagName === 'BUTTON') return;
        e.preventDefault();
        onSave();
      }}
    >
      {children}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary !py-1.5 text-xs" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn-primary !py-1.5 text-xs" disabled={saving} onClick={onSave}>
          {saving ? 'Saving…' : saveLabel}
        </button>
      </div>
    </div>
  );
}

/**
 * Site / phone / email pickers for quotes, jobs, and site visits (requirement 2.2).
 * Always shows the same dropdowns. Add creates the contact on the customer so the
 * new row can be selected even when they already have sites, phones or emails.
 * Pass `stackPhoneEmail` from JobModal only so Phone and Email sit on their own rows.
 */
export default function ContactPickers({
  customer,
  customerId,
  value,
  onChange,
  idPrefix = 'contact',
  emptyLabel = null,
  onCustomerChanged,
  onError,
  stackPhoneEmail = false,
}) {
  const ownerId = customerId || customer?.id;
  const [added, setAdded] = useState({ sites: [], phones: [], emails: [] });
  const [adding, setAdding] = useState({ site: false, phone: false, email: false });
  const [saving, setSaving] = useState(false);
  const [duplicate, setDuplicate] = useState(null);
  const [draft, setDraft] = useState({
    address: '',
    phone: '',
    phone_type: 'mobile',
    email: '',
    email_type: 'personal',
  });

  useEffect(() => {
    setAdded({ sites: [], phones: [], emails: [] });
    setAdding({ site: false, phone: false, email: false });
    setDuplicate(null);
    setDraft({ address: '', phone: '', phone_type: 'mobile', email: '', email_type: 'personal' });
  }, [ownerId]);

  const sites = mergeList(customer?.sites, added.sites);
  const phones = mergeList(customer?.phones, added.phones);
  const emails = mergeList(customer?.emails, added.emails);
  if (!ownerId && !sites.length && !phones.length && !emails.length) return null;

  const set = (key, raw) => {
    const blank = emptyLabel ? '' : undefined;
    onChange({
      site_id: value?.site_id ?? (emptyLabel ? blank : primaryOf(sites)?.id) ?? '',
      phone_id: value?.phone_id ?? (emptyLabel ? blank : primaryOf(phones)?.id) ?? '',
      email_id: value?.email_id ?? (emptyLabel ? blank : primaryOf(emails)?.id) ?? '',
      [key]: raw === '' ? '' : Number(raw),
    });
  };

  const withEmpty = (list, mapOption) => ([
    ...(emptyLabel || !list.length ? [{ value: '', label: emptyLabel || 'Select…' }] : []),
    ...list.map(mapOption),
  ]);

  const closeAdd = (kind) => {
    setAdding((s) => ({ ...s, [kind]: false }));
    setDuplicate(null);
  };

  const fail = (err) => {
    const dup = duplicateFromError(err);
    if (dup) setDuplicate(dup);
    onError?.(err.message || 'Could not save this contact');
  };

  const saveSite = async () => {
    const address = draft.address.trim();
    if (!address || !ownerId) return;
    setSaving(true);
    setDuplicate(null);
    try {
      const res = await api.post(`/customers/${ownerId}/sites`, { address });
      const site = res.site;
      setAdded((prev) => ({ ...prev, sites: [...prev.sites, site] }));
      set('site_id', site.id);
      setDraft((d) => ({ ...d, address: '' }));
      closeAdd('site');
      onCustomerChanged?.();
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  };

  const savePhone = async () => {
    const phone = draft.phone.trim();
    if (!phone || !ownerId) return;
    setSaving(true);
    setDuplicate(null);
    try {
      const res = await api.post(`/customers/${ownerId}/phones`, { value: phone, type: draft.phone_type });
      const row = res.phone;
      setAdded((prev) => ({ ...prev, phones: [...prev.phones, row] }));
      set('phone_id', row.id);
      setDraft((d) => ({ ...d, phone: '', phone_type: 'mobile' }));
      closeAdd('phone');
      onCustomerChanged?.();
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  };

  const saveEmail = async () => {
    const email = draft.email.trim();
    if (!email || !ownerId) return;
    const emailErr = emailFormatError(email);
    if (emailErr) {
      fail({ message: emailErr });
      return;
    }
    setSaving(true);
    setDuplicate(null);
    try {
      const res = await api.post(`/customers/${ownerId}/emails`, { value: email, type: draft.email_type });
      const row = res.email;
      setAdded((prev) => ({ ...prev, emails: [...prev.emails, row] }));
      set('email_id', row.id);
      setDraft((d) => ({ ...d, email: '', email_type: 'personal' }));
      closeAdd('email');
      onCustomerChanged?.();
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  };

  const canAdd = Boolean(ownerId);
  const toggleAdd = (kind) => {
    setDuplicate(null);
    setAdding((s) => ({ ...s, [kind]: !s[kind] }));
  };

  const siteField = (
    <Field icon={MapPin} label="Site" addLabel="Add site" onAdd={canAdd ? () => toggleAdd('site') : undefined}>
      <SelectMenu
        id={`${idPrefix}-site`}
        label="Site"
        multiline
        value={value?.site_id || ''}
        onChange={(next) => set('site_id', next)}
        options={withEmpty(sites, (s) => ({
          value: s.id,
          label: formatSite(s),
          hint: hintParts(s.is_primary ? 'Primary' : null),
        }))}
      />
      {adding.site ? (
        <AddPanel onCancel={() => closeAdd('site')} saving={saving} saveLabel="Save site" onSave={saveSite}>
          <input
            id={`${idPrefix}-new-site`}
            className="input"
            placeholder="Address"
            value={draft.address}
            onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))}
            aria-label="New site address"
          />
        </AddPanel>
      ) : null}
    </Field>
  );

  const phoneField = (
    <Field icon={Phone} label="Phone" addLabel="Add phone" onAdd={canAdd ? () => toggleAdd('phone') : undefined}>
      <SelectMenu
        id={`${idPrefix}-phone`}
        label="Phone"
        value={value?.phone_id || ''}
        onChange={(next) => set('phone_id', next)}
        options={withEmpty(phones, (p) => ({
          value: p.id,
          label: p.value,
          hint: hintParts(typeLabel(PHONE_TYPES, p.type), p.is_primary ? 'Primary' : null),
        }))}
      />
      {adding.phone ? (
        <AddPanel onCancel={() => closeAdd('phone')} saving={saving} saveLabel="Save phone" onSave={savePhone}>
          <input
            id={`${idPrefix}-new-phone`}
            className="input"
            placeholder="Phone number"
            value={draft.phone}
            onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
            aria-label="New phone number"
          />
          <SelectMenu
            id={`${idPrefix}-new-phone-type`}
            label="New phone type"
            value={draft.phone_type}
            onChange={(phone_type) => setDraft((d) => ({ ...d, phone_type }))}
            options={PHONE_TYPES}
          />
        </AddPanel>
      ) : null}
    </Field>
  );

  const emailField = (
    <Field icon={Mail} label="Email" addLabel="Add email" onAdd={canAdd ? () => toggleAdd('email') : undefined}>
      <SelectMenu
        id={`${idPrefix}-email`}
        label="Email"
        value={value?.email_id || ''}
        onChange={(next) => set('email_id', next)}
        options={withEmpty(emails, (em) => ({
          value: em.id,
          label: em.value,
          hint: hintParts(typeLabel(EMAIL_TYPES, em.type), em.is_primary ? 'Primary' : null),
        }))}
      />
      {adding.email ? (
        <AddPanel onCancel={() => closeAdd('email')} saving={saving} saveLabel="Save email" onSave={saveEmail}>
          <input
            id={`${idPrefix}-new-email`}
            className="input"
            type="email"
            placeholder="Email"
            value={draft.email}
            onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
            aria-label="New email address"
          />
          <SelectMenu
            id={`${idPrefix}-new-email-type`}
            label="New email type"
            value={draft.email_type}
            onChange={(email_type) => setDraft((d) => ({ ...d, email_type }))}
            options={EMAIL_TYPES}
          />
        </AddPanel>
      ) : null}
    </Field>
  );

  return (
    <div className="space-y-3 rounded-2xl bg-slate-50/80 p-3.5 ring-1 ring-slate-200/80">
      {siteField}
      <div className={`grid gap-3 ${stackPhoneEmail ? '' : 'sm:grid-cols-2'}`}>
        {phoneField}
        {emailField}
      </div>
      <DuplicateCustomerNotice duplicate={duplicate} />
    </div>
  );
}
