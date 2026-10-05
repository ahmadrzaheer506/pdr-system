import React, { useEffect, useState } from 'react';
import { api, money, fmtDate } from '../lib/api';
import { Modal } from './ui.jsx';
import { invoiceOutstanding, todayDateInput } from '../lib/invoicePayments';
import DatePicker from './DatePicker.jsx';

/**
 * Ledger list (requirement 11.4). No reverse.
 */
export function InvoicePaymentLedger({ payments }) {
  if (!payments?.length) {
    return <p className="text-xs text-slate-400">No payments recorded.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {payments.map((p) => (
        <li key={p.id} className="text-xs text-slate-600 flex justify-between gap-2">
          <span>
            {fmtDate(p.paid_at)}
            {p.note ? <span className="text-slate-400"> · {p.note}</span> : null}
          </span>
          <span className="font-medium text-slate-800 whitespace-nowrap">{money(p.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Date + amount + optional note. Posts to POST /invoices/:id/payment.
 */
export default function InvoicePaymentForm({ invoice, onRecorded, onError }) {
  const remaining = invoiceOutstanding(invoice);
  const [amount, setAmount] = useState('');
  const [paidAt, setPaidAt] = useState(todayDateInput());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!invoice) return;
    setAmount(invoiceOutstanding(invoice).toFixed(2));
    setPaidAt(todayDateInput());
    setNote('');
  }, [invoice]);

  if (!invoice) return null;

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const result = await api.post(`/invoices/${invoice.id}/payment`, {
        amount: Number(amount),
        paid_at: paidAt,
        note: note.trim() || undefined,
      });
      onRecorded(result);
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="label" htmlFor={`pay-date-${invoice.id}`}>Date received</label>
        <DatePicker
          id={`pay-date-${invoice.id}`}
          label="Date received"
          value={paidAt}
          required
          onChange={setPaidAt}
        />
      </div>
      <div>
        <label className="label" htmlFor={`pay-amount-${invoice.id}`}>Amount received (£)</label>
        <input
          id={`pay-amount-${invoice.id}`}
          className="input"
          type="number"
          step="0.01"
          min="0.01"
          max={remaining}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="label" htmlFor={`pay-note-${invoice.id}`}>Note (optional)</label>
        <input
          id={`pay-note-${invoice.id}`}
          className="input"
          type="text"
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <p className="text-xs text-slate-400">
        Outstanding: {money(remaining)} of {money(invoice.due_now)} due now
      </p>
      <button type="submit" className="btn-primary w-full" disabled={saving || remaining <= 0}>
        {saving ? 'Saving…' : 'Record payment'}
      </button>
    </form>
  );
}

export function InvoicePaymentModal({ invoice, onClose, onRecorded, onError }) {
  if (!invoice) return null;
  return (
    <Modal open={!!invoice} onClose={onClose} title={`Record payment — ${invoice.ref}`}>
      <InvoicePaymentForm
        invoice={invoice}
        onRecorded={onRecorded}
        onError={onError}
      />
    </Modal>
  );
}
