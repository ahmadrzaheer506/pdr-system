import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { customerPath, leadBackLink } from '../lib/customerRoutes.js';
import { leadSourceLabel } from '../lib/leads.js';
import { enquiryWorkspaceStage, filterByLeadScope, leadWorkspaceScope } from '../lib/leadWorkspace.js';
import {
  ArrowLeft, Phone, Mail, MapPin, Send, Calendar, FileText, Briefcase, Receipt,
  Check, X, ChevronDown, Building2, Copy, Download, IdCard, Pencil, Trash2, Loader2, Users,
} from 'lucide-react';
import { api, money, fmtDate, fmtDateTime } from '../lib/api';
import { PageLoading, LoadError, StageBadge, StatusBadge, Modal, useToast, Toast, HoverTooltip } from '../components/ui.jsx';
import QuoteBuilder from '../components/QuoteBuilder.jsx';
import BookVisit from '../components/BookVisit.jsx';
import JobModal from '../components/JobModal.jsx';
import CustomerTimeline from '../components/CustomerTimeline.jsx';
import CustomerInternalNotes from '../components/CustomerInternalNotes.jsx';
import CustomerAttachments from '../components/CustomerAttachments.jsx';
import InvoiceTaxDetail from '../components/InvoiceTaxDetail.jsx';
import InvoiceTaxSummary from '../components/InvoiceTaxSummary.jsx';
import LostReasonModal from '../components/LostReasonModal.jsx';
import { formatSite, PHONE_TYPES, EMAIL_TYPES, typeLabel } from '../lib/contacts';
import { taskHref } from '../lib/taskList.js';
import { ROLES } from '../lib/roles';
import { canChangeVisit, canCompleteVisit, visitTypeLabel } from '../lib/visitTypes';
import VisitCompleteTick, { VisitCompleteRemarks } from '../components/VisitCompleteTick.jsx';
import { canEmailInvoice, downloadInvoicePdf } from '../lib/invoicePdf';
import { canRecordPayment, invoiceOutstanding } from '../lib/invoicePayments';
import { InvoicePaymentModal } from '../components/InvoicePaymentForm.jsx';
import SelectMenu from '../components/SelectMenu.jsx';
import ScrollableLeadList from '../components/ScrollableLeadList.jsx';
import DatePicker from '../components/DatePicker.jsx';

const STAGE_FLOW = ['ENQUIRY', 'SITE_VISIT_BOOKED', 'QUOTE_PENDING', 'QUOTED', 'FOLLOW_UP', 'WON', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'INVOICED', 'PAID', 'LOST'];

