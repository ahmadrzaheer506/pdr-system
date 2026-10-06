import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mail, Plus, Inbox as InboxIcon, CheckCircle2, BadgeCheck, Archive, Layers, Search } from 'lucide-react';
import DuplicateCustomerNotice from '../components/DuplicateCustomerNotice.jsx';
import BookVisit from '../components/BookVisit.jsx';
import LeadCard from '../components/LeadCard.jsx';
import { api } from '../lib/api';
import { duplicateFromError } from '../lib/duplicates';
import { PageLoading, Modal, useToast, Toast } from '../components/ui.jsx';
import SelectMenu from '../components/SelectMenu.jsx';
import SearchSelect from '../components/SearchSelect.jsx';
import DatePicker from '../components/DatePicker.jsx';
import ContactPickers from '../components/ContactPickers.jsx';
import CustomerCreateFields, { EMPTY_CUSTOMER_FORM } from '../components/CustomerCreateFields.jsx';
import { contactsFromSingleOptions, emailFormatError } from '../lib/contacts';

const INBOX_TABS = [
  {
    id: 'NEW',
    label: 'New',
    Icon: InboxIcon,
    rail: 'bg-amber-400',
    iconWrap: 'bg-amber-100 text-amber-700',
    active: 'bg-amber-50 ring-2 ring-amber-400/80',
    idle: 'bg-white hover:bg-amber-50/50',
  },
  {
    id: 'ACTIONED',
    label: 'Actioned',
    Icon: CheckCircle2,
    rail: 'bg-sky-400',
    iconWrap: 'bg-sky-100 text-sky-700',
    active: 'bg-sky-50 ring-2 ring-sky-400/80',
    idle: 'bg-white hover:bg-sky-50/50',
  },
  {
    id: 'CONVERTED',
    label: 'Won',
    Icon: BadgeCheck,
    rail: 'bg-emerald-400',
    iconWrap: 'bg-emerald-100 text-emerald-700',
    active: 'bg-emerald-50 ring-2 ring-emerald-400/80',
    idle: 'bg-white hover:bg-emerald-50/50',
  },
  {
    id: 'CLOSED',
    label: 'Lost',
    Icon: Archive,
    rail: 'bg-slate-400',
    iconWrap: 'bg-slate-100 text-slate-600',
    active: 'bg-slate-100 ring-2 ring-slate-400/70',
    idle: 'bg-white hover:bg-slate-50',
  },
  {
    id: 'ALL',
    label: 'All',
    Icon: Layers,
    rail: 'bg-indigo-400',
    iconWrap: 'bg-indigo-100 text-indigo-700',
    active: 'bg-indigo-50 ring-2 ring-indigo-400/80',
    idle: 'bg-white hover:bg-indigo-50/50',
  },
];

const SOURCE_FILTERS = [
  { value: 'ALL', label: 'All sources' },
  { value: 'manual', label: 'Manual' },
  { value: 'phone', label: 'Phone' },
  { value: 'email', label: 'Email' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'facebook_lead', label: 'Facebook lead' },
  { value: 'sms', label: 'SMS' },
];

