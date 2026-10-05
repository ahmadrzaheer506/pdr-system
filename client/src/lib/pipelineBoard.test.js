import { describe, it, expect } from 'vitest';
import { stallLevel, sumPipelineTotals, VALUE_STAGES } from './pipelineBoard.js';

const NOW = new Date('2026-09-23T12:00:00.000Z');

function daysAgo(n) {
  return new Date(NOW.getTime() - n * 86400000).toISOString();
}

describe('stallLevel (requirement 4.5)', () => {
  it('is amber at 7 days and red at 14, and ignores Lost and Paid', () => {
    expect(stallLevel(daysAgo(6.9), 'ENQUIRY', NOW)).toBeNull();
    expect(stallLevel(daysAgo(7), 'QUOTED', NOW)).toBe('amber');
    expect(stallLevel(daysAgo(13.9), 'FOLLOW_UP', NOW)).toBe('amber');
    expect(stallLevel(daysAgo(14), 'WON', NOW)).toBe('red');
    expect(stallLevel(daysAgo(20), 'LOST', NOW)).toBeNull();
    expect(stallLevel(daysAgo(20), 'PAID', NOW)).toBeNull();
  });
});

describe('sumPipelineTotals (requirement 4.5)', () => {
  it('totals Enquiry → Follow-up only', () => {
    const totals = sumPipelineTotals({
      ENQUIRY: [{ pipeline_value: 100 }],
      PAID: [{ pipeline_value: 999 }],
    }, VALUE_STAGES.concat(['WON', 'PAID']));
    expect(totals.board).toBe(100);
    expect(totals.byStage.ENQUIRY).toBe(100);
    expect(totals.byStage.PAID).toBeNull();
  });
});
