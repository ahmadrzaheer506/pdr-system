import { money } from '../lib/api';
import { vatTreatmentLabel } from '../lib/invoiceTax';

/** Read-only VAT / CIS figures (requirement 11.2). */
export default function InvoiceTaxSummary({ invoice, compact = false }) {
  const cis = invoice.cis_applies
    ? `${invoice.cis_rate}% · ${money(invoice.cis_deduction)}`
    : 'No CIS';
  const className = compact ? 'grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-slate-600 mt-1.5' : 'grid grid-cols-2 gap-x-4 gap-y-2 text-sm';
  return (
    <dl className={className}>
      <dt className={compact ? '' : 'text-slate-500'}>VAT treatment</dt>
      <dd className={compact ? 'text-right' : 'text-slate-800 font-medium text-right'}>{vatTreatmentLabel(invoice.vat_treatment)}</dd>
      <dt className={compact ? '' : 'text-slate-500'}>VAT amount</dt>
      <dd className={compact ? 'text-right' : 'text-slate-800 font-medium text-right'}>{money(invoice.vat_amount)}</dd>
      <dt className={compact ? '' : 'text-slate-500'}>CIS</dt>
      <dd className={compact ? 'text-right' : 'text-slate-800 font-medium text-right'}>{cis}</dd>
      <dt className={compact ? '' : 'text-slate-500'}>Due now</dt>
      <dd className={compact ? 'text-right font-medium text-slate-800' : 'text-slate-800 font-medium text-right'}>{money(invoice.due_now)}</dd>
    </dl>
  );
}
