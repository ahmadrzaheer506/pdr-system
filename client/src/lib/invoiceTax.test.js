import { describe, it, expect } from 'vitest';
import { canEditInvoiceTax, vatTreatmentLabel } from './invoiceTax';

describe('invoiceTax helpers (requirement 11.2)', () => {
  it('only drafts can be edited', () => {
    expect(canEditInvoiceTax('draft')).toBe(true);
    expect(canEditInvoiceTax('sent')).toBe(false);
    expect(canEditInvoiceTax('paid')).toBe(false);
  });

  it('labels VAT treatments', () => {
    expect(vatTreatmentLabel('reverse_charge')).toBe('Reverse charge');
    expect(vatTreatmentLabel('not_registered')).toBe('Not VAT registered');
    expect(vatTreatmentLabel('standard')).toBe('Standard');
  });
});
