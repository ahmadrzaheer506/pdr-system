import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Send, PoundSterling, Download, Loader2, Receipt } from 'lucide-react';
import { api, money, fmtDate } from '../lib/api';
import { PageLoading, StatusBadge, EmptyState, useToast, Toast } from '../components/ui.jsx';
import InvoiceTaxDetail from '../components/InvoiceTaxDetail.jsx';
import { InvoicePaymentModal } from '../components/InvoicePaymentForm.jsx';
import { canEmailInvoice, downloadInvoicePdf } from '../lib/invoicePdf';
import { invoiceSentMessage, isLiveQboId } from '../lib/quickbooks';
import { canRecordPayment } from '../lib/invoicePayments';
import { leadPath } from '../lib/customerRoutes.js';
import ListFilterBar from '../components/ListFilterBar.jsx';

const FILTERS = [
  { value: 'ALL', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'part_paid', label: 'Part paid' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
];

export default function Invoices() {
  const [status, setStatus] = useState('ALL');
  const [q, setQ] = useState('');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [data, setData] = useState(null);
  const [ready, setReady] = useState([]);
  const [creatingId, setCreatingId] = useState(null);
  const [sendingId, setSendingId] = useState(null);
  const [payModal, setPayModal] = useState(null);
  const [openInvoice, setOpenInvoice] = useState(null);
  const [summary, setSummary] = useState(null);
  const { toast, show } = useToast();

  const load = () => {
    const params = new URLSearchParams();
    params.set('status', status);
    if (q.trim()) params.set('q', q.trim());
    if (createdFrom) params.set('created_from', createdFrom);
    if (createdTo) params.set('created_to', createdTo);
    api.get(`/invoices?${params.toString()}`).then((d) => setData(d.invoices)).catch((err) => {
      show(err.message, 'error');
      setData([]);
    });
    api.get('/invoices/ready').then((d) => setReady(d.jobs || [])).catch(() => setReady([]));
    api.get('/invoices/summary').then(setSummary).catch(() => setSummary(null));
  };
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [status, q, createdFrom, createdTo]);

  const createFromJob = async (job) => {
    setCreatingId(job.id);
    try {
      const created = await api.post('/invoices', { job_id: job.id });
      show(`Invoice ${created.ref} created`);
      load();
    } catch (err) {
      show(err.message, 'error');
    } finally {
      setCreatingId(null);
    }
  };

  const sendInvoice = async (inv) => {
    setSendingId(inv.id);
    try {
      const result = await api.post(`/invoices/${inv.id}/send`);
      show(invoiceSentMessage(result));
      load();
    } catch (err) {
      show(err.message, 'error');
    } finally {
      setSendingId(null);
    }
  };

  const downloadPdf = async (inv) => {
    try { await downloadInvoicePdf(inv); }
    catch (err) { show(err.message, 'error'); }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Invoices</h1>
        <p className="text-slate-500 text-sm mt-0.5">Raised from completed jobs, synced with QuickBooks.</p>
      </div>

      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="card p-4">
            <div className="text-xs text-slate-500">Outstanding</div>
            <div className="text-lg font-semibold text-slate-900 mt-0.5">{money(summary.outstanding)}</div>
            <div className="text-xs text-slate-400 mt-0.5">Due now less paid</div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-slate-500">Overdue</div>
            <div className="text-lg font-semibold text-slate-900 mt-0.5">{money(summary.overdue)}</div>
            <div className="text-xs text-slate-400 mt-0.5">
              {summary.overdue_count} invoice{summary.overdue_count === 1 ? '' : 's'}
            </div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-slate-500">Paid in full</div>
            <div className="text-lg font-semibold text-slate-900 mt-0.5">{summary.paid_count}</div>
            <div className="text-xs text-slate-400 mt-0.5">invoices</div>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Completed jobs ready to invoice</h2>
          <p className="text-xs text-slate-500 mt-0.5">Jobs marked completed that do not yet have an invoice.</p>
        </div>
        {ready.length === 0 ? (
          <p className="px-4 py-3 text-sm text-slate-500">None waiting.</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Job</th>
                <th className="text-left px-4 py-2.5 font-medium">Customer</th>
                <th className="text-right px-4 py-2.5 font-medium">Value</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {ready.map((job) => (
                <tr key={job.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-800">{job.title}</td>
                  <td className="px-4 py-3">
                    <Link to={leadPath(job.customer_id, 'invoices')} className="hover:text-brand-600">{job.customer_name}</Link>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{money(job.value)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="btn-primary !py-1 !px-2 text-xs"
                      disabled={creatingId === job.id}
                      aria-label={`Create invoice for ${job.title}`}
                      onClick={() => createFromJob(job)}
                    >
                      {creatingId === job.id ? 'Creating…' : 'Create'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <ListFilterBar
        tabs={FILTERS}
        value={status}
        onChange={setStatus}
        searchValue={q}
        onSearchChange={setQ}
        searchLabel="Search invoices"
        from={createdFrom}
        to={createdTo}
        onFromChange={setCreatedFrom}
        onToChange={setCreatedTo}
      />

      {!data ? <PageLoading /> : data.length === 0 ? (
        <EmptyState icon={Receipt} title="No invoices found" detail="Invoices are created from completed jobs, or from the invoicing prompt in Tasks." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Ref</th>
                <th className="text-left px-4 py-2.5 font-medium">Customer</th>
                <th className="text-right px-4 py-2.5 font-medium">Total</th>
                <th className="text-right px-4 py-2.5 font-medium">Due now</th>
                <th className="text-right px-4 py-2.5 font-medium">Paid</th>
                <th className="text-left px-4 py-2.5 font-medium">Due</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((inv) => (
                <tr key={inv.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    <button type="button" className="hover:text-brand-600" onClick={() => setOpenInvoice(inv)}>
                      {inv.ref}
                    </button>
                  </td>
                  <td className="px-4 py-3"><Link to={leadPath(inv.customer_id, 'invoices', inv.lead_id)} className="hover:text-brand-600">{inv.customer_name}</Link></td>
                  <td className="px-4 py-3 text-right font-medium">{money(inv.total)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{money(inv.due_now)}</td>
                  <td className="px-4 py-3 text-right text-slate-500">{money(inv.amount_paid)}</td>
                  <td className="px-4 py-3 text-slate-500">{fmtDate(inv.due_date)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-start gap-0.5">
                      <StatusBadge status={inv.status} />
                      {isLiveQboId(inv.qbo_id) && (
                        <span className="text-[10px] uppercase tracking-wide text-emerald-700">QuickBooks</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button type="button" onClick={() => downloadPdf(inv)} className="btn-ghost !py-1 !px-2 text-xs mr-1" aria-label={`Download PDF for ${inv.ref}`}>
                      <Download size={12} /> PDF
                    </button>
                    {canEmailInvoice(inv.status) && (
                      <button
                        type="button"
                        aria-label="Send"
                        aria-busy={sendingId === inv.id || undefined}
                        disabled={sendingId === inv.id}
                        onClick={() => sendInvoice(inv)}
                        className="btn-secondary !py-1 !px-2 text-xs mr-1 inline-flex items-center gap-1"
                      >
                        {sendingId === inv.id
                          ? <><Loader2 size={12} className="animate-spin" /> Sending…</>
                          : <><Send size={12} /> Send</>}
                      </button>
                    )}
                    {canRecordPayment(inv.status) && (
                      <button type="button" onClick={() => setPayModal(inv)} className="btn-secondary !py-1 !px-2 text-xs">
                        <PoundSterling size={12} /> Record payment
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <InvoiceTaxDetail
        invoice={openInvoice}
        from="invoices"
        onClose={() => setOpenInvoice(null)}
        onSaved={(updated) => {
          setOpenInvoice(updated);
          load();
          show('VAT and CIS saved');
        }}
        onSent={(result) => {
          load();
          show(invoiceSentMessage(result));
          setOpenInvoice((inv) => (inv ? { ...inv, status: 'sent' } : null));
        }}
        onPaid={(updated) => {
          setOpenInvoice(updated);
          load();
          show('Payment recorded');
        }}
        onError={(msg) => show(msg, 'error')}
      />
      <InvoicePaymentModal
        invoice={payModal}
        onClose={() => setPayModal(null)}
        onRecorded={() => { setPayModal(null); load(); show('Payment recorded'); }}
        onError={(msg) => show(msg, 'error')}
      />
      <Toast {...toast} />
    </div>
  );
}
