import React, { useState } from 'react';
import { Mail, MapPin, Pencil, Phone } from 'lucide-react';
import { api } from '../lib/api';
import { formatSite, typeLabel, PHONE_TYPES, EMAIL_TYPES, contactIdsFromLead, findContact, primaryContactIds } from '../lib/contacts';
import ContactPickers from './ContactPickers.jsx';
import { Modal, HoverTooltip } from './ui.jsx';

function Line({ icon: Icon, children }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Icon size={13} className="shrink-0 text-slate-400" />
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

/**
 * One site, phone and email for this enquiry. Change picks from the customer
 * record (or adds a new contact there, then selects it).
 */
export default function LeadContacts({ customer, lead, onSaved, onError }) {
  const [open, setOpen] = useState(false);
  const [picks, setPicks] = useState({ site_id: '', phone_id: '', email_id: '' });
  const [saving, setSaving] = useState(false);

  const ids = lead ? contactIdsFromLead(lead) : primaryContactIds(customer);
  const site = findContact(customer?.sites, ids.site_id);
  const phone = findContact(customer?.phones, ids.phone_id);
  const email = findContact(customer?.emails, ids.email_id);

  const startEdit = () => {
    setPicks({
      site_id: ids.site_id || '',
      phone_id: ids.phone_id || '',
      email_id: ids.email_id || '',
    });
    setOpen(true);
  };

  const save = async (e) => {
    e.preventDefault();
    if (!lead?.id) return;
    setSaving(true);
    try {
      await api.put(`/leads/${lead.id}`, {
        site_id: picks.site_id || null,
        phone_id: picks.phone_id || null,
        email_id: picks.email_id || null,
      });
      setOpen(false);
      onSaved?.();
    } catch (err) {
      onError?.(err.message || 'Could not update this lead');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
        {phone ? (
          <Line icon={Phone}>
            {phone.value}
            <span className="text-slate-400"> ({typeLabel(PHONE_TYPES, phone.type)})</span>
          </Line>
        ) : null}
        {email ? (
          <Line icon={Mail}>
            {email.value}
            <span className="text-slate-400"> ({typeLabel(EMAIL_TYPES, email.type)})</span>
          </Line>
        ) : null}
        {site ? (
          <Line icon={MapPin}>{formatSite(site)}</Line>
        ) : null}
        {lead?.id ? (
          <HoverTooltip text="Change site, phone or email">
            <button
              type="button"
              onClick={startEdit}
              aria-label="Change"
              className="inline-flex h-7 items-center gap-1.5 rounded-full bg-slate-100 pl-2 pr-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-200 hover:text-slate-900"
            >
              <Pencil size={12} strokeWidth={2.25} />
              Change
            </button>
          </HoverTooltip>
        ) : null}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Lead site, phone and email" size="lg">
        <form onSubmit={save} className="space-y-3">
          <p className="text-sm text-slate-500">
            This enquiry uses one site, one number and one email. Pick from the customer record, or add a new one.
          </p>
          <ContactPickers
            customer={customer}
            value={picks}
            onChange={setPicks}
            idPrefix="lead-contacts"
            emptyLabel="Select…"
            onError={onError}
          />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
