const { parseVisitType, visitChangeBlock, visitTitle } = require('../visitTypes');

describe('visitTypes (requirement 5.3)', () => {
  test('requires a known type when booking', () => {
    expect(parseVisitType('', { required: true }).error).toBe('Select a visit type');
    expect(parseVisitType('inspection').error).toBe('Invalid visit type');
    expect(parseVisitType('measure')).toEqual({ value: 'measure' });
    expect(parseVisitType(undefined).skip).toBe(true);
    expect(visitTitle('follow_up', 'Dave')).toBe('Follow-up — Dave');
  });

  test('blocks changes after the visit has ended or is not booked', () => {
    const now = new Date('2026-09-23T12:00:00.000Z');
    expect(visitChangeBlock({ status: 'booked', end: '2026-10-10T10:00:00.000Z' }, now)).toBeNull();
    expect(visitChangeBlock({ status: 'booked', end: '2026-01-01T10:00:00.000Z' }, now).error)
      .toBe('This visit has already ended');
    expect(visitChangeBlock({ status: 'cancelled', end: '2026-10-10T10:00:00.000Z' }, now).error)
      .toBe('Only a booked visit can be changed');
  });
});
