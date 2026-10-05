import React from 'react';
import { Link } from 'react-router-dom';
import {
  Phone, Mail, MessageCircle, Facebook, Edit3, Calendar, Clock, ArrowUpRight, Check,
} from 'lucide-react';
import { fmtTimeAgo } from '../lib/api';
import { leadPath } from '../lib/customerRoutes.js';
import { leadSourceLabel } from '../lib/leads.js';
import { StatusBadge } from './ui.jsx';

const SOURCE_ICON = {
  whatsapp: MessageCircle,
  facebook: Facebook,
  facebook_lead: Facebook,
  email: Mail,
  phone: Phone,
  sms: Phone,
  manual: Edit3,
};

const SOURCE_STYLE = {
  whatsapp: {
    rail: 'bg-emerald-500',
    icon: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    chip: 'bg-emerald-50 text-emerald-800 ring-emerald-100',
  },
  facebook: {
    rail: 'bg-sky-500',
    icon: 'bg-sky-50 text-sky-700 ring-sky-100',
    chip: 'bg-sky-50 text-sky-800 ring-sky-100',
  },
  facebook_lead: {
    rail: 'bg-blue-500',
    icon: 'bg-blue-50 text-blue-700 ring-blue-100',
    chip: 'bg-blue-50 text-blue-800 ring-blue-100',
  },
  email: {
    rail: 'bg-violet-500',
    icon: 'bg-violet-50 text-violet-700 ring-violet-100',
    chip: 'bg-violet-50 text-violet-800 ring-violet-100',
  },
  phone: {
    rail: 'bg-amber-500',
    icon: 'bg-amber-50 text-amber-700 ring-amber-100',
    chip: 'bg-amber-50 text-amber-800 ring-amber-100',
  },
  sms: {
    rail: 'bg-pink-500',
    icon: 'bg-pink-50 text-pink-700 ring-pink-100',
    chip: 'bg-pink-50 text-pink-800 ring-pink-100',
  },
  manual: {
    rail: 'bg-slate-400',
    icon: 'bg-slate-100 text-slate-600 ring-slate-200',
    chip: 'bg-slate-50 text-slate-700 ring-slate-200/80',
  },
};

const FALLBACK_STYLE = SOURCE_STYLE.manual;

function Chip({ icon: Icon, children, className }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${className}`}>
      {Icon ? <Icon size={12} strokeWidth={2} /> : null}
      <span className="max-w-[16rem] truncate">{children}</span>
    </span>
  );
}

/**
 * Shared enquiry row for the inbox and the customer record lead list.
 */
export default function LeadCard({
  lead,
  from = 'inbox',
  onBookVisit,
  onMarkActioned,
}) {
  const style = SOURCE_STYLE[lead.source] || FALLBACK_STYLE;
  const Icon = SOURCE_ICON[lead.source] || Edit3;
  const href = lead.customer_id ? leadPath(lead.customer_id, from, lead.id) : null;
  const contact = lead.phone || lead.email || '';
  const isNew = lead.status === 'NEW';
  const showActions = href || onBookVisit || (isNew && onMarkActioned);
  const preview = lead.message || lead.subject || '';

  return (
    <div className="group relative overflow-hidden rounded-2xl bg-white p-4 pl-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-slate-200/70 transition hover:ring-slate-300 hover:shadow-md sm:p-5 sm:pl-6">
      <span className={`absolute inset-y-0 left-0 w-1 ${style.rail}`} aria-hidden="true" />
      <div className="flex gap-3.5">
        <span className={`mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 ${style.icon}`}>
          <Icon size={18} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {href ? (
              <Link
                to={href}
                className="text-[15px] font-semibold tracking-tight text-slate-900 hover:text-brand-700"
              >
                {lead.customer_name}
              </Link>
            ) : (
              <span className="text-[15px] font-semibold tracking-tight text-slate-900">{lead.customer_name}</span>
            )}
            <StatusBadge status={lead.status} className="capitalize" />
          </div>
          {lead.next_action ? (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800 ring-1 ring-amber-100">
              Next: {lead.next_action}
            </div>
          ) : null}
          {preview ? (
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600 line-clamp-2">{preview}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Chip icon={Icon} className={style.chip}>{leadSourceLabel(lead.source)}</Chip>
            {lead.created_at ? (
              <Chip icon={Clock} className="bg-slate-50 text-slate-600 ring-slate-200/80">
                {fmtTimeAgo(lead.created_at)}
              </Chip>
            ) : null}
            {contact ? (
              <Chip
                icon={lead.phone ? Phone : Mail}
                className="bg-slate-50 text-slate-600 ring-slate-200/80"
              >
                {contact}
              </Chip>
            ) : null}
          </div>
        </div>
      </div>
      {showActions ? (
        <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3 sm:justify-end">
          {href ? (
            <Link
              to={href}
              className="inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-navy-900 px-3 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Open
              <ArrowUpRight size={13} />
            </Link>
          ) : null}
          {onBookVisit && lead.customer_id ? (
            <button
              type="button"
              onClick={() => onBookVisit(lead)}
              className="inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-white px-3 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-slate-900"
            >
              <Calendar size={13} />
              Book visit
            </button>
          ) : null}
          {isNew && onMarkActioned ? (
            <button
              type="button"
              onClick={() => onMarkActioned(lead)}
              className="inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-emerald-50 px-3 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-100 hover:bg-emerald-100"
            >
              <Check size={14} strokeWidth={2.4} />
              Mark actioned
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
