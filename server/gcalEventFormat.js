'use strict';

/**
 * Google Calendar event title, description and colour (requirement 16.3).
 * Google only accepts palette ids 1–11; Tomato (11) is the closest match to
 * brand red #dc1114. Every CRM entity gets an explicit colour so month-view
 * chips are never the unstyled default dot.
 */
const { visitTypeLabel } = require('./visitTypes');

const SOURCE_NAME = 'Paul Douglas Roofing';

/** Google Calendar event colour ids. */
const GCAL_COLOR = Object.freeze({
  appointment: '11',
  job: '9',
  task: '7',
  holiday: '6',
});

function formatClock(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Europe/London',
  });
}

/** Format a stored HH:MM (job start_time) without the server timezone shifting it. */
function formatClockFromHhmm(hhmm) {
  const [hStr, mStr] = String(hhmm || '').slice(0, 5).split(':');
  const hour = Number(hStr);
  const minute = Number(mStr);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return '';
  const mins = Number.isFinite(minute) ? minute : 0;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${String(mins).padStart(2, '0')} ${ampm}`;
}

function formatTimeRange(start, end) {
  const from = formatClock(start);
  const to = formatClock(end);
  if (from && to) return `${from} – ${to}`;
  return from || to || '';
}

function formatTimeRangeFromHhmm(startHhmm, endHhmm) {
  const from = formatClockFromHhmm(startHhmm);
  const to = formatClockFromHhmm(endHhmm);
  if (from && to) return `${from} – ${to}`;
  return from || to || '';
}

function formatDayRange(startIso, endIso) {
  const fmt = (iso) => {
    const [y, m, d] = String(iso || '').split('-').map(Number);
    if (!y || !m || !d) return '';
    const dt = new Date(Date.UTC(y, m - 1, d, 12));
    return dt.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  };
  const from = fmt(startIso);
  const to = fmt(endIso);
  if (from && to && from !== to) return `${from} – ${to}`;
  return from || to || '';
}

function prettyStatus(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const known = {
    booked: 'Booked',
    done: 'Completed',
    cancelled: 'Cancelled',
    pending: 'Pending',
    approved: 'Approved',
    declined: 'Declined',
    open: 'Open',
    PENDING: 'Pending',
    SCHEDULED: 'Scheduled',
    IN_PROGRESS: 'In progress',
    COMPLETED: 'Completed',
    INVOICED: 'Invoiced',
    PAID: 'Paid',
  };
  if (known[raw]) return known[raw];
  return raw
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
}

function eventTitle({ timeRange, typeLabel, reference }) {
  return [timeRange, typeLabel, reference].map((part) => String(part || '').trim()).filter(Boolean).join(' · ');
}

/**
 * Plain-text body shown in the Google event popup (same field layout as the
 * typical job-card calendar apps: source, time, type, status, reference, people, site).
 */
function eventDescription({
  time, type, status, reference, customer, assignees, location, notes, bookedBy,
} = {}) {
  const lines = [`Synced from ${SOURCE_NAME}`, ''];
  const rows = [
    ['Time', time],
    ['Type', type],
    ['Status', status],
    ['Reference', reference],
    ['Customer', customer],
    ['Assignees', assignees],
    ['Location', location],
    ['Booked by', bookedBy],
  ];
  for (const [label, value] of rows) {
    const text = String(value || '').trim();
    if (text) lines.push(`${label}: ${text}`);
  }
  const extra = String(notes || '').trim();
  if (extra) {
    lines.push('', extra);
  }
  return lines.join('\n').trim();
}

function appointmentTypeLabel(visitType) {
  return visitTypeLabel(visitType);
}

function joinNames(names) {
  return [...new Set((names || []).map((n) => String(n || '').trim()).filter(Boolean))].join(', ');
}

module.exports = {
  SOURCE_NAME,
  GCAL_COLOR,
  formatClock,
  formatClockFromHhmm,
  formatTimeRange,
  formatTimeRangeFromHhmm,
  formatDayRange,
  prettyStatus,
  eventTitle,
  eventDescription,
  appointmentTypeLabel,
  joinNames,
};
