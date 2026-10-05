import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, Eye, FileText, Trophy, PoundSterling, TrendingUp, AlertTriangle,
  CheckSquare, ChevronRight, ArrowUpRight,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell,
} from 'recharts';
import { api, money } from '../lib/api';
import { isoRange } from '../lib/reports.js';
import { PageLoading, useToast, Toast } from '../components/ui.jsx';
import ReportRangePills from '../components/ReportRangePills.jsx';
import { useAuth } from '../lib/auth.jsx';

const SOURCE_COLORS = {
  whatsapp: '#22c55e',
  facebook: '#3b82f6',
  email: '#a855f7',
  phone: '#f59e0b',
  facebook_lead: '#2563eb',
  sms: '#ec4899',
  manual: '#64748b',
};

const SOURCE_LABELS = {
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  facebook_lead: 'Lead ad',
  email: 'Email',
  phone: 'Phone',
  sms: 'SMS',
  manual: 'Manual',
};

const PIPELINE_GROUPS = [
  {
    title: 'Lead pipeline',
    hint: 'Enquiry → Follow-up',
    stages: ['ENQUIRY', 'SITE_VISIT_BOOKED', 'QUOTE_PENDING', 'QUOTED', 'FOLLOW_UP'],
  },
  {
    title: 'Outcomes',
    hint: 'Won and lost',
    stages: ['WON', 'LOST'],
  },
  {
    title: 'Jobs',
    hint: 'Scheduled → Paid',
    stages: ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'INVOICED', 'PAID'],
  },
];

const STAGE_SHORT = {
  ENQUIRY: 'Enquiry',
  SITE_VISIT_BOOKED: 'Site visit',
  QUOTE_PENDING: 'Quote pending',
  QUOTED: 'Quoted',
  FOLLOW_UP: 'Follow-up',
  WON: 'Won',
  LOST: 'Lost',
  SCHEDULED: 'Scheduled',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  INVOICED: 'Invoiced',
  PAID: 'Paid',
};

const EMPTY = {
  leads: { total: 0, bySource: [], trend: [] },
  visits: 0,
  quotesSent: 0,
  quotesValue: 0,
  won: 0,
  lost: 0,
  winRate: null,
  avgJobValue: null,
  pipelineValue: 0,
  pipelineCount: 0,
  customersByStage: [],
  tasks: { open: 0, overdue: 0 },
  invoices: { outstanding: 0, overdue: 0, overdue_count: 0 },
};

const CARD = 'rounded-2xl bg-white p-5 ring-1 ring-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)]';

function sourceLabel(source) {
  return SOURCE_LABELS[source] || source;
}

function greetingName(fullName) {
  return (fullName || '').split(' ')[0] || 'there';
}

function timeOfDay(now = new Date()) {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatTrendDay(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function stageBarClass(stage) {
  if (stage === 'LOST') return 'bg-rose-500';
  if (stage === 'WON') return 'bg-emerald-500';
  if (stage === 'PAID') return 'bg-sky-500';
  return 'bg-navy-800';
}

function LeadTrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload || {};
  const added = Number(row.leads || 0);
  const total = Number(row.total || 0);
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-lg">
      <div className="text-[11px] font-medium text-slate-400">{label}</div>
      <div className="text-sm font-semibold text-slate-900 mt-0.5">
        {added} new
      </div>
      <div className="text-[11px] text-slate-400 mt-0.5">{total} in this window</div>
    </div>
  );
}

const METRIC_TONES = {
  orange: {
    blob: 'bg-gradient-to-br from-orange-100 via-amber-50 to-orange-200/70',
    icon: 'text-orange-500',
  },
  green: {
    blob: 'bg-gradient-to-br from-emerald-100 via-green-50 to-emerald-200/70',
    icon: 'text-emerald-500',
  },
  rose: {
    blob: 'bg-gradient-to-br from-rose-100 via-pink-50 to-rose-200/70',
    icon: 'text-rose-500',
  },
  sky: {
    blob: 'bg-gradient-to-br from-sky-100 via-indigo-50 to-blue-200/70',
    icon: 'text-sky-500',
  },
  amber: {
    blob: 'bg-gradient-to-br from-amber-100 via-yellow-50 to-orange-100',
    icon: 'text-amber-500',
  },
  violet: {
    blob: 'bg-gradient-to-br from-violet-100 via-indigo-50 to-blue-100',
    icon: 'text-indigo-500',
  },
};

