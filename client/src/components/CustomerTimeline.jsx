import React from 'react';
import {
  Phone, Mail, MessageCircle, StickyNote, FileText, Briefcase, Receipt, Clock,
} from 'lucide-react';
import { fmtDateTime, fmtTimeAgo } from '../lib/api';
import { TIMELINE_LABELS } from '../lib/timeline';

const ICONS = {
  message: MessageCircle,
  call: Phone,
  note: StickyNote,
  quote: FileText,
  job: Briefcase,
  invoice: Receipt,
};

const BADGE = {
  message: 'bg-sky-50 text-sky-700',
  call: 'bg-violet-50 text-violet-700',
  note: 'bg-amber-50 text-amber-800',
  quote: 'bg-indigo-50 text-indigo-700',
  job: 'bg-cyan-50 text-cyan-700',
  invoice: 'bg-orange-50 text-orange-700',
};

function MessageBubble({ item }) {
  const out = item.meta?.direction === 'out';
  const channel = item.meta?.channel || 'message';
  const icons = { whatsapp: MessageCircle, email: Mail, facebook: MessageCircle, note: StickyNote, phone: Phone, sms: Phone };
  const Icon = icons[channel] || MessageCircle;
  return (
    <div className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] rounded-xl px-3.5 py-2.5 text-sm ${out ? 'bg-navy-900 text-white' : 'bg-slate-100 text-slate-800'}`}>
        <div className="flex items-center gap-1.5 text-[11px] mb-1 opacity-70">
          <Icon size={11} />
          <span>{TIMELINE_LABELS[item.type]}</span>
          {item.meta?.status === 'simulated' && <span className="opacity-80">(simulated)</span>}
          <span>· {fmtDateTime(item.at)}</span>
        </div>
        <div className="whitespace-pre-wrap break-words">{item.summary}</div>
      </div>
    </div>
  );
}

function RecordEvent({ item }) {
  const Icon = ICONS[item.type] || Clock;
  return (
    <div className="flex gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2.5">
      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${BADGE[item.type] || 'bg-slate-100 text-slate-600'}`}>
        <Icon size={15} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`badge !text-[10px] ${BADGE[item.type] || ''}`}>{TIMELINE_LABELS[item.type]}</span>
          <span className="text-[11px] text-slate-400">{fmtDateTime(item.at)}</span>
          {item.user_name && <span className="text-[11px] text-slate-400">· {item.user_name}</span>}
        </div>
        <p className="text-sm text-slate-700 mt-1">{item.summary}</p>
      </div>
      <span className="text-[11px] text-slate-400 shrink-0 self-start">{fmtTimeAgo(item.at)}</span>
    </div>
  );
}

/**
 * Unified activity feed for requirement 2.3.
 * Empty feed keeps a default panel height; a long history scrolls inside a max height.
 */
export default function CustomerTimeline({ items }) {
  if (!items?.length) {
    return (
      <div
        className="flex min-h-64 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/60"
        role="region"
        aria-label="Activity timeline"
      >
        <p className="text-sm text-slate-400">No activity yet.</p>
      </div>
    );
  }
  return (
    <div
      className="max-h-[32rem] space-y-3 overflow-y-auto overscroll-contain pr-1"
      role="region"
      aria-label="Activity timeline"
    >
      {items.map((item) => (
        item.type === 'message' || item.type === 'call' || item.type === 'note'
          ? <MessageBubble key={item.id} item={item} />
          : <RecordEvent key={item.id} item={item} />
      ))}
    </div>
  );
}
