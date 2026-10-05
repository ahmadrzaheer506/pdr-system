const { Op } = require('sequelize');
const { buildCustomerListWhere } = require('../customerSearch');

const sequelize = {
  escape: (v) => `'${String(v).replace(/'/g, "''")}'`,
};

describe('buildCustomerListWhere (requirement 2.5)', () => {
  test('applies postcode, source, company name, and created-date range', () => {
    const { where } = buildCustomerListWhere({
      postcode: 'RG1',
      source: 'whatsapp',
      company_name: 'Site Roofing',
      created_from: '2026-09-01',
      created_to: '2026-09-22',
    }, sequelize);
    const and = where[Op.and];
    expect(and).toEqual(expect.arrayContaining([
      { source: 'whatsapp' },
      { company_name: { [Op.iLike]: '%Site Roofing%' } },
      { created_at: { [Op.gte]: '2026-09-01T00:00:00.000Z', [Op.lte]: '2026-09-22T23:59:59.999Z' } },
    ]));
    expect(and.some((c) => typeof c === 'object' && c.val && /customer_sites/.test(c.val) && /RG1/.test(c.val))).toBe(true);
  });

  test('text search matches a +44 / spaced phone via the normalised column', () => {
    const { where } = buildCustomerListWhere({ q: '+44 7700 900100' }, sequelize);
    const or = where[Op.and][0][Op.or];
    expect(or.some((c) => c.val && /p.normalised = '07700900100'/.test(c.val))).toBe(true);
    expect(or.some((c) => c.name)).toBe(true);
    expect(or.some((c) => c.company_name)).toBe(true);
  });

  test('rejects invalid dates and a from after to', () => {
    expect(buildCustomerListWhere({ created_from: '22-09-2026' }, sequelize).error).toBe('Invalid created_from date');
    expect(buildCustomerListWhere({ created_from: '2026-09-22', created_to: '2026-09-01' }, sequelize).error)
      .toBe('created_from must be on or before created_to');
  });
});
