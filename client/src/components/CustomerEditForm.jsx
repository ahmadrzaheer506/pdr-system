import React, { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { ROLES } from '../lib/roles';
import { CustomerTypeSelect, CommercialCompanyFields } from './CustomerTypeFields.jsx';
import SelectMenu from './SelectMenu.jsx';

function formFromCustomer(customer) {
  return {
    name: customer?.name || '',
    notes: customer?.notes || '',
    customer_type: customer?.customer_type === 'commercial' ? 'commercial' : 'domestic',
    company_name: customer?.company_name || '',
    vat_number: customer?.vat_number || '',
    owner_id: customer?.owner_id != null ? String(customer.owner_id) : '',
  };
}

function isDirty(form, customer) {
  const orig = formFromCustomer(customer);
  return Object.keys(orig).some((key) => String(form[key] ?? '') !== String(orig[key] ?? ''));
}

/**
 * Shared customer identity form — used inline on the master record and in the lead-page edit modal.
 */
export default function CustomerEditForm({
  customer,
  onSaved,
  onError,
  idPrefix = 'customer',
  submitLabel = 'Save changes',
  fullWidth = false,
}) {
  const [form, setForm] = useState(() => formFromCustomer(customer));
  const [saving, setSaving] = useState(false);
  const [owners, setOwners] = useState([]);

  useEffect(() => {
    if (!customer) return;
    setForm(formFromCustomer(customer));
    api.get('/settings/users')
      .then((d) => {
        const list = (d.users || []).filter((u) => u.active !== false && u.role !== ROLES.STAFF);
        if (customer.owner_id && !list.some((u) => Number(u.id) === Number(customer.owner_id))) {
          list.unshift({ id: customer.owner_id, name: customer.owner_name || `User #${customer.owner_id}` });
        }
        setOwners(list);
      })
      .catch(() => setOwners([]));
  }, [customer]);

  const submit = async (e) => {
    e.preventDefault();
    if (form.customer_type === 'commercial' && !form.company_name.trim()) {
      onError('Company name is required for commercial customers');
      return;
    }
    setSaving(true);
    try {
      await api.put(`/customers/${customer.id}`, {
        name: form.name.trim(),
        notes: form.notes || null,
        customer_type: form.customer_type,
        company_name: form.customer_type === 'commercial' ? form.company_name.trim() : null,
        vat_number: form.customer_type === 'commercial' ? (form.vat_number.trim() || null) : null,
        owner_id: form.owner_id === '' ? null : Number(form.owner_id),
      });
      onSaved();
    } catch (err) {
      onError(err.message || 'Could not update the customer');
    } finally {
      setSaving(false);
    }
  };

  const dirty = isDirty(form, customer);
  const nameLabel = form.customer_type === 'commercial' ? 'Contact name' : 'Name';

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <CustomerTypeSelect form={form} onChange={setForm} idPrefix={idPrefix} />
        <div>
          <label className="label" htmlFor={`${idPrefix}-owner`}>Owner</label>
          <SelectMenu
            id={`${idPrefix}-owner`}
            label="Owner"
            value={form.owner_id}
            onChange={(owner_id) => setForm({ ...form, owner_id })}
            options={[
              { value: '', label: 'Unassigned' },
              ...owners.map((o) => ({ value: String(o.id), label: o.name })),
            ]}
          />
        </div>
      </div>
      <CommercialCompanyFields form={form} onChange={setForm} idPrefix={idPrefix} />
      <div>
        <label className="label" htmlFor={`${idPrefix}-name`}>{nameLabel}</label>
        <input
          id={`${idPrefix}-name`}
          className="input"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
      </div>
      <div>
        <label className="label" htmlFor={`${idPrefix}-notes`}>Notes</label>
        <textarea
          id={`${idPrefix}-notes`}
          className="input min-h-[4.5rem] resize-y"
          rows={3}
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Anything the office should know — access, preferences, how they like to be contacted."
        />
      </div>
      <div className={`flex items-center pt-1 ${fullWidth ? '' : 'justify-end'}`}>
        <button
          className={`btn-primary ${fullWidth ? 'w-full' : 'min-w-[8.5rem]'}`}
          disabled={saving || !dirty}
        >
          {saving ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
