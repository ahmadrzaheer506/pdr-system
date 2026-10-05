jest.mock('../models', () => ({ Invoice: {} }));

const ukTax = require('../services/ukTax');
const invoiceTax = require('../invoiceTax');

describe('invoiceTax (requirement 11.2)', () => {
  const customer = { customer_type: 'commercial' };
  const uk = { vat_registered: true, default_cis_rate: 20 };
  const draft = {
    status: 'draft',
    items: [{ description: 'Labour', qty: 1, unit_price: 1000, vat_code: 'standard', kind: 'labour' }],
    vat_treatment: 'reverse_charge',
    cis_applies: true,
    cis_rate: 20,
    retention_percent: 0,
    provisional_sums: [],
    provisional_sums_in_total: false,
    vat_breakdown: [{ code: 'standard', rate: 20, net: 1000, vat: 0 }],
  };

  test('freezes tax on any status other than draft', () => {
    expect(invoiceTax.isTaxFrozen('draft')).toBe(false);
    expect(invoiceTax.isTaxFrozen('sent')).toBe(true);
    expect(invoiceTax.isTaxFrozen('paid')).toBe(true);
    expect(invoiceTax.isTaxFrozen('part_paid')).toBe(true);
    expect(invoiceTax.isTaxFrozen('overdue')).toBe(true);
    expect(invoiceTax.applyDraftTax({ ...draft, status: 'sent' }, { vat_treatment: 'standard' }, customer, uk)).toMatchObject({
      status: 400,
      error: 'VAT and CIS can only be edited on a draft invoice',
    });
  });

  test('recalculates VAT and CIS on a draft without changing retention inherit', () => {
    const applied = invoiceTax.applyDraftTax(draft, { vat_treatment: 'standard', cis_applies: true, cis_rate: 20 }, customer, uk);
    expect(applied.cols.vat_treatment).toBe('standard');
    expect(applied.cols.vat_amount).toBe(200);
    expect(applied.cols.cis_deduction).toBe(200);
    expect(applied.cols.retention_percent).toBe(0);
  });

  test('rejects an invalid VAT treatment', () => {
    expect(invoiceTax.parseDraftTax({ vat_treatment: 'made_up' }, draft)).toMatchObject({ status: 400 });
  });

  test('decorates reverse-charge notice from stored breakdown', () => {
    const view = invoiceTax.decorateTaxView(draft);
    expect(view.reverse_charge_vat).toBe(200);
    expect(view.reverse_charge_notice).toBe(ukTax.reverseChargeNotice(200));
    expect(view.tax_frozen).toBe(false);
  });
});
