jest.mock('../models', () => ({
  JobVariation: { findAll: jest.fn(), findOne: jest.fn(), create: jest.fn(), max: jest.fn() },
}));
jest.mock('../db', () => ({
  plain: (row) => (row && typeof row.toJSON === 'function' ? row.toJSON() : { ...row }),
}));

const { JobVariation } = require('../models');
const vars = require('../jobVariations');

describe('jobVariations (requirement 7.5)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects a blank description and a non-numeric amount', async () => {
    expect(await vars.addVariation(4, { description: '  ', amount: 120 })).toMatchObject({ status: 400 });
    expect(await vars.addVariation(4, { description: 'Lead soakers', amount: 'x' })).toMatchObject({
      error: 'Amount must be a number',
    });
    expect(JobVariation.create).not.toHaveBeenCalled();
  });

  test('creates a priced line without touching jobs.value', async () => {
    JobVariation.max.mockResolvedValue(-1);
    JobVariation.create.mockResolvedValue({
      id: 1, job_id: 4, description: 'Lead soakers', amount: 180, sort_order: 0,
    });
    const created = await vars.addVariation(4, { description: 'Lead soakers', amount: 180 });
    expect(created.line.amount).toBe(180);
    expect(created.line.description).toBe('Lead soakers');
  });

  test('allows a negative amount as a credit', async () => {
    expect(vars.parseAmount(-40)).toEqual({ amount: -40 });
  });
});
