import React from 'react';
import {
  Phone, Mail, MessageCircle, StickyNote, FileText, Briefcase, Receipt, Clock,
} from 'lucide-react';
import { fmtDateTime, fmtTimeAgo } from '../lib/api';
import { TIMELINE_LABELS, timelineChannelLabel, timelineStatusLabel } from '../lib/timeline';
import { websiteEnquiryView } from '../lib/websiteEnquiry.js';
import WebsiteEnquiryDetails from './WebsiteEnquiryDetails.jsx';

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
  const status = item.meta?.status;
  const statusLabel = timelineStatusLabel(status);
  const failed = status === 'failed' || status === 'error';
  const icons = { whatsapp: MessageCircle, email: Mail, facebook: MessageCircle, note: StickyNote, phone: Phone, sms: Phone };
  const Icon = icons[channel] || MessageCircle;
  const lead = { source: item.meta?.channel, message: item.summary, meta: item.meta };
  const enquiry = websiteEnquiryView(lead);
  const bubbleWidth = enquiry ? 'w-full max-w-full' : 'w-full max-w-full sm:max-w-[85%]';
  return (
    <div className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
      <div className={`${bubbleWidth} min-w-0 rounded-xl px-3 py-2.5 text-sm sm:px-3.5 ${out ? 'bg-navy-900 text-white' : 'bg-slate-100 text-slate-800'}`}>
        <div className={`flex items-center gap-1.5 text-[11px] mb-1 flex-wrap ${out ? 'text-white/70' : 'text-slate-500'}`}>
          <Icon size={11} />
          <span>{timelineChannelLabel(item)}</span>
          {statusLabel && (
            <span className={failed ? (out ? 'text-red-200' : 'text-red-600') : ''}>· {statusLabel}</span>
          )}
          <span>· {fmtDateTime(item.at)}</span>
        </div>
        {enquiry ? (
          <WebsiteEnquiryDetails className="mt-1.5" lead={lead} />
        ) : (
          <p className="min-w-0 break-words whitespace-pre-wrap">{item.summary}</p>
        )}
        {failed && item.meta?.error && (
          <p className={`text-[11px] mt-1.5 whitespace-pre-wrap ${out ? 'text-red-100/90' : 'text-red-700'}`}>{item.meta.error}</p>
        )}
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
      <span className="hidden shrink-0 self-start text-[11px] text-slate-400 sm:inline">{fmtTimeAgo(item.at)}</span>
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
      className="space-y-3 sm:max-h-[32rem] sm:overflow-y-auto sm:overscroll-contain sm:pr-1"
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
