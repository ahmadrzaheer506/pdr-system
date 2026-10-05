/**
 * Invoice VAT / CIS display (requirement 11.2).
 * Drafts are editable; any other status is frozen.
 */
export const VAT_TREATMENT_OPTIONS = [
  { value: 'standard', label: 'Standard — charge VAT at the rates set per line' },
  { value: 'reverse_charge', label: 'Domestic Reverse Charge — customer accounts for the VAT' },
  { value: 'not_registered', label: 'Not VAT registered — no VAT charged' },
];

export const CIS_RATE_OPTIONS = [
  { value: 20, label: '20% — registered subcontractor' },
  { value: 30, label: '30% — unverified' },
  { value: 0, label: '0% — gross payment status' },
];

export function vatTreatmentLabel(treatment) {
  if (treatment === 'reverse_charge') return 'Reverse charge';
  if (treatment === 'not_registered') return 'Not VAT registered';
  return 'Standard';
}

export function canEditInvoiceTax(status) {
  return status === 'draft';
}
