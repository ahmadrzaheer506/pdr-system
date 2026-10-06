import { describe, it, expect } from 'vitest';
import { leadDisplayName, leadSourceLabel } from './leads.js';

describe('leadSourceLabel', () => {
  it('uses office-facing channel names', () => {
    expect(leadSourceLabel('whatsapp')).toBe('WhatsApp');
    expect(leadSourceLabel('facebook_lead')).toBe('Facebook Lead');
    expect(leadSourceLabel('manual')).toBe('Manual');
  });
});

describe('leadDisplayName', () => {
  it('prefixes every lead with its L- ref like quotes and invoices', () => {
    expect(leadDisplayName({ customer_name: 'sah', ref: 'L-0001' })).toBe('L-0001 - sah');
    expect(leadDisplayName({ name: 'sah', ref: 'L-0002' })).toBe('L-0002 - sah');
    expect(leadDisplayName({ customer_name: 'Priya Nair' })).toBe('Priya Nair');
  });
});
