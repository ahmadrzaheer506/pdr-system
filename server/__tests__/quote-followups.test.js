const { parseFollowups, stepBody, defaultFollowups } = require('../quoteFollowups');

describe('parseFollowups (requirement 12.1)', () => {
  test('accepts on/off, delay from send, channel, and a body per step', () => {
    const parsed = parseFollowups({
      enabled: true,
      email_subject: 'Re {ref}',
      steps: [
        { delay_days: 2, channel: 'whatsapp', body: 'Hi {name} — {ref}' },
        { delay_days: 5, channel: 'email', body: 'Checking in on {title}' },
      ],
    });
    expect(parsed.value).toEqual({
      enabled: true,
      email_subject: 'Re {ref}',
      steps: [
        { delay_days: 2, channel: 'whatsapp', body: 'Hi {name} — {ref}' },
        { delay_days: 5, channel: 'email', body: 'Checking in on {title}' },
      ],
    });
  });

  test('rejects a missing body, a bad channel, and a fractional delay', () => {
    expect(parseFollowups({ enabled: true, steps: [{ delay_days: 2, channel: 'whatsapp', body: '' }] }).error)
      .toMatch(/body template is required/);
    expect(parseFollowups({ enabled: true, steps: [{ delay_days: 2, channel: 'sms', body: 'Hi' }] }).error)
      .toMatch(/WhatsApp or email/);
    expect(parseFollowups({ enabled: true, steps: [{ delay_days: 1.5, channel: 'email', body: 'Hi' }] }).error)
      .toMatch(/whole number of days/);
  });

  test('uses Company step body only — empty body is skipped, no Templates fallback', () => {
    expect(stepBody({ body: 'Custom' })).toBe('Custom');
    expect(stepBody({ body: '  ' })).toBe('');
    expect(stepBody({})).toBe('');
    expect(stepBody(undefined)).toBe('');
  });

  test('defaultFollowups ships two steps with bodies', () => {
    const d = defaultFollowups();
    expect(d.enabled).toBe(true);
    expect(d.steps).toHaveLength(2);
    expect(d.steps.every((s) => s.body && s.delay_days >= 0)).toBe(true);
  });
});
