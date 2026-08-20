import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Eye, FileText, Trophy, PoundSterling, TrendingUp, AlertTriangle, ListChecks } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import { api, money, fmtDate } from '../lib/api';
import { StatTile, PageLoading } from '../components/ui.jsx';
import { useAuth } from '../lib/auth.jsx';

const SOURCE_COLORS = { whatsapp: '#22c55e', facebook: '#3b82f6', email: '#a855f7', phone: '#f59e0b', facebook_lead: '#2563eb', sms: '#ec4899', manual: '#64748b' };
const STAGE_LABELS = { ENQUIRY: 'Enquiry', SITE_VISIT_BOOKED: 'Visit Booked', QUOTE_PENDING: 'Quote Pending', QUOTED: 'Quoted', FOLLOW_UP: 'Follow-Up', WON: 'Won', LOST: 'Lost', SCHEDULED: 'Scheduled', IN_PROGRESS: 'In Progress', COMPLETED: 'Completed', INVOICED: 'Invoiced', PAID: 'Paid' };

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [range, setRange] = useState(30);

  useEffect(() => {
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - range * 86400000).toISOString().slice(0, 10);
    api.get(`/dashboard?from=${from}&to=${to}`).then(setData);
  }, [range]);

  if (!data) return <PageLoading />;

  const trend = data.trend.map((t) => ({ day: fmtDate(t.day, { day: 'numeric', month: 'short' }), leads: t.leads }));
  const stageData = data.stageCounts.map((s) => ({ name: STAGE_LABELS[s.stage] || s.stage, value: s.c }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Morning, {user?.name?.split(' ')[0]}</h1>
          <p className="text-slate-500 text-sm mt-0.5">Here's how the business is doing</p>
        </div>
        <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1">
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => setRange(d)} className={`px-3 py-1.5 text-sm rounded-md font-medium ${range === d ? 'bg-navy-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatTile label="New leads" value={data.leads.total} icon={Users} accent="brand" />
        <StatTile label="Site visits" value={data.visits} icon={Eye} accent="slate" />
        <StatTile label="Quotes sent" value={data.quotesSent} sub={money(data.quotesValue)} icon={FileText} accent="slate" />
        <StatTile label="Win rate" value={data.winRate !== null ? `${data.winRate}%` : '—'} sub={`${data.won} won · ${data.lost} lost`} icon={Trophy} accent="green" />
        <StatTile label="Avg job value" value={money(data.avgJobValue)} icon={PoundSterling} accent="slate" />
        <StatTile label="Pipeline value" value={money(data.pipelineValue)} sub={`${data.pipelineCount} active`} icon={TrendingUp} accent="brand" />
      </div>

      {(data.tasks.overdue > 0 || data.invoicing.overdueCount > 0) && (
        <div className="card p-4 bg-red-50 border-red-200 flex items-center gap-3">
          <AlertTriangle className="text-red-500 flex-shrink-0" size={20} />
          <div className="text-sm text-red-800">
            {data.tasks.overdue > 0 && <span className="font-medium">{data.tasks.overdue} overdue task{data.tasks.overdue > 1 ? 's' : ''}</span>}
            {data.tasks.overdue > 0 && data.invoicing.overdueCount > 0 && ' · '}
            {data.invoicing.overdueCount > 0 && <span className="font-medium">{data.invoicing.overdueCount} overdue invoice{data.invoicing.overdueCount > 1 ? 's' : ''} ({money(data.invoicing.overdueValue)})</span>}
          </div>
          <Link to="/tasks" className="ml-auto text-sm font-medium text-red-700 hover:underline whitespace-nowrap">View tasks →</Link>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card p-5 lg:col-span-2">
          <h3 className="font-semibold text-slate-800 mb-4">Leads over time</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="leadGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ea580c" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#ea580c" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={24} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
              <Area type="monotone" dataKey="leads" stroke="#ea580c" strokeWidth={2} fill="url(#leadGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-slate-800 mb-4">Leads by source</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={data.leads.bySource} dataKey="count" nameKey="source" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2} isAnimationActive={false}>
                {data.leads.bySource.map((s, i) => <Cell key={i} fill={SOURCE_COLORS[s.source] || '#94a3b8'} />)}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center mt-1">
            {data.leads.bySource.map((s) => (
              <div key={s.source} className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="w-2 h-2 rounded-full" style={{ background: SOURCE_COLORS[s.source] || '#94a3b8' }} />
                {s.source} ({s.count})
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="font-semibold text-slate-800 mb-4">Customers by pipeline stage</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={stageData} margin={{ top: 0, right: 0, left: -20, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={0} angle={-30} textAnchor="end" height={70} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={24} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
            <Bar dataKey="value" fill="#1e293b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Link to="/tasks" className="card p-4 flex items-center gap-3 hover:border-brand-300 transition-colors">
          <div className="rounded-lg p-2 bg-amber-50 text-amber-600"><ListChecks size={18} /></div>
          <div>
            <div className="font-semibold text-slate-800">{data.tasks.open} open tasks</div>
            <div className="text-xs text-slate-500">{data.tasks.overdue} overdue — click to review</div>
          </div>
        </Link>
        <Link to="/invoices" className="card p-4 flex items-center gap-3 hover:border-brand-300 transition-colors">
          <div className="rounded-lg p-2 bg-orange-50 text-orange-600"><PoundSterling size={18} /></div>
          <div>
            <div className="font-semibold text-slate-800">{money(data.invoicing.outstanding)} outstanding</div>
            <div className="text-xs text-slate-500">across unpaid invoices</div>
          </div>
        </Link>
      </div>
    </div>
  );
}
