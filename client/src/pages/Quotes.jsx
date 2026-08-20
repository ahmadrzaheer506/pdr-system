import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { api, money, fmtDate } from '../lib/api';
import { PageLoading, StatusBadge, EmptyState } from '../components/ui.jsx';
import { FileText } from 'lucide-react';

const FILTERS = ['ALL', 'draft', 'sent', 'accepted', 'declined', 'expired'];

export default function Quotes() {
  const [status, setStatus] = useState('ALL');
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      api.get(`/quotes?status=${status}${q ? `&q=${encodeURIComponent(q)}` : ''}`).then((d) => setData(d.quotes));
    }, 200);
    return () => clearTimeout(t);
  }, [status, q]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Quotes</h1>
        <p className="text-slate-500 text-sm mt-0.5">Every quotation sent, and how it's getting on.</p>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1">
          {FILTERS.map((s) => (
            <button key={s} onClick={() => setStatus(s)} className={`px-3 py-1.5 text-sm rounded-md font-medium capitalize ${status === s ? 'bg-navy-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>{s}</button>
          ))}
        </div>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input !pl-9 w-56" placeholder="Search quotes…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {!data ? <PageLoading /> : data.length === 0 ? (
        <EmptyState icon={FileText} title="No quotes found" />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium">Ref</th>
                <th className="text-left px-4 py-2.5 font-medium">Customer</th>
                <th className="text-left px-4 py-2.5 font-medium">Title</th>
                <th className="text-right px-4 py-2.5 font-medium">Total</th>
                <th className="text-left px-4 py-2.5 font-medium">Status</th>
                <th className="text-left px-4 py-2.5 font-medium">Sent</th>
              </tr>
            </thead>
            <tbody>
              {data.map((qt) => (
                <tr key={qt.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    <Link to={`/customers/${qt.customer_id}`} className="hover:text-brand-600">{qt.ref}</Link>
                  </td>
                  <td className="px-4 py-3"><Link to={`/customers/${qt.customer_id}`} className="hover:text-brand-600">{qt.customer_name}</Link></td>
                  <td className="px-4 py-3 text-slate-500">{qt.title}</td>
                  <td className="px-4 py-3 text-right font-medium">{money(qt.total)}</td>
                  <td className="px-4 py-3"><StatusBadge status={qt.status} /></td>
                  <td className="px-4 py-3 text-slate-400">{qt.sent_at ? fmtDate(qt.sent_at) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
