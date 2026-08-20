import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Phone, Mail, MapPin, Send, Calendar, FileText, Briefcase, Receipt,
  MessageCircle, StickyNote, Check, X, ChevronDown, Clock,
} from 'lucide-react';
import { api, money, fmtDate, fmtDateTime, fmtTimeAgo } from '../lib/api';
import { PageLoading, StageBadge, StatusBadge, Modal, useToast, Toast } from '../components/ui.jsx';
import QuoteBuilder from '../components/QuoteBuilder.jsx';
import BookVisit from '../components/BookVisit.jsx';

const STAGE_FLOW = ['ENQUIRY', 'SITE_VISIT_BOOKED', 'QUOTE_PENDING', 'QUOTED', 'FOLLOW_UP', 'WON', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'INVOICED', 'PAID', 'LOST'];

export default function CustomerDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [quoteModal, setQuoteModal] = useState(null); // null | true | quote object
  const [visitModal, setVisitModal] = useState(false);
  const { toast, show } = useToast();

  const load = useCallback(() => api.get(`/customers/${id}`).then(setData), [id]);
  useEffect(() => { load(); }, [load]);

  if (!data) return <PageLoading />;
  const { customer } = data;

  const timeline = [
    ...data.messages.map((m) => ({ ...m, _t: 'message', _at: m.created_at })),
    ...data.activity.map((a) => ({ ...a, _t: 'activity', _at: a.created_at })),
  ].sort((a, b) => new Date(a._at) - new Date(b._at));

  const changeStage = async (stage) => {
    try { await api.put(`/customers/${id}/stage`, { stage }); show(`Moved to ${stage.replace('_', ' ')}`); load(); }
    catch (err) { show(err.message, 'error'); }
  };

  return (
    <div className="space-y-5">
      <Link to="/pipeline" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft size={15} /> Back to pipeline</Link>

      <div className="card p-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900">{customer.name}</h1>
              <StageDropdown stage={customer.stage} onChange={changeStage} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-slate-500">
              {customer.phone && <span className="flex items-center gap-1.5"><Phone size={13} /> {customer.phone}</span>}
              {customer.email && <span className="flex items-center gap-1.5"><Mail size={13} /> {customer.email}</span>}
              {customer.address && <span className="flex items-center gap-1.5"><MapPin size={13} /> {customer.address}{customer.postcode ? `, ${customer.postcode}` : ''}</span>}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button className="btn-secondary" onClick={() => setVisitModal(true)}><Calendar size={15} /> Book visit</button>
            <button className="btn-primary" onClick={() => setQuoteModal(true)}><FileText size={15} /> New quote</button>
          </div>
        </div>
        {customer.lost_reason && <div className="mt-3 text-sm bg-rose-50 text-rose-700 rounded-lg px-3 py-2">Lost: {customer.lost_reason}</div>}
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-5">
            <h3 className="font-semibold text-slate-800 mb-4">Conversation & activity</h3>
            <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
              {timeline.length === 0 && <p className="text-sm text-slate-400">No activity yet.</p>}
              {timeline.map((item, i) => item._t === 'message' ? <MessageBubble key={`m${item.id}`} m={item} /> : <ActivityLine key={`a${item.id}`} a={item} />)}
            </div>
            <Composer customerId={id} onSent={() => { load(); show('Message sent'); }} onError={(e) => show(e, 'error')} />
          </div>
        </div>

        <div className="space-y-4">
          <QuotesCard quotes={data.quotes} onEdit={(q) => setQuoteModal(q)} onChanged={load} show={show} />
          <AppointmentsCard appts={data.appointments} />
          <JobsCard jobs={data.jobs} />
          <InvoicesCard invoices={data.invoices} />
          {data.followups.length > 0 && <FollowupsCard followups={data.followups} />}
        </div>
      </div>

      <QuoteBuilder
        open={!!quoteModal}
        onClose={() => setQuoteModal(null)}
        customerId={id}
        customer={customer}
        existingQuote={quoteModal && quoteModal !== true ? quoteModal : null}
        onSaved={() => { setQuoteModal(null); load(); show('Quote saved'); }}
      />
      <BookVisit open={visitModal} onClose={() => setVisitModal(false)} customer={customer} onSaved={() => { setVisitModal(false); load(); show('Visit booked'); }} />
      <Toast {...toast} />
    </div>
  );
}

