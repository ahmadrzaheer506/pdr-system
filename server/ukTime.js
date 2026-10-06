'use strict';

/** Business calendar for reports and the home dashboard. */
const REPORT_TZ = 'Europe/London';

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

function ymdInZone(date = new Date(), timeZone = REPORT_TZ) {
  const p = partsInZone(date, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

function addCalendarDays(iso, days) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + Number(days)));
  return `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}`;
}

/**
 * Wall-clock time in `timeZone` as a UTC Date.
 * @param {string} isoDate YYYY-MM-DD
 */
function zonedWallTime(isoDate, hour, minute, second, ms, timeZone = REPORT_TZ) {
  const desired = `${isoDate}T${pad(hour)}:${pad(minute)}:${pad(second)}`;
  let utc = Date.parse(`${desired}.000Z`);
  if (Number.isNaN(utc)) return null;
  for (let i = 0; i < 4; i += 1) {
    const p = partsInZone(new Date(utc), timeZone);
    const got = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
    const delta = Date.parse(`${desired}Z`) - Date.parse(`${got}Z`);
    utc += delta;
    if (delta === 0) break;
  }
  return new Date(utc + (ms || 0));
}

function zoneDayStart(isoDate, timeZone = REPORT_TZ) {
  return zonedWallTime(isoDate, 0, 0, 0, 0, timeZone);
}

function zoneDayEnd(isoDate, timeZone = REPORT_TZ) {
  return zonedWallTime(isoDate, 23, 59, 59, 999, timeZone);
}

module.exports = {
  REPORT_TZ,
  ymdInZone,
  addCalendarDays,
  zoneDayStart,
  zoneDayEnd,
};
