import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Users } from 'lucide-react';
import { api, money, fmtTimeAgo } from '../lib/api';
import { PageLoading, EmptyState, useToast, Toast } from '../components/ui.jsx';
import NewCustomerModal from '../components/NewCustomerModal.jsx';
import SelectMenu from '../components/SelectMenu.jsx';
import DatePicker from '../components/DatePicker.jsx';
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
  const { toast, show } = useToast();

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
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Customers</h1>
          <p className="text-slate-500 text-sm mt-0.5">Every customer record — domestic and commercial — in one list.</p>
        </div>
        <button className="btn-primary shrink-0" onClick={() => setCreateOpen(true)}><Plus size={16} /> New customer</button>
      </div>

      <div className="card p-3">
        <div className="flex w-full items-center justify-between gap-4">
          <div className="flex h-10 shrink-0 items-center gap-1 rounded-lg bg-slate-100 p-1">
            {TYPE_FILTERS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setType(s.value)}
                className={`h-full rounded-md px-3 text-sm font-medium ${type === s.value ? 'bg-navy-900 text-white' : 'text-slate-500 hover:bg-white'}`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex min-w-0 items-center justify-end gap-2 overflow-x-auto">
            <div className="relative w-40 shrink-0">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                className="input !pl-9 w-full"
                placeholder="Search…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Search customers"
              />
            </div>
            <SelectMenu
              className="w-40 shrink-0"
              label="Filter by source"
              value={source}
              onChange={setSource}
              options={SOURCE_FILTERS}
            />
            <div className="flex shrink-0 items-center gap-2">
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
          </div>
        </div>
      </div>

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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <NewCustomerModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <Toast {...toast} />
    </div>
  );
}
