import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Send, PoundSterling } from 'lucide-react';
import { api, money, fmtDate } from '../lib/api';
import { PageLoading, StatusBadge, EmptyState, Modal, useToast, Toast } from '../components/ui.jsx';
import { Receipt } from 'lucide-react';

const FILTERS = ['ALL', 'draft', 'sent', 'part_paid', 'paid', 'overdue'];

export default function Invoices() {
  const [status, setStatus] = useState('ALL');
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [payModal, setPayModal] = useState(null);
  const { toast, show } = useToast();

  const load = () => api.get(`/invoices?status=${status}${q ? `&q=${encodeURIComponent(q)}` : ''}`).then((d) => setData(d.invoices));
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [status, q]);

  const sendInvoice = async (inv) => {
    try { await api.post(`/invoices/${inv.id}/send`); show('Invoice sent & pushed to QuickBooks'); load(); }
    catch (err) { show(err.message, 'error'); }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Invoices</h1>
        <p className="text-slate-500 text-sm mt-0.5">Raised from completed jobs, synced with QuickBooks.</p>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1">
          {FILTERS.map((s) => (
            <button key={s} onClick={() => setStatus(s)} className={`px-3 py-1.5 text-sm rounded-md font-medium capitalize ${status === s ? 'bg-navy-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>{s.replace('_', ' ')}</button>
          ))}
        </div>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input !pl-9 w-56" placeholder="Search invoices…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {!data ? <PageLoading /> : data.length === 0 ? (
        <EmptyState icon={Receipt} title="No invoices found" detail="Invoices are created from completed jobs, or from the invoicing prompt in Tasks." />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Ref</th>
                <th className="text-left px-4 py-2.5 font-medium">Customer</th>
                <th className="text-right px-4 py-2.5 font-medium">Total</th>
                <th className="text-right px-4 py-2.5 font-medium">Paid</th>
                <th className="text-left px-4 py-2.5 font-medium">Due</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((inv) => (
                <tr key={inv.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800"><Link to={`/customers/${inv.customer_id}`} className="hover:text-brand-600">{inv.ref}</Link></td>
                  <td className="px-4 py-3"><Link to={`/customers/${inv.customer_id}`} className="hover:text-brand-600">{inv.customer_name}</Link></td>
                  <td className="px-4 py-3 text-right font-medium">{money(inv.total)}</td>
                  <td className="px-4 py-3 text-right text-slate-500">{money(inv.amount_paid)}</td>
                  <td className="px-4 py-3 text-slate-500">{fmtDate(inv.due_date)}</td>
                  <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {inv.status === 'draft' && <button onClick={() => sendInvoice(inv)} className="btn-secondary !py-1 !px-2 text-xs mr-1"><Send size={12} /> Send</button>}
                    {['sent', 'part_paid', 'overdue'].includes(inv.status) && <button onClick={() => setPayModal(inv)} className="btn-secondary !py-1 !px-2 text-xs"><PoundSterling size={12} /> Record payment</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <PaymentModal invoice={payModal} onClose={() => setPayModal(null)} onSaved={() => { setPayModal(null); load(); show('Payment recorded'); }} />
      <Toast {...toast} />
    </div>
  );
}

function PaymentModal({ invoice, onClose, onSaved }) {
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (invoice) setAmount((invoice.total - invoice.amount_paid).toFixed(2)); }, [invoice]);
  if (!invoice) return null;
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try { await api.post(`/invoices/${invoice.id}/payment`, { amount: Number(amount) }); onSaved(); }
    finally { setSaving(false); }
  };
  return (
    <Modal open={!!invoice} onClose={onClose} title={`Record payment — ${invoice.ref}`}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">Amount received (£)</label>
          <input className="input" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>
        <p className="text-xs text-slate-400">Outstanding: {money(invoice.total - invoice.amount_paid)} of {money(invoice.total)}</p>
        <button className="btn-primary w-full" disabled={saving}>{saving ? 'Saving…' : 'Record payment'}</button>
      </form>
    </Modal>
  );
}
