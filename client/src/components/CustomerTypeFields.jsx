import React from 'react';
import { Building2, Users } from 'lucide-react';
import SelectMenu from './SelectMenu.jsx';

export const CUSTOMER_TYPE_OPTIONS = [
  { value: 'domestic', label: 'Domestic' },
  { value: 'commercial', label: 'Commercial' },
];

export function CustomerTypeSelect({ form, onChange, idPrefix, variant = 'default' }) {
  const card = variant === 'card';
  return (
    <div className="min-w-0">
      {card ? (
        <div className="mb-1.5 flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 ring-1 ring-slate-200/70">
            <Users size={14} />
          </span>
          <label htmlFor={`${idPrefix}-customer-type`} className="text-[13px] font-semibold text-slate-800">Customer type</label>
        </div>
      ) : (
        <label className="label" htmlFor={`${idPrefix}-customer-type`}>Customer type</label>
      )}
      <SelectMenu
        id={`${idPrefix}-customer-type`}
        label="Customer type"
        value={form.customer_type}
        required
        onChange={(customer_type) => onChange({ ...form, customer_type })}
        options={CUSTOMER_TYPE_OPTIONS}
      />
    </div>
  );
}

export function CommercialCompanyFields({ form, onChange, idPrefix }) {
  if (form.customer_type !== 'commercial') return null;
  const set = (key) => (e) => onChange({ ...form, [key]: e.target.value });
  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 sm:p-4">
      <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-indigo-800">
        <Building2 size={13} />
        Company details
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor={`${idPrefix}-company-name`}>Company name</label>
          <input
            id={`${idPrefix}-company-name`}
            className="input bg-white"
            value={form.company_name}
            onChange={set('company_name')}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor={`${idPrefix}-vat-number`}>VAT number (optional)</label>
          <input
            id={`${idPrefix}-vat-number`}
            className="input bg-white"
            value={form.vat_number}
            onChange={set('vat_number')}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Type selector plus commercial-only company / VAT fields (requirement 2.1).
 */
export default function CustomerTypeFields({ form, onChange, idPrefix }) {
  return (
    <>
      <CustomerTypeSelect form={form} onChange={onChange} idPrefix={idPrefix} variant="card" />
      <CommercialCompanyFields form={form} onChange={onChange} idPrefix={idPrefix} />
    </>
  );
}
