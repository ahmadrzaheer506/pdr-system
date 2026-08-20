import React from 'react';

export function StageBadge({ stage, label }) {
  const colors = {
    ENQUIRY: 'bg-slate-100 text-slate-700',
    SITE_VISIT_BOOKED: 'bg-sky-100 text-sky-700',
    QUOTE_PENDING: 'bg-amber-100 text-amber-700',
    QUOTED: 'bg-indigo-100 text-indigo-700',
    FOLLOW_UP: 'bg-purple-100 text-purple-700',
    WON: 'bg-emerald-100 text-emerald-700',
    LOST: 'bg-rose-100 text-rose-700',
    SCHEDULED: 'bg-cyan-100 text-cyan-700',
    IN_PROGRESS: 'bg-blue-100 text-blue-700',
    COMPLETED: 'bg-teal-100 text-teal-700',
    INVOICED: 'bg-orange-100 text-orange-700',
    PAID: 'bg-green-100 text-green-700',
  };
  return <span className={`badge ${colors[stage] || 'bg-slate-100 text-slate-700'}`}>{label || stage}</span>;
}

export function PriorityBadge({ priority }) {
  const colors = { urgent: 'bg-red-100 text-red-700', high: 'bg-orange-100 text-orange-700', normal: 'bg-slate-100 text-slate-600', low: 'bg-slate-100 text-slate-500' };
  return <span className={`badge ${colors[priority] || colors.normal}`}>{priority}</span>;
}

export function StatusBadge({ status }) {
  const colors = {
    draft: 'bg-slate-100 text-slate-600', sent: 'bg-sky-100 text-sky-700', accepted: 'bg-emerald-100 text-emerald-700',
    declined: 'bg-rose-100 text-rose-700', expired: 'bg-slate-200 text-slate-500', part_paid: 'bg-amber-100 text-amber-700',
    paid: 'bg-green-100 text-green-700', overdue: 'bg-red-100 text-red-700', open: 'bg-amber-100 text-amber-700',
    done: 'bg-emerald-100 text-emerald-700', dismissed: 'bg-slate-100 text-slate-500', pending: 'bg-amber-100 text-amber-700',
    approved: 'bg-emerald-100 text-emerald-700', PENDING: 'bg-slate-100 text-slate-600', SCHEDULED: 'bg-cyan-100 text-cyan-700',
    IN_PROGRESS: 'bg-blue-100 text-blue-700', COMPLETED: 'bg-teal-100 text-teal-700', NEW: 'bg-amber-100 text-amber-700',
    ACTIONED: 'bg-sky-100 text-sky-700', CONVERTED: 'bg-emerald-100 text-emerald-700', CLOSED: 'bg-slate-100 text-slate-500',
  };
  return <span className={`badge ${colors[status] || 'bg-slate-100 text-slate-600'}`}>{String(status).replace('_', ' ')}</span>;
}

export function ModeBadge({ mode }) {
  const live = mode === 'live' || String(mode).startsWith('live');
  return (
    <span className={`badge gap-1 ${live ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${live ? 'bg-emerald-500' : 'bg-amber-500'}`} />
      {live ? 'Live' : 'Simulated'}
    </span>
  );
}

export function Avatar({ name, color, size = 8 }) {
  const initials = (name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div
      className={`flex-shrink-0 rounded-full flex items-center justify-center text-white font-semibold`}
      style={{ background: color || '#64748b', width: size * 4, height: size * 4, fontSize: size * 1.4 }}
      title={name}
    >
      {initials}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`bg-white rounded-2xl shadow-xl w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 sticky top-0 bg-white rounded-t-2xl">
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none px-2">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function StatTile({ label, value, sub, icon: Icon, accent = 'brand' }) {
  const accents = { brand: 'text-brand-600 bg-brand-50', slate: 'text-slate-600 bg-slate-100', green: 'text-emerald-600 bg-emerald-50', red: 'text-red-600 bg-red-50' };
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs text-slate-500">{label}</div>
        {Icon && <div className={`rounded-lg p-1.5 flex-shrink-0 ${accents[accent]}`}><Icon size={15} /></div>}
      </div>
      <div className="text-xl xl:text-2xl font-bold text-slate-900 leading-tight mt-1.5 tabular-nums">{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, detail }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 text-slate-400">
      {Icon && <Icon size={32} className="mb-3 opacity-50" />}
      <div className="font-medium text-slate-500">{title}</div>
      {detail && <div className="text-sm mt-1 max-w-sm">{detail}</div>}
    </div>
  );
}

export function Spinner({ size = 20 }) {
  return (
    <div
      className="animate-spin rounded-full border-2 border-slate-300 border-t-brand-500"
      style={{ width: size, height: size }}
    />
  );
}

export function PageLoading() {
  return <div className="flex items-center justify-center h-64"><Spinner size={28} /></div>;
}

export function Toast({ message, type = 'ok', onClose }) {
  if (!message) return null;
  return (
    <div className={`fixed bottom-5 right-5 z-[60] px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white ${type === 'error' ? 'bg-red-600' : 'bg-slate-900'}`} onClick={onClose}>
      {message}
    </div>
  );
}

export function useToast() {
  const [toast, setToast] = React.useState(null);
  const show = (message, type = 'ok') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };
  return { toast, show };
}
