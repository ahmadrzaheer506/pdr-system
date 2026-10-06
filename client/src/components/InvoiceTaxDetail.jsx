import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Download, Send, Loader2 } from 'lucide-react';
import { api, money } from '../lib/api';
import { leadPath } from '../lib/customerRoutes.js';
import { Modal, StatusBadge } from './ui.jsx';
import InvoiceTaxSummary from './InvoiceTaxSummary.jsx';
import { canEditInvoiceTax, VAT_TREATMENT_OPTIONS, CIS_RATE_OPTIONS } from '../lib/invoiceTax';
import { canEmailInvoice, downloadInvoicePdf } from '../lib/invoicePdf';
import { canRecordPayment, invoiceOutstanding } from '../lib/invoicePayments';
import InvoicePaymentForm, { InvoicePaymentLedger } from './InvoicePaymentForm.jsx';
import SelectMenu from './SelectMenu.jsx';

/**
 * Invoice VAT / CIS drawer (requirement 11.2) plus PDF/email (requirement 11.3)
 * and payment ledger (requirement 11.4).
 */
export default function InvoiceTaxDetail({ invoice, onClose, onSaved, onError, onSent, onPaid, from = 'invoices' }) {
  const [vatTreatment, setVatTreatment] = useState('standard');
  const [cisApplies, setCisApplies] = useState(false);
  const [cisRate, setCisRate] = useState(20);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!invoice) return;
    setVatTreatment(invoice.vat_treatment || 'standard');
    setCisApplies(!!invoice.cis_applies);
    setCisRate(Number(invoice.cis_rate) || 20);
  }, [invoice]);

  if (!invoice) return null;

  const editable = canEditInvoiceTax(invoice.status);
  const notice = invoice.reverse_charge_notice
    || (invoice.vat_treatment === 'reverse_charge'
      ? `Reverse charge: VAT Act 1994 Section 55A applies. Customer to pay the VAT to HMRC. VAT to be accounted for by the customer: ${money(invoice.reverse_charge_vat || 0)}.`
      : null);

  const save = async (e) => {
    e.preventDefault();
    if (!editable) return;
    setSaving(true);
    try {
      const result = await api.put(`/invoices/${invoice.id}/tax`, {
        vat_treatment: vatTreatment,
        cis_applies: cisApplies,
        cis_rate: Number(cisRate),
      });
      onSaved(result.invoice);
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const download = async () => {
    setDownloading(true);
    try { await downloadInvoicePdf(invoice); }
    catch (err) { onError(err.message); }
    finally { setDownloading(false); }
  };

  const sendEmail = async () => {
    setSending(true);
    try {
      await api.post(`/invoices/${invoice.id}/send`);
      onSent?.();
    } catch (err) { onError(err.message); }
    finally { setSending(false); }
  };

  const leadHref = invoice.customer_id
    ? leadPath(invoice.customer_id, from, invoice.lead_id)
    : null;

  return (
    <Modal
      open={!!invoice}
      onClose={onClose}
      title={`Invoice ${invoice.ref}`}
      headerActions={leadHref ? (
        <Link
          to={leadHref}
          onClick={onClose}
          className="btn-secondary !py-1.5 !px-2.5 text-xs inline-flex items-center gap-1"
        >
          Open lead
          <ArrowUpRight size={13} />
        </Link>
      ) : null}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <StatusBadge status={invoice.status} />
          {invoice.customer_name && <span className="text-sm text-slate-500">{invoice.customer_name}</span>}
        </div>

        <InvoiceTaxSummary invoice={invoice} />
        {invoice.status !== 'draft' && (
          <p className="text-sm text-slate-600">
            Paid {money(invoice.amount_paid || 0)} · Outstanding {money(invoice.outstanding ?? invoiceOutstanding(invoice))}
          </p>
        )}

        {invoice.vat_treatment === 'reverse_charge' && notice && (
          <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2" role="note">
            {notice}
          </p>
        )}

        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="btn-ghost !py-1.5 !px-2 text-xs inline-flex items-center gap-1" disabled={downloading} onClick={download}>
            <Download size={12} /> {downloading ? 'Preparing PDF…' : 'Download PDF'}
          </button>
          {canEmailInvoice(invoice.status) && (
            <button
              type="button"
              aria-label="Send email"
              aria-busy={sending || undefined}
              className="btn-secondary !py-1.5 !px-2 text-xs inline-flex items-center gap-1"
              disabled={sending}
              onClick={sendEmail}
            >
              {sending
                ? <><Loader2 size={12} className="animate-spin" /> Sending…</>
                : <><Send size={12} /> Send email</>}
            </button>
          )}
        </div>

        <div className="border-t border-slate-100 pt-3 space-y-2">
          <p className="text-xs font-medium text-slate-500 uppercase">Payments</p>
          <InvoicePaymentLedger payments={invoice.payments} />
        </div>

        {canRecordPayment(invoice.status) && (
          <div className="border-t border-slate-100 pt-3">
            <InvoicePaymentForm
              invoice={invoice}
              onRecorded={(result) => onPaid?.(result.invoice || result)}
              onError={onError}
            />
          </div>
        )}

        {editable ? (
          <form onSubmit={save} className="space-y-3 border-t border-slate-100 pt-3">
            <p className="text-xs text-slate-500">Draft only — VAT and CIS freeze after the invoice is sent.</p>
            <div>
              <label className="label" htmlFor="invoice-vat-treatment">VAT treatment</label>
              <SelectMenu
                id="invoice-vat-treatment"
                label="VAT treatment"
                value={vatTreatment}
                onChange={setVatTreatment}
                options={VAT_TREATMENT_OPTIONS}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="h-4 w-4 shrink-0 accent-brand-500" checked={cisApplies} onChange={(e) => setCisApplies(e.target.checked)} />
              Apply CIS deduction
            </label>
            {cisApplies && (
              <div>
                <label className="label" htmlFor="invoice-cis-rate">CIS rate</label>
                <SelectMenu
                  id="invoice-cis-rate"
                  label="CIS rate"
                  value={cisRate}
                  onChange={(next) => setCisRate(Number(next))}
                  options={CIS_RATE_OPTIONS}
                />
              </div>
            )}
            <button type="submit" className="btn-primary w-full" disabled={saving}>
              {saving ? 'Saving…' : 'Save VAT & CIS'}
            </button>
          </form>
        ) : (
          <p className="text-xs text-slate-500 border-t border-slate-100 pt-3">
            VAT and CIS are frozen on sent and paid invoices.
          </p>
        )}
      </div>
    </Modal>
  );
}