function MetricCard({ label, value, sub, icon: Icon, tone = 'sky', to }) {
  const t = METRIC_TONES[tone] || METRIC_TONES.sky;
  const body = (
    <>
      {Icon ? (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute -right-8 -top-10 flex h-32 w-32 rotate-[30deg] items-end justify-start rounded-[1.85rem] pb-8 pl-8 ${t.blob}`}
        >
          <Icon size={20} strokeWidth={2.25} className={`-rotate-[30deg] ${t.icon}`} />
        </span>
      ) : null}
      <div className="relative z-10 min-w-0 pr-14">
        <div className="text-[1.85rem] font-bold leading-none tracking-tight text-slate-900 tabular-nums">
          {value}
        </div>
        <p className="mt-1.5 text-sm font-medium text-slate-500">{label}</p>
        {sub ? <p className="mt-0.5 text-[11px] leading-snug text-slate-400">{sub}</p> : null}
      </div>
    </>
  );
  const cls = `group relative overflow-hidden rounded-2xl bg-white px-5 py-6 min-h-[7.25rem] shadow-[0_8px_24px_rgba(15,23,42,0.05)] ring-1 ring-slate-100/90 ${
    to ? 'transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(15,23,42,0.09)]' : ''
  }`;
  if (to) return <Link to={to} className={cls}>{body}</Link>;
  return <div className={cls}>{body}</div>;
}

function StageBars({ rows, maxCount }) {
  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const count = row.count || 0;
        const width = Math.max(count ? 8 : 0, Math.round((count / maxCount) * 100));
        return (
          <div key={row.stage}>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className={`text-[12px] font-medium ${count ? 'text-slate-600' : 'text-slate-400'}`}>
                {STAGE_SHORT[row.stage] || row.label}
              </span>
              <span className={`text-[13px] font-semibold tabular-nums ${count ? 'text-slate-900' : 'text-slate-300'}`}>
                {count}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white">
              <div
                className={`h-full rounded-full ${stageBarClass(row.stage)}`}
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Home dashboard: 14.1 lead volume, win/loss, and live pipeline value, with
 * visits, quotes, job average, charts, and live task/invoice alerts.
 */
export default function Dashboard() {
  const { user } = useAuth();
  const { toast, show } = useToast();
  const [data, setData] = useState(null);
  const [range, setRange] = useState(30);
  const [loadedRange, setLoadedRange] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const { from, to } = isoRange(range);
    api.get(`/dashboard?from=${from}&to=${to}`).then((d) => {
      if (!cancelled) {
        setData(d);
        setLoadedRange(range);
      }
    }).catch((err) => {
      if (cancelled) return;
      show(err.message || 'Could not load dashboard', 'error');
      setData(EMPTY);
      setLoadedRange(range);
    });
    return () => { cancelled = true; };
  }, [range, show]);

  if (!data) {
    return (
      <>
        <PageLoading />
        <Toast {...toast} />
      </>
    );
  }

  let running = 0;
  const trend = (data.leads?.trend || []).map((row) => {
    running += Number(row.leads || 0);
    return {
      day: formatTrendDay(row.day),
      leads: Number(row.leads || 0),
      total: running,
    };
  });
  const bySource = [...(data.leads?.bySource || [])].sort((a, b) => b.count - a.count);
  const sourceTotal = bySource.reduce((sum, row) => sum + Number(row.count || 0), 0) || 1;
  const stages = data.customersByStage || [];
  const stageMap = Object.fromEntries(stages.map((row) => [row.stage, row]));
  const maxStageCount = Math.max(1, ...stages.map((row) => Number(row.count || 0)));
  const tasks = data.tasks || { open: 0, overdue: 0 };
  const invoices = data.invoices || { outstanding: 0, overdue: 0, overdue_count: 0 };
  const showAlert = tasks.overdue > 0 || invoices.overdue_count > 0;
  const alertBits = [];
  if (tasks.overdue > 0) alertBits.push(`${tasks.overdue} overdue task${tasks.overdue === 1 ? '' : 's'}`);
  if (invoices.overdue_count > 0) {
    alertBits.push(`${invoices.overdue_count} overdue invoice${invoices.overdue_count === 1 ? '' : 's'} (${money(invoices.overdue)})`);
  }
  const rangeHint = `Last ${loadedRange || range} days`;
  const refreshing = loadedRange != null && loadedRange !== range;

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[1.85rem] font-semibold leading-tight tracking-tight text-slate-900">
            {timeOfDay()}, {greetingName(user?.name)}
          </h1>
          <p className="mt-1.5 text-[15px] text-slate-500">Here&apos;s how the business is doing.</p>
        </div>
        <ReportRangePills value={range} onChange={setRange} />
      </div>

      <div className={`grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 ${refreshing ? 'opacity-60' : ''} transition-opacity`}>
        <MetricCard
          label="New leads"
          value={data.leads?.total ?? 0}
          sub={rangeHint}
          icon={Users}
          tone="orange"
          to="/customers"
        />
        <MetricCard
          label="Site visits"
          value={data.visits ?? 0}
          sub={rangeHint}
          icon={Eye}
          tone="green"
          to="/schedule"
        />
        <MetricCard
          label="Quotes sent"
          value={data.quotesSent ?? 0}
          sub={data.quotesSent ? money(data.quotesValue) : rangeHint}
          icon={FileText}
          tone="violet"
          to="/quotes"
        />
        <MetricCard
          label="Win rate"
          value={data.winRate !== null && data.winRate !== undefined ? `${data.winRate}%` : '—'}
          sub={`${data.won ?? 0} won · ${data.lost ?? 0} lost`}
          icon={Trophy}
          tone="amber"
          to="/pipeline"
        />
        <MetricCard
          label="Avg job value"
          value={data.avgJobValue != null ? money(data.avgJobValue) : '—'}
          sub={rangeHint}
          icon={PoundSterling}
          tone="rose"
        />
        <MetricCard
          label="Pipeline value"
          value={money(data.pipelineValue)}
          sub={`${data.pipelineCount ?? 0} active`}
          icon={TrendingUp}
          tone="sky"
          to="/pipeline"
        />
      </div>

      {showAlert && (
        <Link
          to={tasks.overdue > 0 ? '/tasks?when=overdue' : '/invoices'}
          className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3.5 text-sm text-rose-800 ring-1 ring-rose-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:bg-rose-50/60 hover:ring-rose-300"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-500">
            <AlertTriangle size={16} />
          </span>
          <span className="flex-1 font-medium">{alertBits.join(' · ')}</span>
          <span className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-rose-600">
            {tasks.overdue > 0 ? 'View tasks' : 'View invoices'}
            <ChevronRight size={15} />
          </span>
        </Link>
      )}

      <div className="grid items-stretch gap-4 xl:grid-cols-5">
        <div className={`flex min-h-[22.5rem] flex-col xl:col-span-3 ${CARD}`}>
          <div className="flex shrink-0 items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900">Leads over time</h2>
              <p className="mt-0.5 text-xs text-slate-400">{data.leads?.total ?? 0} new · {rangeHint.toLowerCase()}</p>
            </div>
            <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200/80">
              Cumulative
            </span>
          </div>
          {trend.length === 0 ? (
            <p className="flex flex-1 items-center justify-center text-sm text-slate-400">No lead activity in this window.</p>
          ) : (
            <div className="relative mt-4 min-h-[16.5rem] flex-1">
              <div className="absolute inset-0">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="dashLeadGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#dc1114" stopOpacity={0.28} />
                        <stop offset="70%" stopColor="#dc1114" stopOpacity={0.06} />
                        <stop offset="100%" stopColor="#dc1114" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={28}
                      tickMargin={8}
                      height={28}
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={28} />
                    <Tooltip
                      cursor={{ stroke: '#dc1114', strokeWidth: 1, strokeDasharray: '4 4', strokeOpacity: 0.45 }}
                      content={<LeadTrendTooltip />}
                    />
                    <Area
                      type="monotone"
                      dataKey="total"
                      stroke="#dc1114"
                      strokeWidth={2.25}
                      fill="url(#dashLeadGrad)"
                      dot={false}
                      activeDot={{ r: 5, fill: '#dc1114', stroke: '#fff', strokeWidth: 2 }}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>

        <div className={`flex min-h-[22.5rem] flex-col xl:col-span-2 ${CARD}`}>
          <div className="shrink-0">
            <h2 className="font-semibold text-slate-900">Leads by source</h2>
            <p className="mt-0.5 text-xs text-slate-400">Where new customers came from</p>
          </div>
          {bySource.length === 0 ? (
            <p className="flex flex-1 items-center justify-center text-sm text-slate-400">No sources in this window.</p>
          ) : (
            <div className="mt-3 flex min-h-0 flex-1 flex-col justify-center gap-5">
              <div className="relative mx-auto h-[11.5rem] w-full max-w-[16rem]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={bySource}
                      dataKey="count"
                      nameKey="source"
                      cx="50%"
                      cy="50%"
                      innerRadius={56}
                      outerRadius={78}
                      paddingAngle={3}
                      stroke="#fff"
                      strokeWidth={3}
                      isAnimationActive={false}
                    >
                      {bySource.map((row) => (
                        <Cell key={row.source} fill={SOURCE_COLORS[row.source] || '#94a3b8'} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name) => [`${value}`, sourceLabel(name)]}
                      contentStyle={{ fontSize: 12, borderRadius: 12, border: '1px solid #e2e8f0' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[1.35rem] font-semibold tabular-nums leading-none text-slate-900">
                    {sourceTotal}
                  </span>
                  <span className="mt-1 text-[11px] text-slate-400">leads</span>
                </div>
              </div>
              <div className="w-full space-y-3">
                {bySource.map((row) => {
                  const pct = Math.round((Number(row.count) / sourceTotal) * 100);
                  return (
                    <div key={row.source}>
                      <div className="flex items-center gap-2.5">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: SOURCE_COLORS[row.source] || '#94a3b8' }}
                        />
                        <span className="flex-1 truncate text-[13px] text-slate-600">{sourceLabel(row.source)}</span>
                        <span className="text-[12px] tabular-nums text-slate-400">{pct}%</span>
                        <span className="w-6 text-right text-[13px] font-semibold tabular-nums text-slate-900">{row.count}</span>
                      </div>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, background: SOURCE_COLORS[row.source] || '#94a3b8' }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className={CARD}>
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900">Customers by pipeline stage</h2>
            <p className="mt-0.5 text-xs text-slate-400">Live board — all customers</p>
          </div>
          <Link to="/pipeline" className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-brand-500">
            Open pipeline
            <ArrowUpRight size={14} />
          </Link>
        </div>
        {stages.every((row) => !row.count) ? (
          <p className="py-12 text-center text-sm text-slate-400">No customers on the board yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {PIPELINE_GROUPS.map((group) => (
              <div key={group.title} className="rounded-xl bg-slate-50/80 p-4 ring-1 ring-slate-100">
                <div className="mb-4">
                  <h3 className="text-[13px] font-semibold text-slate-800">{group.title}</h3>
                  <p className="text-[11px] text-slate-400">{group.hint}</p>
                </div>
                <StageBars
                  maxCount={maxStageCount}
                  rows={group.stages.map((stage) => stageMap[stage] || { stage, label: stage, count: 0 })}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        <Link
          to="/tasks"
          className={`group ${CARD} transition hover:-translate-y-0.5 hover:shadow-md hover:ring-slate-300`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <CheckSquare size={16} />
              </span>
              <span className="text-[13px] font-medium text-slate-500">Tasks</span>
            </div>
            <ChevronRight size={16} className="text-slate-300 transition-colors group-hover:text-brand-500" />
          </div>
          <div className="mt-4 text-2xl font-semibold tabular-nums text-slate-900">
            {tasks.open} open task{tasks.open === 1 ? '' : 's'}
          </div>
          {tasks.overdue > 0 ? (
            <span className="mt-2 inline-flex rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
              {tasks.overdue} overdue — click to review
            </span>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Nothing overdue</p>
          )}
        </Link>
        <Link
          to="/invoices"
          className={`group ${CARD} transition hover:-translate-y-0.5 hover:shadow-md hover:ring-slate-300`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                <PoundSterling size={16} />
              </span>
              <span className="text-[13px] font-medium text-slate-500">Invoices</span>
            </div>
            <ChevronRight size={16} className="text-slate-300 transition-colors group-hover:text-brand-500" />
          </div>
          <div className="mt-4 text-2xl font-semibold tabular-nums text-slate-900">
            {money(invoices.outstanding)} outstanding
          </div>
          {invoices.overdue_count > 0 ? (
            <span className="mt-2 inline-flex rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
              {invoices.overdue_count} overdue invoice{invoices.overdue_count === 1 ? '' : 's'} · {money(invoices.overdue)}
            </span>
          ) : (
            <p className="mt-2 text-sm text-slate-500">across unpaid invoices</p>
          )}
        </Link>
      </div>
      <Toast {...toast} />
    </div>
  );
}
