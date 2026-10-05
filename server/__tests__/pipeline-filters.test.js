const { Op } = require('sequelize');
const { buildPipelineBoardWhere, parseSourceList, LATEST_QUOTE_SQL, PIPELINE_VALUE_SQL, LEAD_LATEST_QUOTE_SQL } = require('../pipelineFilters');

describe('buildPipelineBoardWhere (requirement 4.4)', () => {
  test('parses repeated and comma-separated sources', () => {
    expect(parseSourceList(['whatsapp', 'email'])).toEqual(['whatsapp', 'email']);
    expect(parseSourceList('whatsapp,email')).toEqual(['whatsapp', 'email']);
    expect(parseSourceList('')).toEqual([]);
  });

  test('combines filters with AND', () => {
    const { where, customerWhere } = buildPipelineBoardWhere({
      source: ['whatsapp', 'phone'],
      owner_id: '2',
      created_from: '2026-09-01',
      created_to: '2026-09-22',
      value_min: '500',
      value_max: '8000',
    });
    const and = where[Op.and];
    expect(and).toEqual(expect.arrayContaining([
      { source: { [Op.in]: ['whatsapp', 'phone'] } },
      { created_at: { [Op.gte]: '2026-09-01T00:00:00.000Z', [Op.lte]: '2026-09-22T23:59:59.999Z' } },
    ]));
    expect(customerWhere[Op.and]).toEqual(expect.arrayContaining([{ owner_id: 2 }]));
    expect(and.some((c) => c.val && />= 500/.test(c.val))).toBe(true);
    expect(and.some((c) => c.val && /<= 8000/.test(c.val))).toBe(true);
  });

  test('rejects invalid owner and inverted value bounds', async () => {
    expect(buildPipelineBoardWhere({ owner_id: 'nope' }).error).toBe('Invalid owner_id');
    expect(buildPipelineBoardWhere({ customer_id: 'nope' }).error).toBe('Invalid customer_id');
    expect(buildPipelineBoardWhere({ value_min: 'abc' }).error).toBe('Invalid value_min');
    expect(buildPipelineBoardWhere({ value_min: '9', value_max: '1' }).error)
      .toBe('value_min must be on or below value_max');
  });

  test('filters a single customer', () => {
    const { where } = buildPipelineBoardWhere({ customer_id: '9' });
    expect(where[Op.and]).toEqual(expect.arrayContaining([{ customer_id: 9 }]));
  });

  test('text search matches name and phone', () => {
    const sequelize = { escape: (v) => `'${String(v).replace(/'/g, "''")}'` };
    const { where } = buildPipelineBoardWhere({ q: 'Dave' }, sequelize);
    const or = where[Op.and].find((c) => c[Op.or])[Op.or];
    expect(or.some((c) => c.val && /c\.name ILIKE '%Dave%'/.test(c.val))).toBe(true);
    const { where: phoneWhere } = buildPipelineBoardWhere({ q: '+44 7700 900100' }, sequelize);
    const phoneOr = phoneWhere[Op.and].find((c) => c[Op.or])[Op.or];
    expect(phoneOr.some((c) => c.val && /p.normalised = '07700900100'/.test(c.val))).toBe(true);
    expect(phoneOr.some((c) => c.val && /"Lead"\.customer_id/.test(c.val))).toBe(true);
  });
});

describe('pipeline value SQL (requirement 4.5)', () => {
  test('uses the latest sent or draft quote, not the sum of every revision', () => {
    expect(LATEST_QUOTE_SQL).toMatch(/q\.status IN \('sent','draft'\)/);
    expect(LATEST_QUOTE_SQL).toMatch(/ORDER BY q\.id DESC LIMIT 1/);
    expect(LATEST_QUOTE_SQL).not.toMatch(/SUM\(/);
    expect(LEAD_LATEST_QUOTE_SQL).toMatch(/q\.lead_id = "Lead"\.id/);
    expect(LEAD_LATEST_QUOTE_SQL).toMatch(/ORDER BY q\.id DESC LIMIT 1/);
    expect(PIPELINE_VALUE_SQL).toMatch(/^COALESCE\(/);
    expect(PIPELINE_VALUE_SQL).not.toMatch(/SUM\(/);
  });
});
