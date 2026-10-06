const { JOB_STATUSES, canAdvanceJobStatus, canUnscheduleJob } = require('../jobStatus');

describe('canAdvanceJobStatus (requirement 7.2)', () => {
  test('allows skip ahead and the same status', () => {
    expect(canAdvanceJobStatus('PENDING', 'COMPLETED')).toBe(true);
    expect(canAdvanceJobStatus('IN_PROGRESS', 'IN_PROGRESS')).toBe(true);
    expect(canAdvanceJobStatus('INVOICED', 'PAID')).toBe(true);
  });

  test('rejects moving backwards', () => {
    expect(canAdvanceJobStatus('COMPLETED', 'IN_PROGRESS')).toBe(false);
    expect(canAdvanceJobStatus('PAID', 'PENDING')).toBe(false);
    expect(canAdvanceJobStatus('SCHEDULED', 'PENDING')).toBe(false);
  });

  test('rejects an unknown target status', () => {
    expect(canAdvanceJobStatus('PENDING', 'CANCELLED')).toBe(false);
    expect(JOB_STATUSES).toContain('PENDING');
  });
});

describe('canUnscheduleJob', () => {
  test('allows scheduled and in-progress only', () => {
    expect(canUnscheduleJob('SCHEDULED')).toBe(true);
    expect(canUnscheduleJob('IN_PROGRESS')).toBe(true);
    expect(canUnscheduleJob('PENDING')).toBe(false);
    expect(canUnscheduleJob('COMPLETED')).toBe(false);
  });
});

const { parseJobPriority, JOB_PRIORITIES } = require('../jobStatus');

describe('parseJobPriority', () => {
  test('defaults missing values and accepts allowed ranks', () => {
    expect(parseJobPriority(undefined, { fallback: 'normal' })).toEqual({ value: 'normal' });
    expect(parseJobPriority('High')).toEqual({ value: 'high' });
    expect(JOB_PRIORITIES).toEqual(['low', 'normal', 'high', 'urgent']);
  });

  test('rejects unknown ranks', () => {
    expect(parseJobPriority('critical').error).toMatch(/low, normal, high, or urgent/i);
  });
});
