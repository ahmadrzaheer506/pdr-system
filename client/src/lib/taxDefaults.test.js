import { describe, it, expect } from 'vitest';
import { quoteTaxDefaults, vatOptionsFromMeta, vatSelectOptions } from './taxDefaults';

describe('quoteTaxDefaults (requirement 6.3 / 6.4)', () => {
  it('defaults commercial quotes to reverse charge, CIS 20% and 5% retention', () => {
    expect(quoteTaxDefaults({ customer_type: 'commercial' })).toEqual({
      vat_treatment: 'reverse_charge',
      cis_applies: true,
      cis_rate: 20,
      retention_percent: 5,
    });
  });

  it('defaults domestic quotes to standard VAT, no CIS and 0% retention', () => {
    expect(quoteTaxDefaults({ customer_type: 'domestic' })).toEqual({
      vat_treatment: 'standard',
      cis_applies: false,
      cis_rate: 20,
      retention_percent: 0,
    });
  });

  it('maps Settings VAT rates into picker options', () => {
    const opts = vatOptionsFromMeta([
      { code: 'standard', rate: 20, short: '20%', label: 'Standard 20%' },
      { code: 'green', rate: 5, short: '5%', label: 'Green 5%' },
    ]);
    expect(opts.map((o) => o.code)).toEqual(['standard', 'green']);
  });

  it('includes custom Settings codes in catalogue and quote pickers', () => {
    const opts = vatSelectOptions([
      { code: 'standard', rate: 20, short: '20%', label: 'Standard 20%' },
      { code: 'high', rate: 50, short: '50%', label: 'High 50%' },
    ]);
    expect(opts).toEqual([
      { value: 'standard', label: 'Standard 20%' },
      { value: 'high', label: 'High 50%' },
    ]);
  });

  it('keeps a saved VAT code in the picker if Settings no longer lists it', () => {
    const opts = vatSelectOptions(
      [{ code: 'standard', rate: 20, short: '20%', label: 'Standard 20%' }],
      'high',
    );
    expect(opts.map((o) => o.value)).toEqual(['standard', 'high']);
  });
});
