import { describe, it, expect } from 'vitest';
import { unreadBadgeLabel, formatNotificationTime } from './notifications.js';

describe('notification helpers (requirement 13.1)', () => {
  it('caps the unread badge at 99+', () => {
    expect(unreadBadgeLabel(0)).toBe('');
    expect(unreadBadgeLabel(2)).toBe('2');
    expect(unreadBadgeLabel(100)).toBe('99+');
  });

  it('formats a created_at timestamp relatively', () => {
    const stamp = new Date(Date.now() - 60 * 1000).toISOString();
    expect(formatNotificationTime(stamp)).toMatch(/ago/);
  });
});