export default function Inbox() {
  const [status, setStatus] = useState('NEW');
  const [q, setQ] = useState('');
  const [source, setSource] = useState('ALL');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [data, setData] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [visitTarget, setVisitTarget] = useState(null);
  const { toast, show } = useToast();

  const fetchLeads = useCallback(() => {
    const params = new URLSearchParams();
    params.set('status', status);
    if (q.trim()) params.set('q', q.trim());
    if (source !== 'ALL') params.set('source', source);
    if (createdFrom) params.set('created_from', createdFrom);
    if (createdTo) params.set('created_to', createdTo);
    return api.get(`/leads?${params.toString()}`).then(setData).catch((err) => {
      show(err.message, 'error');
      setData((current) => current || { leads: [], counts: {} });
    });
  }, [status, q, source, createdFrom, createdTo, show, reloadToken]);

  useEffect(() => {
    const t = setTimeout(() => { fetchLeads(); }, 200);
    return () => clearTimeout(t);
  }, [fetchLeads]);

  const markActioned = async (id) => {
    try {
      await api.put(`/leads/${id}`, { status: 'ACTIONED' });
      fetchLeads();
    } catch (err) {
      show(err.message, 'error');
    }
  };

  const clearFilters = () => {
    setQ('');
    setSource('ALL');
    setCreatedFrom('');
    setCreatedTo('');
  };

  const filtered = Boolean(q.trim() || source !== 'ALL' || createdFrom || createdTo);

  if (!data) return <PageLoading />;

  const counts = { NEW: 0, ACTIONED: 0, CONVERTED: 0, CLOSED: 0, ...data.counts };
  if (data.counts?.ALL == null) {
    counts.ALL = counts.NEW + counts.ACTIONED + counts.CONVERTED + counts.CLOSED;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[1.7rem] font-semibold tracking-tight text-slate-900">Lead Inbox</h1>
          <p className="text-slate-500 text-sm mt-1">Every enquiry, whatever channel it came from — one place, nothing missed.</p>
        </div>
        <button className="btn-primary" onClick={() => setAddOpen(true)}><Plus size={16} /> Log enquiry</button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
        {INBOX_TABS.map(({ id, label, Icon, rail, iconWrap, active, idle }) => {
          const selected = status === id;
          const count = counts[id] ?? 0;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setStatus(id)}
              aria-pressed={selected}
              className={`relative overflow-hidden rounded-2xl px-4 py-3.5 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 transition sm:flex-1 sm:min-w-[7.5rem] ${
                id === 'ALL' ? 'col-span-2 sm:col-auto' : ''
              } ${selected ? active : `${idle} ring-slate-200/70 hover:ring-slate-300`}`}
            >
              <span className={`absolute inset-x-0 top-0 h-0.5 ${rail}`} aria-hidden="true" />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className={`text-2xl font-semibold tabular-nums tracking-tight ${count === 0 && !selected ? 'text-slate-400' : 'text-slate-900'}`}>
                    {count}
                  </div>
                  <div className="mt-0.5 text-xs font-medium text-slate-500">{label}</div>
                </div>
                <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${iconWrap}`}>
                  <Icon size={15} strokeWidth={2} />
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="card p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative min-w-[16rem] flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              className="input !pl-9 w-full"
              placeholder="Search…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search leads"
            />
          </div>
          <SelectMenu
            className="w-40"
            label="Filter by source"
            value={source}
            onChange={setSource}
            options={SOURCE_FILTERS}
          />
          <div className="flex items-center gap-2">
            <DatePicker
              className="w-[10.5rem]"
              label="Created from"
              value={createdFrom}
              onChange={setCreatedFrom}
              placeholder="From"
            />
            <span className="text-xs text-slate-400">to</span>
            <DatePicker
              className="w-[10.5rem]"
              label="Created to"
              value={createdTo}
              onChange={setCreatedTo}
              placeholder="To"
            />
          </div>
          {filtered ? (
            <button type="button" className="text-xs font-medium text-brand-600 hover:text-brand-700" onClick={clearFilters}>
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      {data.leads.length === 0 ? (
        <InboxEmpty filtered={filtered} />
      ) : (
        <div className="space-y-3">
          {data.leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              from="inbox"
              onBookVisit={(row) => setVisitTarget({ customerId: row.customer_id, leadId: row.id })}
              onMarkActioned={(row) => markActioned(row.id)}
            />
          ))}
        </div>
      )}

      <AddLeadModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={() => {
          setAddOpen(false);
          setStatus('NEW');
          setQ('');
          setSource('ALL');
          setCreatedFrom('');
          setCreatedTo('');
          setReloadToken((n) => n + 1);
          show('Enquiry added');
        }}
        onError={(msg) => show(msg, 'error')}
      />
      <BookVisit
        open={visitTarget != null}
        customerId={visitTarget?.customerId}
        leadId={visitTarget?.leadId}
        onClose={() => setVisitTarget(null)}
        onSaved={() => {
          setVisitTarget(null);
          fetchLeads();
          show('Visit booked');
        }}
      />
      <Toast {...toast} />
    </div>
  );
}

const CUSTOMER_MODES = [
  { id: 'existing', label: 'Existing customer' },
  { id: 'new', label: 'New customer' },
];

function InboxEmpty({ filtered }) {
  return (
    <div className="flex min-h-[18rem] flex-col items-center justify-center rounded-2xl bg-white px-6 py-14 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-slate-200/80">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 ring-1 ring-slate-200/70">
        <Mail size={22} />
      </div>
      <h2 className="mt-4 text-[15px] font-semibold text-slate-800">
        {filtered ? 'No matching leads' : 'No leads here'}
      </h2>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-500">
        {filtered
          ? 'Try a different search, source, or date range.'
          : 'New enquiries from WhatsApp, Facebook, email, phone or manual entry will land in this inbox automatically.'}
      </p>
    </div>
  );
}

function customerOptionLabel(c) {
  if (c.company_name) return `${c.name} · ${c.company_name}`;
  return c.name;
}

function customerOptionHint(c) {
  return [c.phone, c.email, c.address].filter(Boolean).join(' · ');
}

const EMPTY_ENQUIRY = {
  source: 'manual',
  message: '',
  ...EMPTY_CUSTOMER_FORM,
};

function AddLeadModal({ open, onClose, onSaved, onError }) {
  const [mode, setMode] = useState('existing');
  const [form, setForm] = useState(EMPTY_ENQUIRY);
  const [customers, setCustomers] = useState([]);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [record, setRecord] = useState(null);
  const [picks, setPicks] = useState({ site_id: '', phone_id: '', email_id: '' });
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [loadingRecord, setLoadingRecord] = useState(false);
  const [saving, setSaving] = useState(false);
  const [duplicate, setDuplicate] = useState(null);
  const [error, setError] = useState('');
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    if (!open) return;
    setMode('existing');
    setForm(EMPTY_ENQUIRY);
    setCustomerId('');
    setCustomerQuery('');
    setCustomers([]);
    setRecord(null);
    setPicks({ site_id: '', phone_id: '', email_id: '' });
    setLoadingRecord(false);
    setSaving(false);
    setDuplicate(null);
    setError('');
  }, [open]);

  useEffect(() => {
    if (!open || mode !== 'existing') return undefined;
    let cancelled = false;
    const q = customerQuery.trim();
    const timer = setTimeout(() => {
      setLoadingCustomers(true);
      const path = q ? `/customers?q=${encodeURIComponent(q)}` : '/customers';
      api.get(path)
        .then((d) => {
          if (!cancelled) setCustomers(d.customers || []);
        })
        .catch((err) => {
          if (!cancelled) {
            setCustomers([]);
            onErrorRef.current(err.message);
          }
        })
        .finally(() => {
          if (!cancelled) setLoadingCustomers(false);
        });
    }, q ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, mode, customerQuery]);

  useEffect(() => {
    if (!open) return undefined;
    if (mode !== 'existing' || !customerId) {
      setRecord(null);
      setPicks({ site_id: '', phone_id: '', email_id: '' });
      setLoadingRecord(false);
      return undefined;
    }
    let cancelled = false;
    setLoadingRecord(true);
    api.get(`/customers/${customerId}`)
      .then((d) => {
        if (cancelled) return;
        const customer = d.customer || null;
        setRecord(customer);
        setPicks(contactsFromSingleOptions(customer));
      })
      .catch((err) => {
        if (cancelled) return;
        setRecord(null);
        setPicks({ site_id: '', phone_id: '', email_id: '' });
        onErrorRef.current(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingRecord(false);
      });
    return () => {
      cancelled = true;
      setLoadingRecord(false);
    };
  }, [open, mode, customerId]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setDuplicate(null);
    setError('');
    try {
      if (mode === 'existing') {
        if (!customerId) {
          const message = 'Pick a customer';
          setError(message);
          onError(message);
          return;
        }
        const payload = {
          source: form.source,
          customer_id: Number(customerId),
          site_id: picks.site_id || null,
          phone_id: picks.phone_id || null,
          email_id: picks.email_id || null,
          message: form.message,
        };
        await api.post('/leads', payload);
      } else {
        if (form.customer_type === 'commercial' && !form.company_name.trim()) {
          const message = 'Company name is required for commercial customers';
          setError(message);
          onError(message);
          return;
        }
        const emailErr = emailFormatError(form.email);
        if (emailErr) {
          setError(emailErr);
          onError(emailErr);
          return;
        }
        await api.post('/leads', {
          source: form.source,
          name: form.name,
          phone: form.phone,
          phone_type: form.phone_type,
          email: form.email,
          email_type: form.email_type,
          address: form.address,
          customer_type: form.customer_type,
          company_name: form.company_name,
          vat_number: form.vat_number,
          message: form.message,
        });
      }
      setForm(EMPTY_ENQUIRY);
      onSaved();
    } catch (err) {
      const dup = duplicateFromError(err);
      if (dup) setDuplicate(dup);
      const message = err.message || 'Could not add this enquiry';
      if (!dup) setError(message);
      onError(message);
    } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Log an enquiry" size="xl">
      <form onSubmit={submit} className="space-y-3" noValidate>
        <DuplicateCustomerNotice duplicate={duplicate} />
        {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}
        <div>
          <label className="label" htmlFor="log-enquiry-source">Came in via</label>
          <SelectMenu
            id="log-enquiry-source"
            label="Came in via"
            value={form.source}
            onChange={(source) => setForm({ ...form, source })}
            options={[
              { value: 'manual', label: 'Logged manually' },
              { value: 'phone', label: 'Phone' },
              { value: 'email', label: 'Email' },
              { value: 'sms', label: 'SMS' },
              { value: 'whatsapp', label: 'WhatsApp' },
              { value: 'facebook', label: 'Facebook' },
            ]}
          />
        </div>
        <div>
          <div className="label" id="log-enquiry-customer-mode">Customer</div>
          <div
            className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 w-fit"
            role="radiogroup"
            aria-labelledby="log-enquiry-customer-mode"
          >
            {CUSTOMER_MODES.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="radio"
                aria-checked={mode === tab.id}
                onClick={() => setMode(tab.id)}
                className={`px-3 py-1.5 text-sm rounded-md font-medium ${
                  mode === tab.id ? 'bg-navy-900 text-white' : 'text-slate-500 hover:bg-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        {mode === 'existing' ? (
          <>
            <div>
              <label className="label" htmlFor="log-enquiry-customer">Search customer</label>
              <SearchSelect
                id="log-enquiry-customer"
                label="Search customer"
                query={customerQuery}
                onQueryChange={setCustomerQuery}
                value={customerId}
                required
                invalid={error === 'Pick a customer'}
                placeholder="Search name, phone or email"
                loading={loadingCustomers}
                emptyText="No customers found"
                onChange={(next) => { setCustomerId(next); setError(''); }}
                options={customers.map((c) => ({
                  value: String(c.id),
                  label: customerOptionLabel(c),
                  hint: customerOptionHint(c),
                }))}
              />
            </div>
            {loadingRecord && <p className="text-sm text-slate-500">Loading contacts…</p>}
            {record && (
              <ContactPickers
                customer={record}
                value={picks}
                onChange={setPicks}
                idPrefix="log-enquiry"
                emptyLabel="Select…"
                onError={onError}
              />
            )}
          </>
        ) : (
          <CustomerCreateFields form={form} onChange={setForm} idPrefix="log-enquiry" />
        )}
        <div>
          <label className="label" htmlFor="log-enquiry-message">What do they need?</label>
          <textarea id="log-enquiry-message" className="input" rows={3} value={form.message} onChange={set('message')} />
        </div>
        <button className="btn-primary w-full" disabled={saving || loadingRecord}>{saving ? 'Saving…' : 'Add to inbox'}</button>
      </form>
    </Modal>
  );
}
