function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Format a clock-in/out instant as local HH:MM.
 * API timestamps are UTC ISO strings; slicing characters 11–16 would show UTC.
 */
export function formatClockTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    const raw = String(value).slice(11, 16);
    return /^\d{2}:\d{2}$/.test(raw) ? raw : '';
  }
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
