import { describe, it, expect } from 'vitest';
import { leadSourceLabel } from './leads.js';

describe('leadSourceLabel', () => {
  it('uses office-facing channel names', () => {
    expect(leadSourceLabel('whatsapp')).toBe('WhatsApp');
    expect(leadSourceLabel('facebook_lead')).toBe('Facebook Lead');
    expect(leadSourceLabel('manual')).toBe('Manual');
  });
});
