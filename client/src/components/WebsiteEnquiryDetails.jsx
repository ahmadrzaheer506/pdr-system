import React, { Fragment } from 'react';
import { websiteEnquiryView } from '../lib/websiteEnquiry.js';

/**
 * Labeled website-enquiry fields. On a phone each field stacks (label then value);
 * from sm, pairs sit on a two-column grid. Details always starts on its own row.
 */
export default function WebsiteEnquiryDetails({ lead, className, hidePlace = false }) {
  const view = websiteEnquiryView(lead, { hidePlace });
  if (!view) {
    if (!lead?.message) return null;
    return (
      <p className={`text-sm whitespace-pre-wrap ${className || 'mt-1.5'}`.trim()}>
        {lead.message}
      </p>
    );
  }

  return (
    <div className={className || 'mt-2'}>
      <dl className="grid grid-cols-1 gap-y-2.5 sm:grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)_minmax(0,8.5rem)_minmax(0,1fr)] sm:items-baseline sm:gap-x-3 sm:gap-y-1">
        {view.rows.map((row) => (
          <Fragment key={row.label}>
            <dt className="text-[11px] leading-4 text-slate-500 sm:leading-5">{row.label}</dt>
            <dd className="min-w-0 break-words text-[13px] font-medium leading-5 text-slate-800">{row.value}</dd>
          </Fragment>
        ))}
      </dl>
      {view.details ? (
        <dl className="mt-2.5 grid grid-cols-1 gap-y-1 border-t border-slate-200/80 pt-2 sm:mt-1.5 sm:grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)] sm:items-start sm:gap-x-3 sm:pt-1.5">
          <dt className="text-[11px] leading-4 text-slate-500 sm:leading-5">Details</dt>
          <dd className="min-w-0 break-words whitespace-pre-wrap text-[13px] leading-5 text-slate-800">{view.details}</dd>
        </dl>
      ) : null}
    </div>
  );
}
