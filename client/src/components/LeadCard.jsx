import React from 'react';
import { Link } from 'react-router-dom';
import {
  Phone, Mail, MessageCircle, Facebook, Edit3, Calendar, Clock, ArrowUpRight, Check,
} from 'lucide-react';
import { fmtTimeAgo } from '../lib/api';
import { leadPath } from '../lib/customerRoutes.js';
import { leadDisplayName, leadSourceLabel } from '../lib/leads.js';
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
  const isNew = lead.status === 'NEW';
  const canBook = Boolean(onBookVisit && lead.customer_id);
  const canAction = Boolean(isNew && onMarkActioned);
  const actionCount = Number(Boolean(href)) + Number(canBook) + Number(canAction);
  const showActions = actionCount > 0;
  const preview = lead.message || lead.subject || '';
  const actionGrid = actionCount === 3 ? 'grid-cols-3' : actionCount === 2 ? 'grid-cols-2' : 'grid-cols-1';
  const actionBtn = 'inline-flex min-h-9 min-w-0 w-full items-center justify-center gap-1 rounded-xl px-1.5 py-1.5 text-center text-[11px] font-semibold leading-tight sm:h-9 sm:w-auto sm:gap-1.5 sm:px-3 sm:text-xs sm:whitespace-nowrap';

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
                {leadDisplayName(lead)}
              </Link>
            ) : (
              <span className="text-[15px] font-semibold tracking-tight text-slate-900">{leadDisplayName(lead)}</span>
            )}
            <StatusBadge
              status={lead.stage === 'WON' || lead.stage === 'LOST' ? lead.stage : lead.status}
              className="capitalize"
            />
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
            {lead.phone ? (
              <Chip icon={Phone} className="bg-slate-50 text-slate-600 ring-slate-200/80">
                {lead.phone}
              </Chip>
            ) : null}
            {lead.email ? (
              <Chip icon={Mail} className="bg-slate-50 text-slate-600 ring-slate-200/80">
                {lead.email}
              </Chip>
            ) : null}
          </div>
        </div>
      </div>
      {showActions ? (
        <div className={`mt-4 grid ${actionGrid} gap-1.5 border-t border-slate-100 pt-3 sm:flex sm:flex-wrap sm:items-center sm:justify-end`}>
          {href ? (
            <Link
              to={href}
              className={`${actionBtn} bg-navy-900 text-white hover:bg-slate-800`}
            >
              Open
              <ArrowUpRight size={13} className="shrink-0" />
            </Link>
          ) : null}
          {canBook ? (
            <button
              type="button"
              onClick={() => onBookVisit(lead)}
              className={`${actionBtn} bg-white font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-slate-900`}
            >
              <Calendar size={13} className="shrink-0" />
              Book visit
            </button>
          ) : null}
          {canAction ? (
            <button
              type="button"
              onClick={() => onMarkActioned(lead)}
              className={`${actionBtn} bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100 hover:bg-emerald-100`}
            >
              <Check size={14} strokeWidth={2.4} className="shrink-0" />
              Mark actioned
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
