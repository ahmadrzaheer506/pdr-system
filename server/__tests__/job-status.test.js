const { JOB_STATUSES, canAdvanceJobStatus } = require('../jobStatus');

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
