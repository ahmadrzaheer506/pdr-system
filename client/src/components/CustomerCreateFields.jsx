import React from 'react';
import { Mail, MapPin, Phone, User } from 'lucide-react';
import CustomerTypeFields from './CustomerTypeFields.jsx';
import SelectMenu from './SelectMenu.jsx';
import { PHONE_TYPES, EMAIL_TYPES } from '../lib/contacts';

export const EMPTY_CUSTOMER_FORM = {
  name: '',
  phone: '',
  phone_type: 'mobile',
  email: '',
  email_type: 'personal',
  address: '',
  customer_type: 'domestic',
  company_name: '',
  vat_number: '',
};

function Field({ icon: Icon, label, htmlFor, children }) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 ring-1 ring-slate-200/70">
          <Icon size={14} />
        </span>
        <label htmlFor={htmlFor} className="text-[13px] font-semibold text-slate-800">{label}</label>
      </div>
      {children}
    </div>
  );
}

function TypeField({ label, htmlFor, children }) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex h-7 items-center">
        <label htmlFor={htmlFor} className="text-[13px] font-semibold text-slate-800">{label}</label>
      </div>
      {children}
    </div>
  );
}

/**
 * Shared create-customer fields (requirement 2.1 / 2.2) used by New customer
 * and Log enquiry so both capture the same contact details.
 */
export default function CustomerCreateFields({ form, onChange, idPrefix }) {
  const set = (key) => (e) => onChange({ ...form, [key]: e.target.value });
  const nameLabel = form.customer_type === 'commercial' ? 'Contact name' : 'Name';
  return (
    <div className="space-y-3 rounded-2xl bg-slate-50/80 p-3.5 ring-1 ring-slate-200/80">
      <CustomerTypeFields form={form} onChange={onChange} idPrefix={idPrefix} />
      <Field icon={User} label={nameLabel} htmlFor={`${idPrefix}-name`}>
        <input id={`${idPrefix}-name`} className="input bg-white" value={form.name} onChange={set('name')} required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field icon={Phone} label="Phone" htmlFor={`${idPrefix}-phone`}>
          <input id={`${idPrefix}-phone`} className="input bg-white" value={form.phone} onChange={set('phone')} />
        </Field>
        <TypeField label="Phone type" htmlFor={`${idPrefix}-phone-type`}>
          <SelectMenu
            id={`${idPrefix}-phone-type`}
            label="Phone type"
            value={form.phone_type}
            onChange={(phone_type) => onChange({ ...form, phone_type })}
            options={PHONE_TYPES}
          />
        </TypeField>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field icon={Mail} label="Email" htmlFor={`${idPrefix}-email`}>
          <input id={`${idPrefix}-email`} className="input bg-white" type="email" value={form.email} onChange={set('email')} />
        </Field>
        <TypeField label="Email type" htmlFor={`${idPrefix}-email-type`}>
          <SelectMenu
            id={`${idPrefix}-email-type`}
            label="Email type"
            value={form.email_type}
            onChange={(email_type) => onChange({ ...form, email_type })}
            options={EMAIL_TYPES}
          />
        </TypeField>
      </div>
      <Field icon={MapPin} label="Address" htmlFor={`${idPrefix}-address`}>
        <input id={`${idPrefix}-address`} className="input bg-white" value={form.address} onChange={set('address')} />
      </Field>
    </div>
  );
}
