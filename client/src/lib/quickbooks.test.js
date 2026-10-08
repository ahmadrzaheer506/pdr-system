import { describe, it, expect } from 'vitest';
import { invoiceSentMessage, isLiveQboId } from './quickbooks.js';

describe('QuickBooks client helpers', () => {
  it('explains simulated vs live send', () => {
    expect(invoiceSentMessage({ qbo: { simulated: true } })).toMatch(/not connected/i);
    expect(invoiceSentMessage({ qbo: { qboId: '88', simulated: false } })).toMatch(/pushed to QuickBooks/i);
  });

  it('treats SIM ids as not live', () => {
    expect(isLiveQboId('SIM-INV-1')).toBe(false);
    expect(isLiveQboId('88')).toBe(true);
  });
});
