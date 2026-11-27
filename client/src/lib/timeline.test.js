import { describe, it, expect } from 'vitest';
import { TIMELINE_TYPES, TIMELINE_LABELS, timelineChannelLabel, timelineStatusLabel } from './timeline';

describe('timeline labels (requirement 2.3)', () => {
  it('lists the six required timeline types', () => {
    expect(TIMELINE_TYPES).toEqual(['message', 'call', 'note', 'quote', 'job', 'invoice']);
    for (const type of TIMELINE_TYPES) {
      expect(TIMELINE_LABELS[type]).toBeTruthy();
    }
  });

  it('labels WhatsApp vs email and sent vs failed', () => {
    expect(timelineChannelLabel({ type: 'message', meta: { channel: 'whatsapp' } })).toBe('WhatsApp');
    expect(timelineChannelLabel({ type: 'message', meta: { channel: 'email' } })).toBe('Email');
    expect(timelineChannelLabel({ type: 'message', meta: { channel: 'website' } })).toBe('Website');
    expect(timelineStatusLabel('sent')).toBe('Sent');
    expect(timelineStatusLabel('failed')).toBe('Failed');
    expect(timelineStatusLabel('simulated')).toBe('Not delivered');
    expect(timelineStatusLabel('received')).toBe('Received');
  });
});
