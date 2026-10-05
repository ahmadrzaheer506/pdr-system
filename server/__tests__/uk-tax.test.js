const ukTax = require('../services/ukTax');

describe('UK tax engine (requirement 6.3)', () => {
  test('commercial customers default to reverse charge and CIS 20%', () => {
    expect(ukTax.taxDefaultsForCustomer({ customer_type: 'commercial' })).toEqual({
      vat_treatment: 'reverse_charge',
      cis_applies: true,
      cis_rate: 20,
      retention_percent: 5,
    });
  });

  test('domestic customers default to standard VAT and no CIS', () => {
    expect(ukTax.taxDefaultsForCustomer({ customer_type: 'domestic' })).toEqual({
      vat_treatment: 'standard',
      cis_applies: false,
      cis_rate: 20,
      retention_percent: 0,
    });
  });

  test('office override wins over commercial defaults', () => {
    const tax = ukTax.resolveTaxOpts(
      { vat_treatment: 'standard', cis_applies: false },
      { customer_type: 'commercial' },
      {}
    );
    expect(tax.vat_treatment).toBe('standard');
    expect(tax.cis_applies).toBe(false);
    expect(tax.retention_percent).toBe(5);
  });

  test('office can override commercial retention to 0%', () => {
    const tax = ukTax.resolveTaxOpts(
      { retention_percent: 0 },
      { customer_type: 'commercial' },
      {}
    );
    expect(tax.retention_percent).toBe(0);
  });

  test('quotes and invoices share documentTotals', () => {
    const items = [{ description: 'Labour', qty: 1, unit_price: 1000, vat_code: 'standard', kind: 'labour' }];
    const quote = ukTax.documentTotals(items, {}, { customer_type: 'commercial' }, {});
    const invoice = ukTax.documentTotals(items, {}, { customer_type: 'commercial' }, {});
    expect(quote.cols).toEqual(invoice.cols);
    expect(quote.cols.vat_treatment).toBe('reverse_charge');
    expect(quote.cols.vat_amount).toBe(0);
    expect(quote.calc.reverse_charge_vat).toBe(200);
    expect(quote.cols.cis_deduction).toBe(200);
  });

  test('custom Settings VAT rates are used on lines', () => {
    const r = ukTax.calculate(
      [{ description: 'Green materials', qty: 1, unit_price: 200, vat_code: 'green', kind: 'materials' }],
      { vat_rates: [{ code: 'green', rate: 5, short: '5%', label: 'Green 5%' }] }
    );
    expect(r.vat_total).toBe(10);
    expect(r.vat_breakdown[0].code).toBe('green');
  });

  test('parseVatRates rejects a duplicate code', () => {
    const parsed = ukTax.parseVatRates([
      { code: 'standard', rate: 20, short: '20%', label: 'Standard' },
      { code: 'standard', rate: 21, short: '21%', label: 'Dup' },
    ]);
    expect(parsed.error).toMatch(/Duplicate/);
  });

  test('commercial quotes default to 5% retention of net (requirement 6.4)', () => {
    const r = ukTax.documentTotals(
      [{ description: 'Works', qty: 1, unit_price: 10000, vat_code: 'standard', kind: 'labour' }],
      { vat_treatment: 'standard', cis_applies: false },
      { customer_type: 'commercial' },
      {}
    );
    expect(r.cols.retention_percent).toBe(5);
    expect(r.cols.retention_amount).toBe(500);
    expect(r.cols.total).toBe(12000);
  });

  test('provisional sums sit after the works total and join grand total only when toggled on', () => {
    const items = [{ description: 'Works', qty: 1, unit_price: 1000, vat_code: 'standard', kind: 'labour' }];
    const ps = [{ description: 'Rafter feet', amount: 400 }];
    const off = ukTax.calculate(items, { provisional_sums: ps, provisional_sums_in_total: false });
    expect(off.total).toBe(1200);
    expect(off.provisional_sums_total).toBe(400);
    expect(off.grand_total).toBe(1200);
    const on = ukTax.calculate(items, { provisional_sums: ps, provisional_sums_in_total: true });
    expect(on.total).toBe(1200);
    expect(on.grand_total).toBe(1600);
  });

  test('optional extras sit after the works total and never join it', () => {
    const r = ukTax.calculate(
      [{ description: 'Works', qty: 1, unit_price: 1000, vat_code: 'standard', kind: 'labour' }],
      { optional_extras: [{ description: 'Velux', amount: 640 }] }
    );
    expect(r.total).toBe(1200);
    expect(r.optional_extras_total).toBe(640);
    expect(r.grand_total).toBe(1200);
  });
});
