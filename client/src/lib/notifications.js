import { formatDistanceToNow } from 'date-fns';

/** Relative time for the notification drawer (requirement 13.1). */
export function formatNotificationTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return formatDistanceToNow(date, { addSuffix: true });
}

export function unreadBadgeLabel(count) {
  const n = Number(count) || 0;
  if (n <= 0) return '';
  if (n > 99) return '99+';
  return String(n);
}
