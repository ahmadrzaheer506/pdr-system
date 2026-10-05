import React from 'react';
import { createPortal } from 'react-dom';

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

export function StatusBadge({ status, className = '' }) {
  const colors = {
    draft: 'bg-slate-100 text-slate-600', sent: 'bg-sky-100 text-sky-700', accepted: 'bg-emerald-100 text-emerald-700',
    declined: 'bg-rose-100 text-rose-700', expired: 'bg-slate-200 text-slate-500', part_paid: 'bg-amber-100 text-amber-700',
    paid: 'bg-green-100 text-green-700', overdue: 'bg-red-100 text-red-700', open: 'bg-amber-100 text-amber-700',
    done: 'bg-emerald-100 text-emerald-700', dismissed: 'bg-slate-100 text-slate-500', pending: 'bg-amber-100 text-amber-700',
    approved: 'bg-emerald-100 text-emerald-700',
    completed: 'bg-amber-100 text-amber-700',
    rejected: 'bg-rose-100 text-rose-700',
    booked: 'bg-slate-100 text-slate-600',
    cancelled: 'bg-slate-100 text-slate-500',
    active: 'bg-emerald-100 text-emerald-700', PENDING: 'bg-slate-100 text-slate-600', SCHEDULED: 'bg-cyan-100 text-cyan-700',
    IN_PROGRESS: 'bg-blue-100 text-blue-700', COMPLETED: 'bg-teal-100 text-teal-700', NEW: 'bg-amber-100 text-amber-700',
    ACTIONED: 'bg-sky-100 text-sky-700', CONVERTED: 'bg-emerald-100 text-emerald-700', CLOSED: 'bg-slate-100 text-slate-500',
  };
  const label = String(status || '')
    .replace(/_/g, ' ')
    .replace(/\S+/g, (word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`);
  return (
    <span className={`badge ${colors[status] || 'bg-slate-100 text-slate-600'} ${className}`.trim()}>
      {label}
    </span>
  );
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

export function avatarUrl(user) {
  if (!user?.avatar_file) return null;
  const params = new URLSearchParams({ v: String(user.avatar_file) });
  if (user.id != null && user.id !== '') params.set('user', String(user.id));
  return `/api/auth/avatar?${params.toString()}`;
}

export function Avatar({ name, color, size = 8, src }) {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => { setFailed(false); }, [src]);
  const px = size * 4;
  const initials = (name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const box = { width: px, height: px, fontSize: size * 1.4 };
  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name || ''}
        title={name}
        className="flex-shrink-0 rounded-full object-cover bg-slate-200"
        style={box}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div
      className="flex-shrink-0 rounded-full flex items-center justify-center text-white font-semibold"
      style={{ background: color || '#64748b', ...box }}
      title={name}
    >
      {initials}
    </div>
  );
}

export function Modal({ open, onClose, title, subtitle, headerActions, children, wide, size, tall, footer, zClass = 'z-[100]' }) {
  React.useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEsc);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onEsc);
    };
  }, [open, onClose]);

  if (!open) return null;

  const width = size === '4xl' ? 'max-w-4xl' : wide ? 'max-w-3xl' : size === '2xl' ? 'max-w-2xl' : size === 'xl' ? 'max-w-xl' : 'max-w-lg';
  const height = tall ? 'max-h-[min(92vh,56rem)]' : 'max-h-[min(90vh,40rem)]';

  return createPortal(
    <div className={`fixed inset-0 ${zClass} flex items-center justify-center p-3 sm:p-5`} role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/55 backdrop-blur-[2px]"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        className={`relative z-10 flex w-full ${height} flex-col overflow-hidden rounded-2xl bg-white shadow-2xl shadow-slate-900/20 ${width}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-base font-semibold tracking-tight text-slate-900">{title}</h3>
            {subtitle ? <p className="mt-0.5 text-sm leading-snug text-slate-500">{subtitle}</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {headerActions}
            <button type="button" onClick={onClose} className="rounded-lg px-2 text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">×</button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/90 px-5 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
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

export function LoadError({ message }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
      {message || 'Could not load this page'}
    </div>
  );
}

/**
 * Hover/focus tooltip. Wrap a disabled control so the hint still appears
 * (disabled buttons do not receive pointer events).
 */
export function HoverTooltip({ text, children }) {
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef(null);
  const [coords, setCoords] = React.useState(null);
  if (!text) return children;

  const show = () => {
    const el = wrapRef.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const placeBelow = box.top < 48;
    setCoords({
      top: placeBelow ? box.bottom + 8 : box.top - 8,
      left: box.left + box.width / 2,
      place: placeBelow ? 'below' : 'above',
    });
    setOpen(true);
  };
  const hide = () => setOpen(false);

  return (
    <>
      <span
        ref={wrapRef}
        className="inline-flex"
        onMouseEnter={show}
        onMouseOver={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>
      {open && coords && createPortal(
        <span
          role="tooltip"
          className="pointer-events-none z-[80] max-w-[16rem] rounded-lg bg-slate-900 px-2.5 py-1.5 text-left text-[11px] leading-snug text-white shadow-lg"
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            transform: coords.place === 'below' ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
          }}
        >
          {text}
        </span>,
        document.body,
      )}
    </>
  );
}

export function Toast({ message, type = 'ok', onClose }) {
  if (!message) return null;
  return (
    <div className={`fixed bottom-5 right-5 z-[120] px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white ${type === 'error' ? 'bg-red-600' : 'bg-slate-900'}`} onClick={onClose}>
      {message}
    </div>
  );
}

export function useToast() {
  const [toast, setToast] = React.useState(null);
  const hideTimer = React.useRef(null);
  React.useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);
  const show = React.useCallback((message, type = 'ok') => {
    setToast({ message, type });
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);
  return { toast, show };
}
