import { describe, it, expect } from 'vitest';
import { leadDisplayName, leadSourceLabel } from './leads.js';

describe('leadSourceLabel', () => {
  it('uses office-facing channel names', () => {
    expect(leadSourceLabel('whatsapp')).toBe('WhatsApp');
    expect(leadSourceLabel('facebook_lead')).toBe('Facebook Lead');
    expect(leadSourceLabel('manual')).toBe('Manual');
    expect(leadSourceLabel('website')).toBe('Website');
  });
});

describe('leadDisplayName', () => {
  it('prefixes every lead with its L- ref like quotes and invoices', () => {
    expect(leadDisplayName({ customer_name: 'sah', ref: 'L-0001' })).toBe('L-0001 - sah');
    expect(leadDisplayName({ name: 'sah', ref: 'L-0002' })).toBe('L-0002 - sah');
    expect(leadDisplayName({ customer_name: 'Priya Nair' })).toBe('Priya Nair');
  });

  it('appends the website enquiry ref when stored on the lead', () => {
    expect(leadDisplayName({
      customer_name: 'sahil mubeen',
      ref: 'L-0005',
      meta: { external_ref: 'ENQ-261020-I1MQ' },
    })).toBe('L-0005 - sahil mubeen · ENQ-261020-I1MQ');
  });
});
