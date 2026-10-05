const { parseLostReason, LOST_REASON_VALUES } = require('../lostReason');

describe('lost reasons (requirement 2.6)', () => {
  test('the pick-list is cheaper quote, no response, out of area, other', () => {
    expect(LOST_REASON_VALUES).toEqual(['cheaper_quote', 'no_response', 'out_of_area', 'other']);
  });

  test('requires a known code', () => {
    expect(parseLostReason({}).error).toBe('Select a lost reason');
    expect(parseLostReason({ lost_reason_code: 'too_expensive' }).error).toBe('Select a lost reason');
  });

  test('stores the display label; Other may add a note', () => {
    expect(parseLostReason({ lost_reason_code: 'no_response' }).lost_reason).toBe('No response');
    expect(parseLostReason({ lost_reason_code: 'out_of_area', lost_reason_note: 'ignored' }).lost_reason)
      .toBe('Out of area');
    expect(parseLostReason({ lost_reason_code: 'other' }).lost_reason).toBe('Other');
    expect(parseLostReason({ lost_reason_code: 'other', lost_reason_note: '  Neighbour  ' }).lost_reason)
      .toBe('Other — Neighbour');
  });
});