function StageDropdown({ stage, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1">
        <StageBadge stage={stage} label={stage.replace(/_/g, ' ')} />
        <ChevronDown size={13} className="text-slate-400" />
      </button>
      {open && (
        <div className="absolute z-10 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 w-48 max-h-72 overflow-y-auto">
          {STAGE_FLOW.map((s) => (
            <button key={s} onClick={() => { onChange(s); setOpen(false); }} className={`block w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 ${s === stage ? 'font-semibold text-brand-600' : 'text-slate-600'}`}>
              {s.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ m }) {
  const out = m.direction === 'out';
  const icons = { whatsapp: MessageCircle, email: Mail, facebook: MessageCircle, note: StickyNote, phone: Phone, sms: Phone };
  const Icon = icons[m.channel] || StickyNote;
  return (
    <div className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm ${out ? 'bg-navy-900 text-white' : 'bg-slate-100 text-slate-800'}`}>
        <div className="flex items-center gap-1.5 text-[11px] mb-1 opacity-70">
          <Icon size={11} /> <span className="capitalize">{m.channel}</span>
          {m.status === 'simulated' && <span className="opacity-80">(simulated)</span>}
          <span>· {fmtDateTime(m.created_at)}</span>
        </div>
        <div className="whitespace-pre-wrap break-words">{m.body}</div>
      </div>
    </div>
  );
}

function ActivityLine({ a }) {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-400 py-0.5">
      <Clock size={11} className="flex-shrink-0" />
      <span>{a.detail}</span>
      <span className="ml-auto flex-shrink-0">{fmtTimeAgo(a.created_at)}</span>
    </div>
  );
}

function Composer({ customerId, onSent, onError }) {
  const [channel, setChannel] = useState('whatsapp');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

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
        {['whatsapp', 'email', 'note'].map((c) => (
          <button key={c} onClick={() => setChannel(c)} className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize ${channel === c ? 'bg-navy-900 text-white' : 'bg-slate-100 text-slate-500'}`}>{c}</button>
        ))}
      </div>
      <div className="flex gap-2">
        <textarea className="input flex-1 !py-2" rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder={channel === 'note' ? 'Add an internal note…' : `Write a ${channel} message…`} />
        <button onClick={send} disabled={sending || !body.trim()} className="btn-primary self-end"><Send size={15} /></button>
      </div>
    </div>
  );
}

function QuotesCard({ quotes, onEdit, onChanged, show }) {
  const send = async (q, channels) => {
    try { await api.post(`/quotes/${q.id}/send`, { channels }); show('Quote sent'); onChanged(); }
    catch (err) { show(err.message, 'error'); }
  };
  const decide = async (q, decision) => {
    try { await api.post(`/quotes/${q.id}/decision`, { decision }); show(`Quote marked ${decision}`); onChanged(); }
    catch (err) { show(err.message, 'error'); }
  };
  return (
    <div className="card p-4">
      <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2"><FileText size={16} /> Quotes</h3>
      {quotes.length === 0 && <p className="text-sm text-slate-400">No quotes yet.</p>}
      <div className="space-y-2">
        {quotes.map((q) => (
          <div key={q.id} className="border border-slate-100 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <button onClick={() => onEdit(q)} className="font-medium text-sm text-slate-800 hover:text-brand-600 text-left">{q.ref}</button>
              <StatusBadge status={q.status} />
            </div>
            <div className="text-xs text-slate-500 mt-0.5">{q.title}</div>
            <div className="text-sm font-semibold text-slate-900 mt-1">{money(q.total)}</div>
            {q.status === 'draft' && (
              <div className="flex gap-1.5 mt-2">
                <button onClick={() => send(q, ['whatsapp'])} className="btn-secondary !py-1 !px-2 text-xs flex-1">Send WhatsApp</button>
                <button onClick={() => send(q, ['email'])} className="btn-secondary !py-1 !px-2 text-xs flex-1">Send Email</button>
              </div>
            )}
            {q.status === 'sent' && (
              <div className="flex gap-1.5 mt-2">
                <button onClick={() => decide(q, 'accepted')} className="btn-secondary !py-1 !px-2 text-xs flex-1 !text-emerald-700"><Check size={12} /> Accepted</button>
                <button onClick={() => decide(q, 'declined')} className="btn-secondary !py-1 !px-2 text-xs flex-1 !text-rose-600"><X size={12} /> Declined</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AppointmentsCard({ appts }) {
  return (
    <div className="card p-4">
      <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2"><Calendar size={16} /> Site visits</h3>
      {appts.length === 0 && <p className="text-sm text-slate-400">None booked.</p>}
      <div className="space-y-2">
        {appts.map((a) => (
          <div key={a.id} className="border border-slate-100 rounded-lg p-3 text-sm">
            <div className="flex justify-between items-start">
              <span className="font-medium text-slate-800">{fmtDateTime(a.start)}</span>
              <StatusBadge status={a.status} />
            </div>
            <div className="text-xs text-slate-500 mt-0.5">{a.address}</div>
            {a.gcal_status === 'synced' && <div className="text-xs text-emerald-600 mt-1">✓ Synced to Google Calendar</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function JobsCard({ jobs }) {
  return (
    <div className="card p-4">
      <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2"><Briefcase size={16} /> Jobs</h3>
      {jobs.length === 0 && <p className="text-sm text-slate-400">No jobs yet.</p>}
      <div className="space-y-2">
        {jobs.map((j) => (
          <div key={j.id} className="border border-slate-100 rounded-lg p-3 text-sm">
            <div className="flex justify-between items-start">
              <span className="font-medium text-slate-800">{j.title}</span>
              <StatusBadge status={j.status} />
            </div>
            {j.start_date && <div className="text-xs text-slate-500 mt-0.5">{fmtDate(j.start_date)}{j.end_date && j.end_date !== j.start_date ? ` – ${fmtDate(j.end_date)}` : ''}</div>}
            {j.crew && <div className="text-xs text-slate-400 mt-0.5">Crew: {j.crew}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function InvoicesCard({ invoices }) {
  return (
    <div className="card p-4">
      <h3 className="font-semibold text-slate-800 mb-3 flex items-center gap-2"><Receipt size={16} /> Invoices</h3>
      {invoices.length === 0 && <p className="text-sm text-slate-400">No invoices yet.</p>}
      <div className="space-y-2">
        {invoices.map((i) => (
          <div key={i.id} className="border border-slate-100 rounded-lg p-3 text-sm">
            <div className="flex justify-between items-start">
              <span className="font-medium text-slate-800">{i.ref}</span>
              <StatusBadge status={i.status} />
            </div>
            <div className="text-sm font-semibold text-slate-900 mt-1">{money(i.total)}</div>
            {i.status !== 'paid' && i.due_date && <div className="text-xs text-slate-500 mt-0.5">Due {fmtDate(i.due_date)}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function FollowupsCard({ followups }) {
  return (
    <div className="card p-4">
      <h3 className="font-semibold text-slate-800 mb-3">Automatic follow-ups</h3>
      <div className="space-y-2">
        {followups.map((f) => (
          <div key={f.id} className="flex items-center justify-between text-sm">
            <span className="text-slate-600">Step {f.step} · {f.channel} · {f.quote_ref}</span>
            <StatusBadge status={f.status} />
          </div>
        ))}
      </div>
    </div>
  );
}
