const { normaliseExtras, extrasTotal, pickAcceptedExtras, jobValueFromQuote } = require('../quoteExtras');

describe('quote extras (requirement 6.5)', () => {
  test('normalises and totals extra lines', () => {
    expect(normaliseExtras([
      { description: ' Velux ', amount: '640' },
      { description: '', amount: 0 },
    ])).toEqual([{ description: 'Velux', amount: 640 }]);
    expect(extrasTotal([{ description: 'A', amount: 100 }, { description: 'B', amount: 50.5 }])).toBe(150.5);
  });

  test('picks accepted extras by unique index', () => {
    const listed = [{ description: 'Velux', amount: 640 }, { description: 'Cowl', amount: 45 }];
    expect(pickAcceptedExtras(listed, [1]).extras).toEqual([{ description: 'Cowl', amount: 45 }]);
    expect(pickAcceptedExtras(listed, null).extras).toEqual([]);
    expect(pickAcceptedExtras(listed, [0, 0]).error).toMatch(/unique indexes/);
    expect(pickAcceptedExtras(listed, [9]).error).toMatch(/unique indexes/);
  });

  test('job value is works total plus ticked extras', () => {
    expect(jobValueFromQuote({ total: 1200 }, [{ description: 'Velux', amount: 640 }])).toBe(1840);
    expect(jobValueFromQuote({ total: 1200 }, [])).toBe(1200);
  });
});
