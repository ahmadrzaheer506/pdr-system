/** Business calendar for reports and the home dashboard. */
export const REPORT_TZ = 'Europe/London';

function pad(n, width = 2) {
  return String(n).padStart(width, '0');
}

function partsInZone(date, timeZone = REPORT_TZ) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const map = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }
  return map;
}

export function ymdInZone(date = new Date(), timeZone = REPORT_TZ) {
  const p = partsInZone(date, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

export function addCalendarDays(iso, days) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + Number(days)));
  return `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}`;
}
