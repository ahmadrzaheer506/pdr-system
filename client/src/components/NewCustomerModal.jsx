import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Modal, useToast, Toast } from './ui.jsx';
import CustomerCreateFields, { EMPTY_CUSTOMER_FORM } from './CustomerCreateFields.jsx';
import DuplicateCustomerNotice from './DuplicateCustomerNotice.jsx';
import { duplicateFromError } from '../lib/duplicates';

export default function NewCustomerModal({ open, onClose }) {
  const navigate = useNavigate();
  const { toast, show } = useToast();
  const [form, setForm] = useState(EMPTY_CUSTOMER_FORM);
  const [saving, setSaving] = useState(false);
  const [duplicate, setDuplicate] = useState(null);

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY_CUSTOMER_FORM);
    setDuplicate(null);
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    if (form.customer_type === 'commercial' && !form.company_name.trim()) {
      show('Company name is required for commercial customers', 'error');
      return;
    }
    setSaving(true);
    setDuplicate(null);
    try {
      const payload = {
        name: form.name.trim(),
        phones: form.phone.trim() ? [{ value: form.phone.trim(), type: form.phone_type, is_primary: true }] : [],
        emails: form.email.trim() ? [{ value: form.email.trim(), type: form.email_type, is_primary: true }] : [],
        sites: form.address.trim() ? [{ address: form.address.trim(), is_primary: true }] : [],
        customer_type: form.customer_type,
        company_name: form.customer_type === 'commercial' ? form.company_name.trim() : null,
        vat_number: form.customer_type === 'commercial' ? (form.vat_number.trim() || null) : null,
      };
      const { id } = await api.post('/customers', payload);
      setForm(EMPTY_CUSTOMER_FORM);
      onClose();
      navigate(`/customers/${id}`);
    } catch (err) {
      const dup = duplicateFromError(err);
      if (dup) setDuplicate(dup);
      show(err.message || 'Could not create the customer', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New customer">
      <form onSubmit={submit} className="space-y-3">
        <DuplicateCustomerNotice duplicate={duplicate} />
        <CustomerCreateFields form={form} onChange={setForm} idPrefix="new-customer" />
        <button className="btn-primary w-full" disabled={saving}>{saving ? 'Saving…' : 'Create customer'}</button>
      </form>
      <Toast {...toast} />
    </Modal>
  );
}
