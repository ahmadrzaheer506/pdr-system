jest.mock('../models', () => ({
  Invoice: { findOne: jest.fn() },
  JobVariation: { findAll: jest.fn() },
}));
jest.mock('../db', () => ({
  plain: (row) => (row && typeof row.toJSON === 'function' ? row.toJSON() : row),
}));

const { Invoice, JobVariation } = require('../models');
const invoiceFromJob = require('../invoiceFromJob');

describe('invoiceFromJob (requirement 11.1)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('copies quote lines then appends each variation as qty 1 standard labour', () => {
    const lines = invoiceFromJob.linesForJobInvoice(
      { title: 'Re-roof', value: 5000 },
      { items: [{ description: 'Labour', qty: 2, unit_price: 400, vat_code: 'standard', kind: 'labour' }] },
      [{ description: 'Lead soakers', amount: 180 }],
    );
    expect(lines).toEqual([
      { description: 'Labour', qty: 2, unit_price: 400, vat_code: 'standard', kind: 'labour' },
      { description: 'Lead soakers', qty: 1, unit_price: 180, vat_code: 'standard', kind: 'labour' },
    ]);
  });

  test('falls back to job title and value when the quote has no items', () => {
    expect(invoiceFromJob.linesForJobInvoice({ title: 'Porch', value: 400 }, null, [])).toEqual([
      { description: 'Porch', qty: 1, unit_price: 400 },
    ]);
  });

  test('invoiceIdForJob returns the existing row or null', async () => {
    Invoice.findOne.mockResolvedValue({ id: 12, ref: 'INV-1' });
    expect(await invoiceFromJob.invoiceIdForJob(8)).toEqual({ id: 12, ref: 'INV-1' });
    Invoice.findOne.mockResolvedValue(null);
    expect(await invoiceFromJob.invoiceIdForJob(8)).toBe(null);
  });

  test('linesFromJobRecord loads variations from the job', async () => {
    JobVariation.findAll.mockResolvedValue([
      { description: 'Lead soakers', amount: 180, sort_order: 0 },
    ]);
    const lines = await invoiceFromJob.linesFromJobRecord(
      { id: 8, title: 'Re-roof', value: 5000 },
      { items: [{ description: 'Labour', qty: 1, unit_price: 1000 }] },
    );
    expect(lines[1]).toEqual({
      description: 'Lead soakers',
      qty: 1,
      unit_price: 180,
      vat_code: 'standard',
      kind: 'labour',
    });
  });
});
