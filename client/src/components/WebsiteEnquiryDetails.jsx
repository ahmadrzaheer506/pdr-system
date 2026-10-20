import React, { Fragment } from 'react';
import { websiteEnquiryView } from '../lib/websiteEnquiry.js';

/**
 * Labeled website-enquiry fields. Pairs sit on a two-column grid;
 * Details always starts on its own full-width row.
 */
export default function WebsiteEnquiryDetails({ lead, className, hidePlace = false }) {
  const view = websiteEnquiryView(lead, { hidePlace });
  if (!view) {
    if (!lead?.message) return null;
    return (
      <p className={`text-sm text-slate-700 whitespace-pre-wrap ${className || 'mt-1.5'}`.trim()}>
        {lead.message}
      </p>
    );
  }

  return (
    <div className={className || 'mt-2'}>
      <dl className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 sm:grid-cols-[8.5rem_minmax(0,1fr)_8.5rem_minmax(0,1fr)]">
        {view.rows.map((row) => (
          <Fragment key={row.label}>
            <dt className="text-[11px] leading-5 text-slate-500">{row.label}</dt>
            <dd className="text-[13px] font-medium leading-5 text-slate-800">{row.value}</dd>
          </Fragment>
        ))}
      </dl>
      {view.details ? (
        <dl className="mt-1.5 grid grid-cols-[8.5rem_minmax(0,1fr)] items-start gap-x-3 border-t border-slate-200/80 pt-1.5">
          <dt className="text-[11px] leading-5 text-slate-500">Details</dt>
          <dd className="text-[13px] leading-5 text-slate-800 whitespace-pre-wrap">{view.details}</dd>
        </dl>
      ) : null}
    </div>
  );
}
