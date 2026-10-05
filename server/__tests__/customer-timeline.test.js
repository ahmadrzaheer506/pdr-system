const {
  TIMELINE_TYPES,
  messageType,
  activityType,
  buildCustomerTimeline,
} = require('../customerTimeline');

describe('customer timeline (requirement 2.3)', () => {
  test('exposes the six timeline types from the requirement', () => {
    expect(TIMELINE_TYPES).toEqual(['message', 'call', 'note', 'quote', 'job', 'invoice']);
  });

  test('maps message channels to message, call, or note', () => {
    expect(messageType('whatsapp')).toBe('message');
    expect(messageType('email')).toBe('message');
    expect(messageType('phone')).toBe('call');
    expect(messageType('sms')).toBe('call');
    expect(messageType('note')).toBe('note');
  });

  test('maps activity rows to quote, job, or invoice only', () => {
    expect(activityType({ kind: 'quote_created', entity_type: 'quote' })).toBe('quote');
    expect(activityType({ kind: 'job_status', entity_type: 'job' })).toBe('job');
    expect(activityType({ kind: 'invoice_sent', entity_type: 'invoice' })).toBe('invoice');
    expect(activityType({ kind: 'quote_accepted', entity_type: 'job' })).toBe('quote');
    expect(activityType({ kind: 'stage_change' })).toBeNull();
    expect(activityType({ kind: 'appointment_booked', entity_type: 'appointment' })).toBeNull();
    expect(activityType({ kind: 'inbound' })).toBeNull();
  });

  test('buildCustomerTimeline merges and sorts chronologically', () => {
    const timeline = buildCustomerTimeline(
      [
        { id: 1, channel: 'whatsapp', body: 'Hi', direction: 'in', status: 'received', created_at: '2026-01-02T10:00:00Z', user_name: null },
        { id: 2, channel: 'phone', body: 'Called about leak', direction: 'in', status: 'logged', created_at: '2026-01-01T09:00:00Z', user_name: 'Lisa' },
        { id: 3, channel: 'note', body: 'Internal note', direction: 'out', status: 'logged', created_at: '2026-01-03T11:00:00Z', user_name: 'Paul' },
      ],
      [
        { id: 10, kind: 'quote_created', entity_type: 'quote', entity_id: 5, detail: 'Quote Q-1 created — £1,200.00', created_at: '2026-01-02T12:00:00Z', user_name: 'Lisa' },
        { id: 11, kind: 'job_created', entity_type: 'job', entity_id: 7, detail: 'Job "Re-roof" created', created_at: '2026-01-04T08:00:00Z', user_name: 'Lisa' },
        { id: 12, kind: 'invoice_created', entity_type: 'invoice', entity_id: 3, detail: 'Invoice INV-1 created — £1,200.00', created_at: '2026-01-05T09:00:00Z', user_name: 'Lisa' },
        { id: 13, kind: 'stage_change', detail: 'Stage moved', created_at: '2026-01-06T09:00:00Z', user_name: null },
      ],
    );

    expect(timeline.map((t) => t.type)).toEqual(['call', 'message', 'quote', 'note', 'job', 'invoice']);
    expect(timeline.find((t) => t.type === 'call').summary).toMatch(/leak/);
    expect(timeline.find((t) => t.type === 'quote').summary).toMatch(/Q-1/);
    expect(timeline.some((t) => t.type === 'message' && t.id === 'message-1')).toBe(true);
    expect(timeline.some((t) => t.id === 'activity-13')).toBe(false);
  });

  test('conversationMessages drops internal notes from the conversation feed (requirement 2.4)', () => {
    const { conversationMessages } = require('../customerTimeline');
    const kept = conversationMessages([
      { id: 1, channel: 'whatsapp', body: 'Hi' },
      { id: 2, channel: 'note', body: 'Internal' },
      { id: 3, channel: 'email', body: 'Quote attached' },
    ]);
    expect(kept.map((m) => m.id)).toEqual([1, 3]);
  });
});