export default function CustomerDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const back = leadBackLink(params.get('from'), id);
  const [data, setData] = useState(null);
  const [quoteModal, setQuoteModal] = useState(null); // null | true | quote object
  const [visitModal, setVisitModal] = useState(null);
  const [cancelVisit, setCancelVisit] = useState(null);
  const [completingVisitId, setCompletingVisitId] = useState(null);
  const [lostOpen, setLostOpen] = useState(false);
  const [lostSaving, setLostSaving] = useState(false);
  const [openJob, setOpenJob] = useState(null);
  const [openInvoice, setOpenInvoice] = useState(null);
  const [payInvoice, setPayInvoice] = useState(null);
  const [staff, setStaff] = useState([]);
  const { toast, show } = useToast();

  const load = useCallback(() => api.get(`/customers/${id}`).then(setData).catch((err) => {
    show(err.message, 'error');
    setData((current) => (current && current.customer ? current : { error: err.message || 'Could not load this customer' }));
  }), [id, show]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get('/settings/users').then((d) => setStaff((d.users || []).filter((u) => u.role === ROLES.STAFF))).catch(() => setStaff([]));
  }, []);

  if (!data) return <PageLoading />;
  if (!data.customer) return <LoadError message={data.error || 'Customer not found'} />;
  const { customer } = data;
  const scope = leadWorkspaceScope(data.leads, params.get('lead'));
  const quotes = filterByLeadScope(data.quotes, scope);
  const jobs = filterByLeadScope(data.jobs, scope);
  const invoices = filterByLeadScope(data.invoices, scope);
  const appointments = filterByLeadScope(data.appointments, scope);
  const followups = filterByLeadScope(data.followups, scope);
  const timeline = filterByLeadScope(data.timeline, scope);
  const internalNotes = filterByLeadScope(data.internal_notes, scope);
  const files = filterByLeadScope(data.files, scope);
  const stageHistory = filterByLeadScope(data.stageHistory, scope);
  const displayStage = enquiryWorkspaceStage(customer.stage, scope);
  const activeLead = scope?.lead || null;
  const lostReason = activeLead?.lost_reason || (!activeLead ? customer.lost_reason : null);

  const changeStage = async (stage, extra = {}) => {
    try {
      await api.put(`/customers/${id}/stage`, {
        stage,
        ...extra,
        ...(activeLead?.id ? { lead_id: activeLead.id } : {}),
      });
      show(`Moved to ${stage.replace('_', ' ')}`);
      load();
      return true;
    } catch (err) {
      show(err.message, 'error');
      return false;
    }
  };

  const requestStage = (stage) => {
    if (stage === displayStage) return;
    if (stage === 'LOST') {
      setLostOpen(true);
      return;
    }
    changeStage(stage);
  };

  const confirmLost = async (payload) => {
    setLostSaving(true);
    try {
      const ok = await changeStage('LOST', payload);
      if (ok) setLostOpen(false);
    } finally {
      setLostSaving(false);
    }
  };

  const completeVisitTick = async (appointment) => {
    if (!appointment?.id) return;
    setCompletingVisitId(appointment.id);
    try {
      await api.post(`/appointments/${appointment.id}/complete`);
      show('Visit completed');
      load();
    } catch (err) {
      show(err.message, 'error');
    } finally {
      setCompletingVisitId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <Link to={back.to} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft size={15} /> {back.label}
        </Link>
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="max-w-full">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900">{customer.name}</h1>
              <span className={`badge ${customer.customer_type === 'commercial' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-700'}`}>
                {customer.customer_type === 'commercial' ? 'Commercial' : 'Domestic'}
              </span>
              <StageDropdown stage={displayStage} onChange={requestStage} />
            </div>
            {customer.customer_type === 'commercial' && customer.company_name && (
              <div className="flex items-center gap-1.5 mt-1.5 text-sm text-slate-700">
                <Building2 size={13} className="text-slate-400" /> {customer.company_name}
              </div>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-slate-500">
              <span className="flex items-center gap-1.5">
                Owner {customer.owner_name || 'Unassigned'}
              </span>
              {(customer.phones || []).map((p) => (
                <span key={`p${p.id}`} className="flex items-center gap-1.5">
                  <Phone size={13} /> {p.value}
                  <span className="text-slate-400">({typeLabel(PHONE_TYPES, p.type)}{p.is_primary ? ', primary' : ''})</span>
                </span>
              ))}
              {(customer.emails || []).map((em) => (
                <span key={`e${em.id}`} className="flex items-center gap-1.5">
                  <Mail size={13} /> {em.value}
                  <span className="text-slate-400">({typeLabel(EMAIL_TYPES, em.type)}{em.is_primary ? ', primary' : ''})</span>
                </span>
              ))}
              {(customer.sites || []).map((s) => (
                <span key={`s${s.id}`} className="flex items-center gap-1.5">
                  <MapPin size={13} /> {formatSite(s)}
                  {s.is_primary && <span className="text-slate-400">(primary)</span>}
                </span>
              ))}
              {customer.customer_type === 'commercial' && customer.vat_number && (
                <span>VAT {customer.vat_number}</span>
              )}
            </div>
          </div>
          <div className="ml-auto flex shrink-0 flex-wrap justify-end gap-2">
            <Link
              to={customerPath(id)}
              title="Open the master customer record"
              className="btn-secondary"
            >
              <IdCard size={15} />
              Customer record
            </Link>
            <button className="btn-secondary" onClick={() => setVisitModal('new')}><Calendar size={15} /> Book visit</button>
            <button className="btn-primary" onClick={() => setQuoteModal(true)}><FileText size={15} /> New quote</button>
          </div>
        </div>
        {lostReason && displayStage === 'LOST' && (
          <div className="mt-3 text-sm bg-rose-50 text-rose-700 rounded-lg px-3 py-2">Lost: {lostReason}</div>
        )}
        {activeLead && (
          <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={activeLead.status} className="capitalize" />
              <span className="text-xs font-medium text-slate-600">{leadSourceLabel(activeLead.source)}</span>
              {activeLead.next_action ? (
                <span className="text-[11px] font-medium text-amber-800">Next: {activeLead.next_action}</span>
              ) : null}
            </div>
            {activeLead.message ? (
              <p className="mt-1.5 text-sm text-slate-700 whitespace-pre-wrap">{activeLead.message}</p>
            ) : null}
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-3">
          <CustomerInternalNotes
            customer={customer}
            notes={internalNotes}
            onChanged={() => { load(); show('Note saved'); }}
            onError={(msg) => show(msg, 'error')}
          />
          <CustomerAttachments
            customerId={id}
            files={files}
            onChanged={() => { load(); show('Attachments updated'); }}
            onError={(msg) => show(msg, 'error')}
          />
          <div className="card p-4">
            <h3 className="font-semibold text-slate-800 mb-4">Activity timeline</h3>
            <CustomerTimeline items={(timeline || []).filter((item) => item.type !== 'note')} />
            <Composer customerId={id} onSent={() => { load(); show('Message sent'); }} onError={(e) => show(e, 'error')} />
          </div>
        </div>

        <div className="space-y-3">
          <StageHistoryCard rows={stageHistory} labels={data.labels} />
          <AppointmentsCard
            appts={appointments}
            onReschedule={setVisitModal}
            onCancel={setCancelVisit}
            onComplete={completeVisitTick}
            completingId={completingVisitId}
          />
          <QuotesCard
            quotes={quotes}
            onEdit={(q) => { if (!quoteLockedForEdit(q.status)) setQuoteModal(q); }}
            onChanged={load}
            show={show}
          />
          <JobsCard jobs={jobs} onOpen={setOpenJob} />
          <InvoicesCard invoices={invoices} onOpen={setOpenInvoice} onPay={setPayInvoice} onChanged={load} show={show} />
          {followups.length > 0 && (
            <FollowupsCard followups={followups} onChanged={load} show={show} />
          )}
        </div>
      </div>

      <QuoteBuilder
        open={!!quoteModal}
        onClose={() => setQuoteModal(null)}
        customerId={id}
        customer={customer}
        leadId={activeLead?.id || null}
        existingQuote={quoteModal && quoteModal !== true ? quoteModal : null}
        onSaved={() => { setQuoteModal(null); load(); show('Quote saved'); }}
      />
      <BookVisit
        open={!!visitModal}
        onClose={() => setVisitModal(null)}
        customer={customer}
        leadId={activeLead?.id || null}
        existing={visitModal && visitModal !== 'new' ? visitModal : null}
        onSaved={() => {
          const edited = visitModal && visitModal !== 'new';
          setVisitModal(null);
          load();
          show(edited ? 'Visit updated' : 'Visit booked');
        }}
      />
      <CancelVisitModal
        appointment={cancelVisit}
        onClose={() => setCancelVisit(null)}
        onCancelled={() => { setCancelVisit(null); load(); show('Visit cancelled'); }}
        onError={(msg) => show(msg, 'error')}
      />
      <LostReasonModal
        open={lostOpen}
        onClose={() => setLostOpen(false)}
        onConfirm={confirmLost}
        saving={lostSaving}
      />
      <JobModal jobId={openJob} onClose={() => setOpenJob(null)} onChanged={load} staff={staff} from={params.get('from') || 'customer'} />
      <InvoiceTaxDetail
        invoice={openInvoice}
        from={params.get('from') || 'customer'}
        onClose={() => setOpenInvoice(null)}
        onSaved={(updated) => {
          setOpenInvoice(updated);
          load();
          show('VAT and CIS saved');
        }}
        onSent={() => {
          load();
          show('Invoice sent & pushed to QuickBooks');
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
        invoice={payInvoice}
        onClose={() => setPayInvoice(null)}
        onRecorded={() => { setPayInvoice(null); load(); show('Payment recorded'); }}
        onError={(msg) => show(msg, 'error')}
      />
      <Toast {...toast} />
    </div>
  );
}

function StageHistoryCard({ rows, labels = {} }) {
  const label = (stage) => labels[stage] || (stage ? String(stage).replace(/_/g, ' ') : '—');
  return (
    <div className="card p-4">
      <h3 id="stage-history-heading" className="font-semibold text-slate-800 mb-3">Stage history</h3>
      {!rows?.length ? (
        <p className="text-sm text-slate-400">No stage changes yet.</p>
      ) : (
        <ol
          aria-labelledby="stage-history-heading"
          className="min-h-[3.75rem] max-h-[16.5rem] space-y-2 overflow-y-auto overscroll-contain pr-1"
        >
          {rows.map((row) => (
            <li key={row.id} className="text-sm border border-slate-100 rounded-lg px-3 py-2">
              <div className="text-slate-800">
                {label(row.from_stage)} → {label(row.to_stage)}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {fmtDateTime(row.created_at)}
                {row.user_name ? ` · ${row.user_name}` : ' · System'}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function StageDropdown({ stage, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onEsc = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Pipeline stage"
      >
        <StageBadge stage={stage} label={stage.replace(/_/g, ' ')} />
        <ChevronDown size={13} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-48 max-h-72 overflow-y-auto overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {STAGE_FLOW.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => { onChange(s); setOpen(false); }}
              className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
                s === stage ? 'bg-slate-50 font-medium text-slate-900' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span>{s.replace(/_/g, ' ')}</span>
              {s === stage ? <Check size={14} className="shrink-0 text-brand-500" /> : <span className="w-3.5 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Composer({ customerId, onSent, onError }) {
  const [channel, setChannel] = useState('whatsapp');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [named, setNamed] = useState([]);

  useEffect(() => {
    api.get('/settings').then((d) => {
      setNamed(Array.isArray(d.settings?.templates?.custom) ? d.settings.templates.custom : []);
    }).catch(() => setNamed([]));
  }, []);

  const send = async () => {
    if (!body.trim()) return;
    setSending(true);
    try {
      await api.post(`/customers/${customerId}/messages`, { channel, body });
      setBody('');
      onSent();
    } catch (err) { onError(err.message); }
    finally { setSending(false); }
  };

  return (
    <div className="mt-4 pt-3 border-t border-slate-100">
      <div className="flex gap-1 mb-2">
        {['whatsapp', 'email'].map((c) => (
          <button key={c} onClick={() => setChannel(c)} className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize ${channel === c ? 'bg-navy-900 text-white' : 'bg-slate-100 text-slate-500'}`}>{c}</button>
        ))}
      </div>
      {named.length > 0 && (
        <div className="mb-2">
          <label className="label" htmlFor="named-template">Insert template</label>
          <SelectMenu
            id="named-template"
            label="Insert template"
            value=""
            onChange={(key) => {
              const row = named.find((t) => t.key === key);
              if (row) setBody(row.body);
            }}
            options={[
              { value: '', label: 'Insert template…' },
              ...named.map((t) => ({ value: t.key, label: t.key })),
            ]}
          />
        </div>
      )}
      <div className="flex gap-2">
        <textarea className="input flex-1 !py-2" rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder={`Write a ${channel} message…`} />
        <button onClick={send} disabled={sending || !body.trim()} className="btn-primary self-end"><Send size={15} /></button>
      </div>
    </div>
  );
}

function sentViaLabel(via) {
  if (!via) return '';
  return String(via).split('+').map((part) => {
    if (part === 'whatsapp') return 'WhatsApp';
    if (part === 'email') return 'Email';
    return part;
  }).join(' + ');
}

function quoteLockedForEdit(status) {
  return status === 'accepted' || status === 'declined';
}

function quoteEditLockedHint(status) {
  if (status === 'accepted') return 'Accepted quote cannot be edited.';
  if (status === 'declined') return 'Declined quote cannot be edited.';
  return '';
}

function QuotesCard({ quotes, onEdit, onChanged, show }) {
  const [acceptQuote, setAcceptQuote] = useState(null);
  const [pickedExtras, setPickedExtras] = useState([]);
  const [busy, setBusy] = useState(null);
  const [cloneQuote, setCloneQuote] = useState(null);
  const [cloneTitle, setCloneTitle] = useState('');
  const [cloning, setCloning] = useState(false);
  const [deleteQuote, setDeleteQuote] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const quoteBusy = (id) => busy?.quoteId === id;
  const actionBusy = (id, action) => busy?.quoteId === id && busy.action === action;

  const send = async (q, channels) => {
    const action = channels[0] === 'whatsapp' ? 'whatsapp' : 'email';
    setBusy({ quoteId: q.id, action });
    try {
      await api.post(`/quotes/${q.id}/send`, { channels });
      show('Quote sent');
      await onChanged();
    } catch (err) { show(err.message, 'error'); }
    finally { setBusy(null); }
  };
  const decide = async (q, decision, accepted_extra_indexes) => {
    setBusy({ quoteId: q.id, action: decision });
    try {
      await api.post(`/quotes/${q.id}/decision`, { decision, accepted_extra_indexes });
      show(`Quote marked ${decision}`);
      setAcceptQuote(null);
      await onChanged();
    } catch (err) { show(err.message, 'error'); }
    finally { setBusy(null); }
  };
  const requestAccept = (q) => {
    const extras = Array.isArray(q.optional_extras) ? q.optional_extras : [];
    if (!extras.length) {
      decide(q, 'accepted');
      return;
    }
    setPickedExtras([]);
    setAcceptQuote(q);
  };
  const openClone = (q) => {
    setCloneQuote(q);
    setCloneTitle(q.title || '');
  };
  const clone = async (e) => {
    e.preventDefault();
    if (!cloneQuote) return;
    const title = cloneTitle.trim();
    if (!title) return;
    setCloning(true);
    try {
      const created = await api.post(`/quotes/${cloneQuote.id}/clone`, { title });
      show(`Quote ${created.ref} cloned`);
      setCloneQuote(null);
      onChanged();
      if (created.quote) onEdit(created.quote);
    } catch (err) { show(err.message, 'error'); }
    finally { setCloning(false); }
  };
  const remove = async () => {
    if (!deleteQuote) return;
    setDeleting(true);
    try {
      await api.del(`/quotes/${deleteQuote.id}`);
      show(`Quote ${deleteQuote.ref} deleted`);
      setDeleteQuote(null);
      onChanged();
    } catch (err) { show(err.message, 'error'); }
    finally { setDeleting(false); }
  };
  const downloadPdf = async (q) => {
    try {
      const { pdf } = await api.post(`/quotes/${q.id}/pdf`);
      await api.download(`/files/${encodeURIComponent(pdf)}?download=1`, `${q.ref}.pdf`);
    } catch (err) { show(err.message, 'error'); }
  };
  const extras = Array.isArray(acceptQuote?.optional_extras) ? acceptQuote.optional_extras : [];
  const toggleExtra = (i) => {
    setPickedExtras((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]));
  };

  return (
    <div className="card p-4">
      <h3 id="quotes-heading" className="font-semibold text-slate-800 mb-3 flex items-center gap-2"><FileText size={16} /> Quotes</h3>
      {quotes.length === 0 && <p className="text-sm text-slate-400">No quotes yet.</p>}
      {quotes.length > 0 && (
      <ScrollableLeadList labelledBy="quotes-heading" count={quotes.length} fallbackClass="max-h-[24rem]">
        {quotes.map((q) => (
          <div key={q.id} role="listitem" className="border border-slate-100 rounded-lg p-3">
            <div className="flex items-center justify-between">
              {quoteLockedForEdit(q.status) ? (
                <span className="font-medium text-sm text-slate-800">{q.ref}</span>
              ) : (
                <button type="button" onClick={() => onEdit(q)} className="font-medium text-sm text-slate-800 hover:text-brand-600 text-left">{q.ref}</button>
              )}
              <StatusBadge status={q.status} />
            </div>
            <div className="text-xs text-slate-500 mt-0.5">{q.title}</div>
            <div className="text-sm font-semibold text-slate-900 mt-1">{money(q.total)}</div>
            {q.sent_at && (
              <div className="text-xs text-slate-400 mt-1">
                {q.sent_via ? `Sent via ${sentViaLabel(q.sent_via)} · ${fmtDateTime(q.sent_at)}` : `Sent · ${fmtDateTime(q.sent_at)}`}
              </div>
            )}
            {['draft', 'sent'].includes(q.status) && (
              <div className="flex gap-1.5 mt-2">
                <button
                  type="button"
                  aria-label="Send WhatsApp"
                  aria-busy={actionBusy(q.id, 'whatsapp') || undefined}
                  disabled={quoteBusy(q.id)}
                  onClick={() => send(q, ['whatsapp'])}
                  className="btn-secondary !py-1 !px-2 text-xs flex-1 inline-flex items-center justify-center gap-1"
                >
                  {actionBusy(q.id, 'whatsapp') ? <><Loader2 size={12} className="animate-spin" /> Sending…</> : 'Send WhatsApp'}
                </button>
                <button
                  type="button"
                  aria-label="Send Email"
                  aria-busy={actionBusy(q.id, 'email') || undefined}
                  disabled={quoteBusy(q.id)}
                  onClick={() => send(q, ['email'])}
                  className="btn-secondary !py-1 !px-2 text-xs flex-1 inline-flex items-center justify-center gap-1"
                >
                  {actionBusy(q.id, 'email') ? <><Loader2 size={12} className="animate-spin" /> Sending…</> : 'Send Email'}
                </button>
              </div>
            )}
            {q.status === 'sent' && (
              <div className="flex gap-1.5 mt-2">
                <button
                  type="button"
                  aria-label="Accepted"
                  aria-busy={actionBusy(q.id, 'accepted') || undefined}
                  disabled={quoteBusy(q.id)}
                  onClick={() => requestAccept(q)}
                  className="btn-secondary !py-1 !px-2 text-xs flex-1 inline-flex items-center justify-center gap-1 !text-emerald-700"
                >
                  {actionBusy(q.id, 'accepted') ? <><Loader2 size={12} className="animate-spin" /> Saving…</> : <><Check size={12} /> Accepted</>}
                </button>
                <button
                  type="button"
                  aria-label="Declined"
                  aria-busy={actionBusy(q.id, 'declined') || undefined}
                  disabled={quoteBusy(q.id)}
                  onClick={() => decide(q, 'declined')}
                  className="btn-secondary !py-1 !px-2 text-xs flex-1 inline-flex items-center justify-center gap-1 !text-rose-600"
                >
                  {actionBusy(q.id, 'declined') ? <><Loader2 size={12} className="animate-spin" /> Saving…</> : <><X size={12} /> Declined</>}
                </button>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              <button type="button" onClick={() => downloadPdf(q)} className="btn-ghost !py-1 !px-2 text-xs inline-flex items-center gap-1">
                <Download size={12} /> Download PDF
              </button>
              {quoteLockedForEdit(q.status) ? (
                <HoverTooltip text={quoteEditLockedHint(q.status)}>
                  <button
                    type="button"
                    disabled
                    className="btn-ghost !py-1 !px-2 text-xs inline-flex items-center gap-1 pointer-events-none"
                  >
                    <Pencil size={12} /> Edit
                  </button>
                </HoverTooltip>
              ) : (
                <button type="button" onClick={() => onEdit(q)} className="btn-ghost !py-1 !px-2 text-xs inline-flex items-center gap-1">
                  <Pencil size={12} /> Edit
                </button>
              )}
              <button type="button" onClick={() => openClone(q)} className="btn-ghost !py-1 !px-2 text-xs inline-flex items-center gap-1">
                <Copy size={12} /> Clone
              </button>
              <button type="button" onClick={() => setDeleteQuote(q)} className="btn-ghost !py-1 !px-2 text-xs inline-flex items-center gap-1 !text-rose-600 hover:!text-rose-700">
                <Trash2 size={12} /> Delete
              </button>
            </div>
          </div>
        ))}
      </ScrollableLeadList>
      )}

      <Modal
        open={!!cloneQuote}
        onClose={() => !cloning && setCloneQuote(null)}
        title="Clone quote"
        subtitle={cloneQuote ? `Copies ${cloneQuote.ref} as a new draft.` : null}
      >
        {cloneQuote && (
          <form onSubmit={clone} className="space-y-3">
            <div>
              <label className="label" htmlFor="clone-quote-title">Quote title</label>
              <input
                id="clone-quote-title"
                className="input"
                value={cloneTitle}
                onChange={(e) => setCloneTitle(e.target.value)}
                placeholder="e.g. Full re-roof — rear slope"
                required
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" disabled={cloning} onClick={() => setCloneQuote(null)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={cloning || !cloneTitle.trim()}>
                {cloning ? 'Cloning…' : 'Clone quote'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={!!deleteQuote}
        onClose={() => !deleting && setDeleteQuote(null)}
        title="Delete quote"
      >
        <p className="text-sm text-slate-600">
          Delete {deleteQuote?.ref}{deleteQuote?.title ? ` — ${deleteQuote.title}` : ''}? This cannot be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-secondary" disabled={deleting} onClick={() => setDeleteQuote(null)}>Cancel</button>
          <button type="button" className="btn-danger" disabled={deleting} onClick={remove}>
            {deleting ? 'Deleting…' : 'Delete quote'}
          </button>
        </div>
      </Modal>

      <Modal open={!!acceptQuote} onClose={() => !busy && setAcceptQuote(null)} title="Accept quote">
        {acceptQuote && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Tick the optional extras that were accepted. They are not in the quoted total; ticked amounts are added to the job.</p>
            <div className="space-y-2">
              {extras.map((ex, i) => (
                <label key={i} className="flex items-center gap-2 text-sm text-slate-800">
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 accent-brand-500"
                    checked={pickedExtras.includes(i)}
                    onChange={() => toggleExtra(i)}
                  />
                  <span className="flex-1">{ex.description}</span>
                  <span className="font-medium">{money(ex.amount)}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-secondary" disabled={quoteBusy(acceptQuote.id)} onClick={() => setAcceptQuote(null)}>Cancel</button>
              <button type="button" className="btn-primary inline-flex items-center gap-1.5" disabled={quoteBusy(acceptQuote.id)} onClick={() => decide(acceptQuote, 'accepted', pickedExtras)}>
                {actionBusy(acceptQuote.id, 'accepted') ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : 'Confirm acceptance'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function AppointmentsCard({ appts, onReschedule, onCancel, onComplete, completingId }) {
  return (
    <div className="card p-4">
      <h3 id="site-visits-heading" className="font-semibold text-slate-800 mb-3 flex items-center gap-2"><Calendar size={16} /> Site visits</h3>
      {appts.length === 0 && <p className="text-sm text-slate-400">None booked.</p>}
      {appts.length > 0 && (
      <ScrollableLeadList labelledBy="site-visits-heading" count={appts.length} fallbackClass="max-h-[21rem]">
        {appts.map((a) => (
          <div key={a.id} role="listitem" className="border border-slate-100 rounded-lg p-3 text-sm">
            <div className="flex justify-between items-start gap-2">
              <div>
                <span className="font-medium text-slate-800">{fmtDateTime(a.start)}</span>
                <div className="text-xs text-slate-500 mt-0.5">{visitTypeLabel(a.visit_type)}</div>
              </div>
              <StatusBadge status={a.status} />
            </div>
            {a.address && (
              <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                <MapPin size={13} className="shrink-0 text-slate-400" />
                {a.address}
              </div>
            )}
            {a.assignee_name && (
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                <Users size={12} className="shrink-0 text-slate-400" />
                Assigned to {a.assignee_name}
              </div>
            )}
            {a.gcal_status === 'synced' && <div className="text-xs text-emerald-600 mt-1">✓ Synced to Google Calendar</div>}
            {a.status === 'done' && (
              <VisitCompleteRemarks note={a.complete_note} className="mt-2" />
            )}
            {(canChangeVisit(a) || canCompleteVisit(a) || a.status === 'done') && (
              <div className="flex flex-wrap items-center gap-3 mt-2">
                {canChangeVisit(a) && (
                  <>
                    <button type="button" className="btn-secondary text-xs py-1 px-2" onClick={() => onReschedule(a)}>Reschedule</button>
                    <button type="button" className="btn-secondary text-xs py-1 px-2" onClick={() => onCancel(a)}>Cancel</button>
                  </>
                )}
                {(canCompleteVisit(a) || a.status === 'done') && (
                  <VisitCompleteTick
                    done={a.status === 'done'}
                    saving={completingId === a.id}
                    onComplete={() => onComplete(a)}
                  />
                )}
              </div>
            )}
          </div>
        ))}
      </ScrollableLeadList>
      )}
    </div>
  );
}

function CancelVisitModal({ appointment, onClose, onCancelled, onError }) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (appointment) setNote('');
  }, [appointment]);

  const submit = async (e) => {
    e.preventDefault();
    if (!appointment?.id) return;
    setSaving(true);
    try {
      await api.put(`/appointments/${appointment.id}`, {
        status: 'cancelled',
        cancel_note: note.trim(),
      });
      onCancelled();
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={!!appointment} onClose={onClose} title="Cancel visit">
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-slate-500">
          This visit will be marked cancelled. The customer stays in their current pipeline stage.
        </p>
        <div>
          <label className="label" htmlFor="cancel-visit-note">Note (optional)</label>
          <textarea
            id="cancel-visit-note"
            className="input"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why it was cancelled"
          />
        </div>
        <div className="flex gap-2 justify-end">
          <button type="button" className="btn-secondary" onClick={onClose}>Keep visit</button>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Cancelling…' : 'Cancel visit'}</button>
        </div>
      </form>
    </Modal>
  );
}

function JobsCard({ jobs, onOpen }) {
  return (
    <div className="card p-4">
      <h3 id="jobs-heading" className="font-semibold text-slate-800 mb-3 flex items-center gap-2"><Briefcase size={16} /> Jobs</h3>
      {jobs.length === 0 && <p className="text-sm text-slate-400">No jobs yet.</p>}
      {jobs.length > 0 && (
      <ScrollableLeadList labelledBy="jobs-heading" count={jobs.length} fallbackClass="max-h-[13rem]">
        {jobs.map((j) => (
          <div key={j.id} role="listitem" className="border border-slate-100 rounded-lg p-3 text-sm">
            <div className="flex justify-between items-start">
              <button type="button" onClick={() => onOpen(j.id)} className="font-medium text-slate-800 hover:text-brand-600 text-left">{j.title}</button>
              <StatusBadge status={j.status} />
            </div>
            {j.quote_ref && <div className="text-xs text-slate-500 mt-0.5">From {j.quote_ref}</div>}
            {j.value != null && j.value !== '' && (
              <div className="text-sm font-semibold text-slate-900 mt-1">{money(j.value)}</div>
            )}
            {j.start_date && <div className="text-xs text-slate-500 mt-0.5">{fmtDate(j.start_date)}{j.end_date && j.end_date !== j.start_date ? ` – ${fmtDate(j.end_date)}` : ''}</div>}
            {j.crew && <div className="text-xs text-slate-400 mt-0.5">Crew: {j.crew}</div>}
          </div>
        ))}
      </ScrollableLeadList>
      )}
    </div>
  );
}

function InvoicesCard({ invoices, onOpen, onPay, onChanged, show }) {
  const [sendingId, setSendingId] = useState(null);

  const send = async (inv) => {
    setSendingId(inv.id);
    try {
      await api.post(`/invoices/${inv.id}/send`);
      show('Invoice sent & pushed to QuickBooks');
      onChanged();
    } catch (err) { show(err.message, 'error'); }
    finally { setSendingId(null); }
  };
  const downloadPdf = async (inv) => {
    try { await downloadInvoicePdf(inv); }
    catch (err) { show(err.message, 'error'); }
  };

  return (
    <div className="card p-4">
      <h3 id="invoices-heading" className="font-semibold text-slate-800 mb-3 flex items-center gap-2"><Receipt size={16} /> Invoices</h3>
      {invoices.length === 0 && <p className="text-sm text-slate-400">No invoices yet.</p>}
      {invoices.length > 0 && (
      <ScrollableLeadList labelledBy="invoices-heading" count={invoices.length} fallbackClass="max-h-[18rem]">
        {invoices.map((i) => (
          <div key={i.id} role="listitem" className="border border-slate-100 rounded-lg p-3 text-sm">
            <div className="flex justify-between items-start">
              <button type="button" onClick={() => onOpen(i)} className="font-medium text-slate-800 hover:text-brand-600 text-left">{i.ref}</button>
              <StatusBadge status={i.status} />
            </div>
            <div className="text-sm font-semibold text-slate-900 mt-1">{money(i.total)}</div>
            <InvoiceTaxSummary invoice={i} compact />
            <div className="text-xs text-slate-600 mt-1">
              Paid {money(i.amount_paid || 0)} · Outstanding {money(i.outstanding ?? invoiceOutstanding(i))}
            </div>
            {i.vat_treatment === 'reverse_charge' && i.reverse_charge_notice && (
              <p className="text-xs text-amber-800 bg-amber-50 rounded px-2 py-1 mt-1.5">{i.reverse_charge_notice}</p>
            )}
            {i.status !== 'paid' && i.due_date && <div className="text-xs text-slate-500 mt-0.5">Due {fmtDate(i.due_date)}</div>}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {canEmailInvoice(i.status) && (
                <button
                  type="button"
                  aria-label="Send email"
                  aria-busy={sendingId === i.id || undefined}
                  disabled={sendingId === i.id}
                  onClick={() => send(i)}
                  className="btn-secondary !py-1 !px-2 text-xs inline-flex items-center justify-center gap-1"
                >
                  {sendingId === i.id ? <><Loader2 size={12} className="animate-spin" /> Sending…</> : 'Send email'}
                </button>
              )}
              {canRecordPayment(i.status) && (
                <button type="button" onClick={() => onPay(i)} className="btn-secondary !py-1 !px-2 text-xs">Record payment</button>
              )}
              <button type="button" onClick={() => downloadPdf(i)} className="btn-ghost !py-1 !px-2 text-xs inline-flex items-center gap-1">
                <Download size={12} /> Download PDF
              </button>
            </div>
          </div>
        ))}
      </ScrollableLeadList>
      )}
    </div>
  );
}

function groupFollowupsByQuote(followups) {
  const map = new Map();
  for (const f of followups) {
    const key = f.quote_id != null ? String(f.quote_id) : (f.quote_ref || 'unknown');
    if (!map.has(key)) map.set(key, { quote_id: f.quote_id, quote_ref: f.quote_ref, followup_task: f.followup_task || null, steps: [] });
    const g = map.get(key);
    if (!g.followup_task && f.followup_task) g.followup_task = f.followup_task;
    g.steps.push(f);
  }
  return [...map.values()];
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function localDateFromIso(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function localTimeFromIso(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '09:00';
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function isoFromLocal(date, time) {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function FollowupsCard({ followups, onChanged, show }) {
  const [cancelling, setCancelling] = useState(null);
  const [cancellingStep, setCancellingStep] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('09:00');
  const [savingWhen, setSavingWhen] = useState(false);
  const groups = groupFollowupsByQuote(followups);

  function openSchedule(step) {
    setEditing(step);
    setEditDate(localDateFromIso(step.scheduled_at));
    setEditTime(localTimeFromIso(step.scheduled_at));
  }

  async function cancelRemaining(quoteId) {
    setCancelling(quoteId);
    try {
      await api.post(`/quotes/${quoteId}/followups/cancel`);
      show('Remaining follow-ups cancelled');
      onChanged();
    } catch (err) {
      show(err.message, 'error');
    } finally {
      setCancelling(null);
    }
  }

  async function cancelStep(step) {
    if (!step?.quote_id) return;
    setCancellingStep(step.id);
    try {
      await api.post(`/quotes/${step.quote_id}/followups/${step.id}/cancel`);
      show('Follow-up cancelled');
      onChanged();
    } catch (err) {
      show(err.message, 'error');
    } finally {
      setCancellingStep(null);
    }
  }

  async function saveSchedule(e) {
    e.preventDefault();
    if (!editing?.quote_id) return;
    const scheduledAt = isoFromLocal(editDate, editTime);
    if (!scheduledAt) {
      show('Enter a valid date and time', 'error');
      return;
    }
    setSavingWhen(true);
    try {
      await api.put(`/quotes/${editing.quote_id}/followups/${editing.id}`, { scheduled_at: scheduledAt });
      show('Follow-up time updated');
      setEditing(null);
      onChanged();
    } catch (err) {
      show(err.message, 'error');
    } finally {
      setSavingWhen(false);
    }
  }

  return (
    <div className="card p-4">
      <h3 className="font-semibold text-slate-800 mb-3">Automatic follow-ups</h3>
      <div className="space-y-4">
        {groups.map((g) => {
          const pending = g.steps.some((s) => s.status === 'pending');
          return (
            <div key={g.quote_id || g.quote_ref} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-medium text-slate-500">{g.quote_ref || 'Quote'}</span>
                  {g.followup_task?.id && (
                    <Link
                      to={taskHref(g.followup_task)}
                      className="badge bg-sky-50 text-sky-700 hover:bg-sky-100"
                    >
                      Follow-up task
                    </Link>
                  )}
                </span>
                {pending && g.quote_id != null && (
                  <button
                    type="button"
                    disabled={cancelling === g.quote_id}
                    onClick={() => cancelRemaining(g.quote_id)}
                    className="btn-ghost !py-1 !px-2 text-xs"
                  >
                    {cancelling === g.quote_id ? 'Cancelling…' : 'Cancel remaining'}
                  </button>
                )}
              </div>
              {g.steps.map((f) => (
                <div key={f.id} className="flex items-center justify-between text-sm gap-2">
                  <span className="text-slate-600">
                    Step {f.step} · {f.channel}
                    {f.scheduled_at ? ` · ${fmtDateTime(f.scheduled_at)}` : ''}
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    <StatusBadge status={f.status} />
                    {f.status === 'pending' && g.quote_id != null && (
                      <>
                        <HoverTooltip text="Change date">
                          <button
                            type="button"
                            className="btn-ghost !p-1.5"
                            aria-label="Change date"
                            onClick={() => openSchedule(f)}
                          >
                            <Pencil size={14} />
                          </button>
                        </HoverTooltip>
                        <HoverTooltip text="Cancel this follow-up">
                          <button
                            type="button"
                            className="btn-ghost !p-1.5 !text-rose-600 hover:!text-rose-700"
                            aria-label="Cancel this follow-up"
                            disabled={cancellingStep === f.id}
                            onClick={() => cancelStep(f)}
                          >
                            {cancellingStep === f.id ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                          </button>
                        </HoverTooltip>
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <Modal
        open={!!editing}
        onClose={() => !savingWhen && setEditing(null)}
        title="Change follow-up time"
        subtitle={editing ? `Step ${editing.step} · ${editing.channel}` : null}
      >
        {editing && (
          <form onSubmit={saveSchedule} className="space-y-3">
            <DatePicker
              id="followup-edit-date"
              label="Date"
              value={editDate}
              onChange={setEditDate}
              required
            />
            <div>
              <label className="label" htmlFor="followup-edit-time">Time</label>
              <input
                id="followup-edit-time"
                className="input"
                type="time"
                value={editTime}
                onChange={(e) => setEditTime(e.target.value)}
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" disabled={savingWhen} onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={savingWhen || !editDate || !editTime}>
                {savingWhen ? 'Saving…' : 'Save time'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
