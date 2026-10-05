import { describe, it, expect } from 'vitest';
import { JOB_STATUSES, canAdvanceJobStatus } from './jobStatus';

describe('canAdvanceJobStatus (requirement 7.2)', () => {
  it('allows skip ahead and rejects going back', () => {
    expect(canAdvanceJobStatus('PENDING', 'PAID')).toBe(true);
    expect(canAdvanceJobStatus('COMPLETED', 'IN_PROGRESS')).toBe(false);
    expect(JOB_STATUSES[0]).toBe('PENDING');
  });
});
