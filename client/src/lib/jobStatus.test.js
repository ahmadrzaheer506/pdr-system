import { describe, it, expect } from 'vitest';
import { JOB_STATUSES, canAdvanceJobStatus, canUnscheduleJob, JOB_PRIORITIES } from './jobStatus';

describe('canAdvanceJobStatus (requirement 7.2)', () => {
  it('allows skip ahead and rejects going back', () => {
    expect(canAdvanceJobStatus('PENDING', 'PAID')).toBe(true);
    expect(canAdvanceJobStatus('COMPLETED', 'IN_PROGRESS')).toBe(false);
    expect(JOB_STATUSES[0]).toBe('PENDING');
  });
});

describe('canUnscheduleJob', () => {
  it('allows scheduled and in-progress only', () => {
    expect(canUnscheduleJob('SCHEDULED')).toBe(true);
    expect(canUnscheduleJob('IN_PROGRESS')).toBe(true);
    expect(canUnscheduleJob('PENDING')).toBe(false);
    expect(canUnscheduleJob('COMPLETED')).toBe(false);
  });
});

describe('JOB_PRIORITIES', () => {
  it('starts at normal in the allowed list', () => {
    expect(JOB_PRIORITIES).toEqual(['low', 'normal', 'high', 'urgent']);
  });
});
