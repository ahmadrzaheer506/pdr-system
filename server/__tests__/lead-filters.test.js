const { Op } = require('sequelize');
const { buildLeadListWhere, inboxTabCounts } = require('../leadFilters');

const sequelize = {
  escape: (v) => `'${String(v).replace(/'/g, "''")}'`,
};

describe('buildLeadListWhere', () => {
  test('status-only keeps a simple where so the inbox default is unchanged', () => {
    expect(buildLeadListWhere({ status: 'NEW' }, sequelize).where).toEqual({ status: 'NEW' });
    expect(buildLeadListWhere({ status: 'ALL' }, sequelize).where).toEqual({});
  });

  test('applies source, created-date range, and name search together', () => {
    const { where } = buildLeadListWhere({
      status: 'NEW',
      source: 'whatsapp',
      q: 'Dave',
      created_from: '2026-09-01',
      created_to: '2026-09-22',
    }, sequelize);
    const and = where[Op.and];
    expect(and).toEqual(expect.arrayContaining([
      { status: 'NEW' },
      { source: 'whatsapp' },
      { created_at: { [Op.gte]: '2026-09-01T00:00:00.000Z', [Op.lte]: '2026-09-22T23:59:59.999Z' } },
    ]));
    const text = and.find((c) => c[Op.or]);
    expect(text[Op.or].some((c) => c.message)).toBe(true);
    expect(text[Op.or].some((c) => c.val && /customers c/.test(c.val) && /Dave/.test(c.val))).toBe(true);
  });

  test('count where can omit status so tab totals follow the other filters', () => {
    const { where } = buildLeadListWhere({ status: 'NEW', source: 'phone' }, sequelize, { includeStatus: false });
    expect(where).toEqual({ source: 'phone' });
  });

  test('rejects invalid dates', () => {
    expect(buildLeadListWhere({ created_from: '22-09-2026' }, sequelize).error).toBe('Invalid created_from date');
  });

  test('Converted and Closed inbox tabs list WON and LOST leads', () => {
    expect(buildLeadListWhere({ status: 'CONVERTED' }, sequelize).where).toEqual({ stage: 'WON' });
    expect(buildLeadListWhere({ status: 'CLOSED' }, sequelize).where).toEqual({ stage: 'LOST' });
  });

  test('inbox tab counts put WON on Converted and LOST on Closed', () => {
    expect(inboxTabCounts([
      { status: 'NEW', stage: 'ENQUIRY', c: 2 },
      { status: 'ACTIONED', stage: 'QUOTED', c: 3 },
      { status: 'CONVERTED', stage: 'WON', c: 4 },
      { status: 'CONVERTED', stage: 'SCHEDULED', c: 5 },
      { status: 'CLOSED', stage: 'LOST', c: 6 },
    ])).toEqual({ NEW: 2, ACTIONED: 3, CONVERTED: 4, CLOSED: 6, ALL: 20 });
  });
});
