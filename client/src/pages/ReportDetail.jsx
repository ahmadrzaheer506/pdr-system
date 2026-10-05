import React, { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { api, money, fmtDate } from '../lib/api';
import {
  isLiveReport, isGenerateReport, isAdminReport, isoRange, effectiveRange, matchingPreset,
  reportCsvPath, reportCsvFilename,
} from '../lib/reports.js';
import { PageLoading, StageBadge, StatusBadge, EmptyState, useToast, Toast } from '../components/ui.jsx';
import ReportRangeControls from '../components/ReportRangeControls.jsx';
import { useAuth } from '../lib/auth.jsx';
import { ROLES } from '../lib/roles';
import { leadPath } from '../lib/customerRoutes.js';

const SOURCE_COLORS = {
  whatsapp: '#22c55e', facebook: '#3b82f6', email: '#a855f7', phone: '#f59e0b',
  facebook_lead: '#2563eb', sms: '#ec4899', manual: '#64748b',
};

const TITLES = {
  'lead-volume': 'Lead volume',
  'win-loss': 'Win / loss',
  'pipeline-value': 'Pipeline value',
  customers: 'Customers',
  jobs: 'Jobs',
  invoices: 'Invoices',
  profitability: 'Job profitability',
};

const STAGE_LABELS = {
  ENQUIRY: 'Enquiry',
  SITE_VISIT_BOOKED: 'Site Visit Booked',
  QUOTE_PENDING: 'Quote Pending',
  QUOTED: 'Quoted',
  FOLLOW_UP: 'Follow-Up',
  WON: 'Won',
  LOST: 'Lost',
  SCHEDULED: 'Scheduled',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  INVOICED: 'Invoiced',
  PAID: 'Paid',
};

/**
 * Report detail: 7/30/90 + from/to (from/to overrides pills) and CSV (requirement 14.2).
 * Pipeline value stays a live snapshot with no date filter.
 */
export default function ReportDetail() {
  const { type } = useParams();
  const { user } = useAuth();
  const { toast, show } = useToast();
  const generate = isGenerateReport(type);
  const pipeline = type === 'pipeline-value';
  const initialRange = isoRange(30);
  const [preset, setPreset] = useState(30);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(!generate);
  const [generating, setGenerating] = useState(generate);
  const [downloading, setDownloading] = useState(false);
  const [downloadingLabour, setDownloadingLabour] = useState(false);
  const [generatedRange, setGeneratedRange] = useState(null);

  useEffect(() => {
    const range = isoRange(30);
    setFrom(range.from);
    setTo(range.to);
    setPreset(30);
    setData(null);
    setGeneratedRange(null);
    setLoading(!isGenerateReport(type) && isLiveReport(type));
    if (isAdminReport(type) && user?.role !== ROLES.ADMIN) {
      setGenerating(false);
      return undefined;
    }
    if (!isGenerateReport(type)) {
      setGenerating(false);
      return undefined;
    }
    let cancelled = false;
    setGenerating(true);
    api.get(`/reports/${type}?from=${range.from}&to=${range.to}`)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setGeneratedRange({ from: range.from, to: range.to });
      })
      .catch((err) => {
        if (cancelled) return;
        show(err.message || 'Could not generate report', 'error');
      })
      .finally(() => {
        if (!cancelled) setGenerating(false);
      });
    return () => { cancelled = true; };
  }, [type, user?.role]);

  useEffect(() => {
    if (!isLiveReport(type) || isGenerateReport(type)) return undefined;
    let cancelled = false;
    setLoading(true);
    const range = effectiveRange(preset, from, to);
    const path = type === 'pipeline-value'
      ? '/reports/pipeline-value'
      : `/reports/${type}?from=${range.from}&to=${range.to}`;
    api.get(path).then((d) => {
      if (cancelled) return;
      setData(d);
      setLoading(false);
    }).catch((err) => {
      if (cancelled) return;
      show(err.message || 'Could not load report', 'error');
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [type, preset, from, to]);

  if (isAdminReport(type) && user?.role !== ROLES.ADMIN) {
    return <Navigate to="/reports" replace />;
  }

  if (!isLiveReport(type)) {
    return <Navigate to="/reports" replace />;
  }

  const custom = Boolean(from && to);
  const pillValue = matchingPreset(from, to) ?? (custom ? null : preset);

  const loadGenerated = async (range) => {
    setGenerating(true);
    try {
      const d = await api.get(`/reports/${type}?from=${range.from}&to=${range.to}`);
      setData(d);
      setGeneratedRange({ from: range.from, to: range.to });
    } catch (err) {
      show(err.message || 'Could not generate report', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const onPreset = (days) => {
    setPreset(days);
    const range = isoRange(days);
    setFrom(range.from);
    setTo(range.to);
    if (generate) loadGenerated(range);
  };

  const onFrom = (value) => {
    setFrom(value);
    if (generate) setPreset(null);
  };

  const onTo = (value) => {
    setTo(value);
    if (generate) setPreset(null);
  };

  const onGenerate = async () => {
    if (!from || !to) {
      show('Choose from and to dates before generating', 'error');
      return;
    }
    if (from > to) {
      show('From must be on or before to', 'error');
      return;
    }
    await loadGenerated({ from, to });
  };

  const onDownload = async (opts = {}) => {
    const labour = Boolean(opts.labour);
    const range = pipeline ? null : (generate ? generatedRange : effectiveRange(preset, from, to));
    if (!pipeline && !range) return;
    const setBusy = labour ? setDownloadingLabour : setDownloading;
    setBusy(true);
    try {
      await api.download(reportCsvPath(type, range, { labour }), reportCsvFilename(type, range, { labour }));
    } catch (err) {
      show(err.message || 'Could not download CSV', 'error');
    } finally {
      setBusy(false);
    }
  };

  const csvReady = pipeline ? Boolean(data) : (generate ? Boolean(generatedRange) : Boolean(data));

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <BackLink />
          <h1 className="text-2xl font-bold text-slate-900 mt-2">{TITLES[type]}</h1>
        </div>
        {pipeline ? (
          <button
            type="button"
            className="btn-secondary"
            disabled={!csvReady || downloading}
            onClick={onDownload}
          >
            {downloading ? 'Downloading…' : 'Download CSV'}
          </button>
        ) : (
          <ReportRangeControls
            preset={pillValue}
            from={from}
            to={to}
            onPreset={onPreset}
            onFrom={onFrom}
            onTo={onTo}
            onGenerate={generate ? onGenerate : undefined}
            generating={generating}
            onDownload={type === 'profitability' ? undefined : onDownload}
            downloadDisabled={!csvReady}
            downloading={downloading}
            extraButtons={type === 'profitability' ? (
              <>
                <button type="button" className="btn-secondary" disabled={!csvReady || downloading} onClick={() => onDownload()}>
                  {downloading ? 'Downloading…' : 'Download jobs CSV'}
                </button>
                <button type="button" className="btn-secondary" disabled={!csvReady || downloadingLabour} onClick={() => onDownload({ labour: true })}>
                  {downloadingLabour ? 'Downloading…' : 'Download labour CSV'}
                </button>
              </>
            ) : null}
          />
        )}
      </div>

      {generate && !data && !generating && (
        <EmptyState title="Choose a date range, then Generate" detail="From and To are required. The 7/30/90 pills fill those dates and reload the list. Rows use created date." />
      )}

      {(loading || generating) && <PageLoading />}
      {!loading && !generating && type === 'lead-volume' && data && <LeadVolumeReport data={data} />}
      {!loading && !generating && type === 'win-loss' && data && <WinLossReport data={data} />}
      {!loading && !generating && type === 'pipeline-value' && data && <PipelineValueReport data={data} />}
      {!loading && !generating && type === 'customers' && data && <CustomersReport data={data} />}
      {!loading && !generating && type === 'jobs' && data && <JobsReport data={data} />}
      {!loading && !generating && type === 'invoices' && data && <InvoicesReport data={data} />}
      {!loading && !generating && type === 'profitability' && data && <ProfitabilityReport data={data} />}
      <Toast {...toast} />
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/reports" className="text-sm font-medium text-slate-500 hover:text-slate-800">
      ← Reports
    </Link>
  );
}

function LeadVolumeReport({ data }) {
  const rows = data.leads || [];
  return (
    <>
      <p className="text-sm text-slate-500">{data.total} new inbox lead{data.total === 1 ? '' : 's'} in this window.</p>
      {data.total === 0 && <EmptyState title="No leads in this window" />}
      {rows.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Lead</th>
                <th className="px-4 py-2 font-medium">Source</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">
                    {row.customer_id ? (
                      <Link to={leadPath(row.customer_id)} className="font-medium text-slate-800 hover:underline">
                        {row.customer_name || 'Lead'}
                      </Link>
                    ) : (
                      <span className="font-medium text-slate-800">{row.customer_name || 'Lead'}</span>
                    )}
                    {row.message ? <div className="text-xs text-slate-400 mt-0.5 line-clamp-1">{row.message}</div> : null}
                  </td>
                  <td className="px-4 py-2">
                    <span className="inline-flex items-center gap-1.5 capitalize text-slate-600">
                      <span className="h-2 w-2 rounded-full" style={{ background: SOURCE_COLORS[row.source] || '#94a3b8' }} />
                      {(row.source || '—').replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-2"><StatusBadge status={row.status} /></td>
                  <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{fmtDate(row.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function WinLossReport({ data }) {
  const rate = data.winRate !== null ? `${data.winRate}%` : '—';
  return (
    <>
      <p className="text-sm text-slate-500">
        {rate} win rate · {data.won} won · {data.lost} lost. Counts customers whose current stage is Won or Lost and whose record was last updated in this window.
      </p>
      {data.won + data.lost === 0 && <EmptyState title="No won or lost customers in this window" />}
      {data.byReason?.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-slate-800 mb-3">Lost reasons</h3>
          <ul className="divide-y divide-slate-100">
            {data.byReason.map((row) => (
              <li key={row.reason} className="flex justify-between py-2 text-sm">
                <span className="text-slate-700">{row.reason}</span>
                <span className="tabular-nums text-slate-500">{row.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data.customers?.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Customer</th>
                <th className="px-4 py-2 font-medium">Stage</th>
                <th className="px-4 py-2 font-medium">Lost reason</th>
                <th className="px-4 py-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {data.customers.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">
                    <Link to={`/customers/${row.id}`} className="font-medium text-slate-800 hover:underline">{row.name}</Link>
                  </td>
                  <td className="px-4 py-2"><StageBadge stage={row.stage} /></td>
                  <td className="px-4 py-2 text-slate-500">{row.stage === 'LOST' ? (row.lost_reason || '—') : '—'}</td>
                  <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{fmtDate(row.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function PipelineValueReport({ data }) {
  return (
    <>
      <p className="text-sm text-slate-500">
        {money(data.pipelineValue)} across {data.pipelineCount} active customer{data.pipelineCount === 1 ? '' : 's'}. Live snapshot of sent and draft quotes on Enquiry through Follow-up — not filtered by 7/30/90.
      </p>
      <div className="card p-5">
        <h3 className="font-semibold text-slate-800 mb-4">By stage</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data.byStage || []} margin={{ top: 0, right: 0, left: -10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={0} angle={-20} textAnchor="end" height={60} />
            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={48} tickFormatter={(v) => `£${v}`} />
            <Tooltip formatter={(v) => money(v)} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
            <Bar dataKey="value" fill="#1e293b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

function CustomersReport({ data }) {
  const rows = data.customers || [];
  return (
    <>
      <p className="text-sm text-slate-500">{rows.length} customer{rows.length === 1 ? '' : 's'} created in this window.</p>
      {rows.length === 0 && <EmptyState title="No customers in this window" />}
      {rows.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Stage</th>
                <th className="px-4 py-2 font-medium">Source</th>
                <th className="px-4 py-2 font-medium">Lost reason</th>
                <th className="px-4 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">
                    <Link to={`/customers/${row.id}`} className="font-medium text-slate-800 hover:underline">{row.name}</Link>
                  </td>
                  <td className="px-4 py-2 text-slate-600">{row.customer_type === 'commercial' ? 'Commercial' : 'Domestic'}</td>
                  <td className="px-4 py-2"><StageBadge stage={row.stage} label={STAGE_LABELS[row.stage] || row.stage} /></td>
                  <td className="px-4 py-2 text-slate-500">{row.source || '—'}</td>
                  <td className="px-4 py-2 text-slate-500">{row.stage === 'LOST' ? (row.lost_reason || '—') : '—'}</td>
                  <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{fmtDate(row.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function JobsReport({ data }) {
  const rows = data.jobs || [];
  return (
    <>
      <p className="text-sm text-slate-500">{rows.length} job{rows.length === 1 ? '' : 's'} created in this window.</p>
      {rows.length === 0 && <EmptyState title="No jobs in this window" />}
      {rows.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Title</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Customer</th>
                <th className="px-4 py-2 font-medium">Scheduled</th>
                <th className="px-4 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-800">{row.title}</td>
                  <td className="px-4 py-2"><StatusBadge status={row.status} /></td>
                  <td className="px-4 py-2">
                    {row.customer_id ? (
                      <Link to={`/customers/${row.customer_id}`} className="text-slate-800 hover:underline">{row.customer_name || 'Customer'}</Link>
                    ) : (row.customer_name || '—')}
                  </td>
                  <td className="px-4 py-2 text-slate-500 whitespace-nowrap">
                    {row.start_date ? `${fmtDate(row.start_date)}${row.end_date && row.end_date !== row.start_date ? ` – ${fmtDate(row.end_date)}` : ''}` : '—'}
                  </td>
                  <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{fmtDate(row.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function InvoicesReport({ data }) {
  const rows = data.invoices || [];
  const showTotals = data.include_totals !== false;
  return (
    <>
      <p className="text-sm text-slate-500">{rows.length} invoice{rows.length === 1 ? '' : 's'} created in this window.</p>
      {rows.length === 0 && <EmptyState title="No invoices in this window" />}
      {rows.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Ref</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Customer</th>
                {showTotals && <th className="px-4 py-2 font-medium">Total</th>}
                {showTotals && <th className="px-4 py-2 font-medium">Amount due</th>}
                <th className="px-4 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-800">{row.ref}</td>
                  <td className="px-4 py-2"><StatusBadge status={row.status} /></td>
                  <td className="px-4 py-2">
                    {row.customer_id ? (
                      <Link to={`/customers/${row.customer_id}`} className="text-slate-800 hover:underline">{row.customer_name || 'Customer'}</Link>
                    ) : (row.customer_name || '—')}
                  </td>
                  {showTotals && <td className="px-4 py-2 tabular-nums">{money(row.total)}</td>}
                  {showTotals && <td className="px-4 py-2 tabular-nums">{money(row.amount_due)}</td>}
                  <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{fmtDate(row.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function ProfitabilityReport({ data }) {
  const jobs = data.jobs || [];
  const labour = data.labour || [];
  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        Quoted value (excluding VAT) against labour clocked on jobs created in this window.
        <strong className="text-slate-700"> This is before materials</strong> — it shows what is left to cover materials, overheads and profit.
      </p>
      {jobs.length === 0 ? (
        <EmptyState title="No costed jobs in this window" detail="Jobs need completed or approved clocked hours." />
      ) : (
        <div className="card overflow-hidden">
          <h3 className="font-semibold text-slate-800 px-4 pt-4">Jobs</h3>
          <table className="w-full text-sm mt-2">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Job</th>
                <th className="px-4 py-2 font-medium text-right">Quoted (ex VAT)</th>
                <th className="px-4 py-2 font-medium text-right">Hours</th>
                <th className="px-4 py-2 font-medium text-right">Labour cost</th>
                <th className="px-4 py-2 font-medium text-right">After labour</th>
                <th className="px-4 py-2 font-medium text-right">Labour margin</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className={`border-t border-slate-100 ${j.underquoted ? 'bg-red-50/40' : ''}`}>
                  <td className="px-4 py-2">
                    <div className="font-medium text-slate-800">{j.title}</div>
                    <div className="text-xs text-slate-400">
                      {j.customer_id ? (
                        <Link to={`/customers/${j.customer_id}`} className="hover:underline">{j.customer_name || 'Customer'}</Link>
                      ) : (j.customer_name || '—')}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(j.net_value)}</td>
                  <td className="px-4 py-2 text-right text-slate-500">{j.actual_hours}h</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(j.actual_labour_cost)}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">{money(j.gross_profit)}</td>
                  <td className="px-4 py-2 text-right">
                    <span className={`inline-flex items-center justify-end gap-1 font-semibold ${j.margin_percent < 20 ? 'text-red-600' : j.margin_percent < 40 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {j.margin_percent < 20 ? <TrendingDown size={13} /> : <TrendingUp size={13} />}
                      {j.margin_percent === null ? '—' : `${j.margin_percent}%`}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div>
        <h3 className="font-semibold text-slate-800 mb-2">Labour by operative</h3>
        {labour.length === 0 ? (
          <EmptyState title="No clocked labour in this window" />
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium text-right">Hours</th>
                  <th className="px-4 py-2 font-medium text-right">Labour cost</th>
                </tr>
              </thead>
              <tbody>
                {labour.map((row) => (
                  <tr key={row.user_id} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-medium text-slate-800">{row.name}</td>
                    <td className="px-4 py-2 text-right text-slate-500">{row.hours}h</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money(row.labour_cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
