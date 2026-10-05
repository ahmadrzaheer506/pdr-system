'use strict';

const { csvEscape, toCsv, isoDay } = require('../csv');

describe('csv helpers (requirement 14.2)', () => {
  test('escapes quotes, commas, and newlines', () => {
    expect(csvEscape(null)).toBe('');
    expect(csvEscape(12)).toBe('12');
    expect(csvEscape('plain')).toBe('plain');
    expect(csvEscape('say "hello"')).toBe('"say ""hello"""');
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('line\nbreak')).toBe('"line\nbreak"');
  });

  test('joins a header and rows with CRLF', () => {
    const csv = toCsv(['name', 'count'], [['Helen, "A"', 2]]);
    expect(csv).toBe('name,count\r\n"Helen, ""A""",2\r\n');
  });

  test('isoDay keeps YYYY-MM-DD', () => {
    expect(isoDay('2026-09-12T10:00:00.000Z')).toBe('2026-09-12');
    expect(isoDay(null)).toBe('');
  });
});
