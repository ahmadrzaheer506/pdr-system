import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { api, money, fmtDate } from '../lib/api';
import { PageLoading, StatusBadge, EmptyState } from '../components/ui.jsx';
import ListFilterBar from '../components/ListFilterBar.jsx';
import { leadPath } from '../lib/customerRoutes.js';
import { isLiveQboId } from '../lib/quickbooks';

const FILTERS = [
  { value: 'ALL', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'declined', label: 'Declined' },
  { value: 'expired', label: 'Expired' },
];

export default function Quotes() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('ALL');
  const [q, setQ] = useState('');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [sentFrom, setSentFrom] = useState(() => searchParams.get('sent_from') || '');
  const [sentTo, setSentTo] = useState(() => searchParams.get('sent_to') || '');
  const [data, setData] = useState(null);
  const issuedMode = Boolean(sentFrom || sentTo);

  useEffect(() => {
    const t = setTimeout(() => {
      const params = new URLSearchParams();
      params.set('status', status);
      if (q.trim()) params.set('q', q.trim());
      if (issuedMode) {
        if (sentFrom) params.set('sent_from', sentFrom);
        if (sentTo) params.set('sent_to', sentTo);
      } else {
        if (createdFrom) params.set('created_from', createdFrom);
        if (createdTo) params.set('created_to', createdTo);
      }
      api.get(`/quotes?${params.toString()}`).then((d) => setData(d.quotes)).catch(() => setData([]));
    }, 200);
    return () => clearTimeout(t);
  }, [status, q, createdFrom, createdTo, sentFrom, sentTo, issuedMode]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Quotes</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          {issuedMode
            ? 'Quotes issued in the dashboard window (sent, or recorded in the office).'
            : 'Every quotation, and how it\'s getting on.'}
        </p>
      </div>

      <ListFilterBar
        tabs={FILTERS}
        value={status}
        onChange={setStatus}
        searchValue={q}
        onSearchChange={setQ}
        searchLabel="Search quotes"
        from={issuedMode ? sentFrom : createdFrom}
        to={issuedMode ? sentTo : createdTo}
        onFromChange={issuedMode ? setSentFrom : setCreatedFrom}
        onToChange={issuedMode ? setSentTo : setCreatedTo}
        fromLabel={issuedMode ? 'Sent from' : 'Created from'}
        toLabel={issuedMode ? 'Sent to' : 'Created to'}
      />

      {!data ? <PageLoading /> : data.length === 0 ? (
        <EmptyState icon={FileText} title="No quotes found" />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
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
                    <Link to={leadPath(qt.customer_id, 'quotes', qt.lead_id)} className="hover:text-brand-600">{qt.ref}</Link>
                  </td>
                  <td className="px-4 py-3"><Link to={leadPath(qt.customer_id, 'quotes', qt.lead_id)} className="hover:text-brand-600">{qt.customer_name}</Link></td>
                  <td className="px-4 py-3 text-slate-500">{qt.title}</td>
                  <td className="px-4 py-3 text-right font-medium">{money(qt.total)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-start gap-0.5">
                      <StatusBadge status={qt.status} />
                      {isLiveQboId(qt.qbo_id) && (
                        <span className="text-[10px] uppercase tracking-wide text-emerald-700">QuickBooks</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{qt.sent_at ? fmtDate(qt.sent_at) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}
