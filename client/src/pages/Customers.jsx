import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Plus, Trash2, Users } from 'lucide-react';
import { api, money, fmtTimeAgo } from '../lib/api';
import { PageLoading, EmptyState, ConfirmModal, useToast, Toast } from '../components/ui.jsx';
import NewCustomerModal from '../components/NewCustomerModal.jsx';
import ListFilterBar from '../components/ListFilterBar.jsx';
import { leadSourceLabel } from '../lib/leads.js';

const TYPE_FILTERS = [
  { value: 'ALL', label: 'All' },
  { value: 'domestic', label: 'Domestic' },
  { value: 'commercial', label: 'Commercial' },
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

const SOURCE_BADGE = {
  whatsapp: 'bg-green-50 text-green-700',
  facebook: 'bg-blue-50 text-blue-700',
  facebook_lead: 'bg-blue-50 text-blue-700',
  email: 'bg-purple-50 text-purple-700',
  phone: 'bg-amber-50 text-amber-700',
  sms: 'bg-pink-50 text-pink-700',
  manual: 'bg-slate-100 text-slate-600',
};

function siteLine(c) {
  return [c.address, c.postcode].filter(Boolean).join(', ') || '—';
}

export default function Customers() {
  const [type, setType] = useState('ALL');
  const [q, setQ] = useState('');
  const [source, setSource] = useState('ALL');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [data, setData] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteWarning, setDeleteWarning] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const { toast, show } = useToast();

  const openDelete = async (customer) => {
    try {
      const preview = await api.get(`/customers/${customer.id}/delete-preview`);
      setDeleteWarning(preview.warning || 'Are you sure you want to delete this customer?');
      setDeleteTarget(customer);
    } catch (err) {
      show(err.message, 'error');
    }
  };

  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams();
      if (q.trim()) params.set('q', q.trim());
      if (type !== 'ALL') params.set('customer_type', type);
      if (source !== 'ALL') params.set('source', source);
      if (createdFrom) params.set('created_from', createdFrom);
      if (createdTo) params.set('created_to', createdTo);
      const qs = params.toString();
      api.get(`/customers${qs ? `?${qs}` : ''}`)
        .then((d) => setData(d.customers || []))
        .catch((err) => {
          show(err.message || 'Could not load customers', 'error');
          setData([]);
        });
    }, 200);
    return () => clearTimeout(t);
  }, [q, type, source, createdFrom, createdTo]);

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between gap-3">
          <h1 className="min-w-0 text-2xl font-bold text-slate-900">Customers</h1>
          <button type="button" className="btn-primary shrink-0" onClick={() => setCreateOpen(true)}>
            <Plus size={16} /> New customer
          </button>
        </div>
        <p className="mt-0.5 text-sm text-slate-500">Every customer record — domestic and commercial — in one list.</p>
      </div>

      <ListFilterBar
        tabs={TYPE_FILTERS}
        value={type}
        onChange={setType}
        searchValue={q}
        onSearchChange={setQ}
        searchLabel="Search customers"
        select={{
          label: 'Filter by source',
          value: source,
          onChange: setSource,
          options: SOURCE_FILTERS,
        }}
        from={createdFrom}
        to={createdTo}
        onFromChange={setCreatedFrom}
        onToChange={setCreatedTo}
      />

      {!data ? <PageLoading /> : data.length === 0 ? (
        <EmptyState icon={Users} title="No customers found" detail="Try a different search, or add a new customer." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] table-fixed text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium whitespace-nowrap w-[18%]">Customer</th>
                  <th className="text-left px-4 py-2.5 font-medium whitespace-nowrap w-[11%]">Type</th>
                  <th className="text-left px-4 py-2.5 font-medium whitespace-nowrap w-[16%]">Phone</th>
                  <th className="text-left px-4 py-2.5 font-medium whitespace-nowrap w-[20%]">Email</th>
                  <th className="text-left px-4 py-2.5 font-medium whitespace-nowrap w-[16%]">Site</th>
                  <th className="text-left px-4 py-2.5 font-medium whitespace-nowrap w-[12%]">Source</th>
                  <th className="text-right px-4 py-2.5 font-medium whitespace-nowrap w-[9%]">Quoted</th>
                  <th className="text-left px-4 py-2.5 font-medium whitespace-nowrap w-[8%]">Updated</th>
                  <th className="text-right px-4 py-2.5 font-medium whitespace-nowrap w-[8%]"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {data.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 align-middle">
                      <Link to={`/customers/${c.id}`} className="font-medium text-slate-800 hover:text-brand-600 block truncate" title={c.name}>
                        {c.name}
                      </Link>
                      {c.customer_type === 'commercial' && c.company_name && (
                        <div className="text-xs text-slate-400 mt-0.5 truncate">{c.company_name}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-middle whitespace-nowrap">
                      <span className={`badge ${c.customer_type === 'commercial' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-700'}`}>
                        {c.customer_type === 'commercial' ? 'Commercial' : 'Domestic'}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-middle text-slate-600 whitespace-nowrap">{c.phone || '—'}</td>
                    <td className="px-4 py-3 align-middle text-slate-600 truncate" title={c.email || ''}>{c.email || '—'}</td>
                    <td className="px-4 py-3 align-middle text-slate-500 truncate" title={siteLine(c)}>{siteLine(c)}</td>
                    <td className="px-4 py-3 align-middle whitespace-nowrap">
                      {c.source ? (
                        <span className={`badge ${SOURCE_BADGE[c.source] || 'bg-slate-100 text-slate-600'}`}>
                          {leadSourceLabel(c.source)}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 align-middle text-right font-medium text-slate-800 whitespace-nowrap tabular-nums">
                      {Number(c.quoted_value) > 0 ? money(c.quoted_value) : '—'}
                    </td>
                    <td className="px-4 py-3 align-middle text-slate-400 whitespace-nowrap">{fmtTimeAgo(c.updated_at)}</td>
                    <td className="px-4 py-3 align-middle text-right">
                      <div className="inline-flex items-center justify-end gap-0.5">
                        <Link
                          to={`/customers/${c.id}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-navy-900"
                          aria-label={`Edit ${c.name}`}
                        >
                          <Pencil size={15} />
                        </Link>
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                          aria-label={`Delete ${c.name}`}
                          onClick={() => openDelete(c)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <NewCustomerModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <ConfirmModal
        open={!!deleteTarget}
        title="Delete customer"
        message={deleteWarning}
        confirmLabel="Delete customer"
        danger
        busy={deleteBusy}
        busyLabel="Deleting…"
        onCancel={() => { if (!deleteBusy) setDeleteTarget(null); }}
        onConfirm={async () => {
          if (!deleteTarget) return;
          setDeleteBusy(true);
          try {
            await api.del(`/customers/${deleteTarget.id}`);
            setData((rows) => (rows || []).filter((row) => row.id !== deleteTarget.id));
            setDeleteTarget(null);
            show('Customer deleted');
          } catch (err) {
            show(err.message, 'error');
          } finally {
            setDeleteBusy(false);
          }
        }}
      />
      <Toast {...toast} />
    </div>
  );
}
