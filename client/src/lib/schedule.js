/** Calendar helpers for the office schedule board (requirement 8.1). */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseIsoDate(raw) {
  if (raw === undefined || raw === null || raw === '') return '';
  const text = String(raw).trim().slice(0, 10);
  return ISO_DATE.test(text) ? text : '';
}

export function localIsoDate(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addIsoDays(iso, n) {
  const [year, month, day] = parseIsoDate(iso).split('-').map(Number);
  const dt = new Date(year, month - 1, day + n);
  return localIsoDate(dt);
}

export function datesInRange(start, end) {
  const from = parseIsoDate(start);
  const to = parseIsoDate(end) || from;
  if (!from || !to || to < from) return [];
  const dates = [];
  for (let cur = from; cur <= to; cur = addIsoDays(cur, 1)) dates.push(cur);
  return dates;
}

export function startOfWeekMonday(d) {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

export function jobOnDate(job, iso) {
  const day = parseIsoDate(iso);
  const start = parseIsoDate(job?.start_date);
  const end = parseIsoDate(job?.end_date) || start;
  return !!(day && start && start <= day && end >= day);
}

/**
 * Job start/end to apply when saving crew on iso. Null means the day is
 * already on the job. A one-day job is moved; a range is expanded.
 */
export function jobDatesForCrewDay(job, iso) {
  const day = parseIsoDate(iso);
  if (!day) return null;
  const start = parseIsoDate(job?.start_date);
  const end = parseIsoDate(job?.end_date) || start;
  if (start && end && day >= start && day <= end) return null;
  if (!start || start === end) return { start_date: day, end_date: day };
  return {
    start_date: day < start ? day : start,
    end_date: day > end ? day : end,
  };
}

export function crewForDate(job, iso) {
  const day = parseIsoDate(iso);
  return (job?.day_assignments || []).filter((s) => parseIsoDate(s.work_date) === day);
}

export function crewIdsForDate(job, iso) {
  return crewForDate(job, iso).map((s) => s.user_id);
}

function dateSlice(value) {
  return String(value || '').slice(0, 10);
}

/** Approved holiday rows covering iso (pending requests must not be passed in). */
export function holidaysOnDate(holidays, iso) {
  const day = parseIsoDate(iso);
  if (!day) return [];
  return (holidays || []).filter((h) => {
    const start = dateSlice(h.start_date);
    const end = dateSlice(h.end_date);
    return start && start <= day && end >= day;
  });
}

export function isOnHoliday(holidays, userId, iso) {
  const uid = Number(userId);
  return holidaysOnDate(holidays, iso).some((h) => Number(h.user_id) === uid);
}

/** Flatten per-day crew slots from schedule jobs into overlay bookings. */
export function bookingsFromJobs(jobs, iso) {
  const day = parseIsoDate(iso);
  const rows = [];
  for (const job of jobs || []) {
    for (const slot of crewForDate(job, day)) {
      rows.push({
        user_id: slot.user_id,
        name: slot.name || null,
        job_id: job.id,
        job_title: job.title || null,
        work_date: day,
      });
    }
  }
  return rows;
}

function bookingKey(row) {
  return `${Number(row?.user_id)}-${Number(row?.job_id ?? 0)}-${parseIsoDate(row?.work_date)}`;
}

/** Combine calendar jobs with the availability overlay without duplicate slots. */
export function mergeCrewBookings(...lists) {
  const seen = new Set();
  const rows = [];
  for (const list of lists) {
    for (const row of list || []) {
      const key = bookingKey(row);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  }
  return rows;
}

const AVAIL_ORDER = { available: 0, busy: 1, holiday: 2 };

/** Staff rows for the schedule "Team availability today" board. */
export function teamAvailabilityRows(staff, holidays, jobs, iso) {
  const day = parseIsoDate(iso) || localIsoDate();
  const bookings = bookingsFromJobs(jobs, day);
  return (staff || []).map((person) => {
    const onHoliday = isOnHoliday(holidays, person.id, day);
    const jobsOn = bookings.filter((b) => b.user_id === person.id);
    const uniqueJobs = [];
    const seen = new Set();
    for (const row of jobsOn) {
      const key = row.job_id ?? row.job_title;
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueJobs.push(row);
    }
    const status = onHoliday ? 'holiday' : uniqueJobs.length ? 'busy' : 'available';
    return { person, status, jobs: uniqueJobs };
  }).sort((a, b) => {
    const byStatus = AVAIL_ORDER[a.status] - AVAIL_ORDER[b.status];
    if (byStatus) return byStatus;
    return String(a.person.name || '').localeCompare(String(b.person.name || ''));
  });
}

/**
 * Holiday / other-job flags for one person on one date.
 * Same job (excludeJobId) is not treated as a double-book.
 */
export function staffDayFlags({ holidays = [], bookings = [], userId, iso, excludeJobId }) {
  const day = parseIsoDate(iso);
  const uid = Number(userId);
  const skipJob = excludeJobId == null || excludeJobId === '' ? null : Number(excludeJobId);
  const onHoliday = isOnHoliday(holidays, uid, day);
  const busyOn = (bookings || []).filter((b) => (
    Number(b.user_id) === uid
    && parseIsoDate(b.work_date) === day
    && (skipJob == null || Number(b.job_id) !== skipJob)
  ));
  return { onHoliday, busyOn };
}

export function crewConflictLabel({ onHoliday, busyOn }) {
  if (onHoliday) return 'holiday';
  if (busyOn.length) return 'booked';
  return '';
}

export function jobConflictCaption(crew, { holidays = [], bookings = [], iso, excludeJobId } = {}) {
  let holiday = false;
  let booked = false;
  for (const member of crew || []) {
    const flags = staffDayFlags({
      holidays, bookings, userId: member.user_id, iso, excludeJobId,
    });
    if (flags.onHoliday) holiday = true;
    if (flags.busyOn.length) booked = true;
  }
  if (holiday && booked) return 'Holiday or already booked';
  if (holiday) return 'On holiday';
  if (booked) return 'Already booked';
  return '';
}

/**
 * Holiday / other-job conflicts for a crew save. Empty means save can go straight through.
 */
export function crewSaveConflicts({
  staff = [], selectedIds = [], holidays = [], bookings = [], iso, excludeJobId,
} = {}) {
  const nameOf = (id) => (staff.find((row) => Number(row.id) === Number(id))?.name) || `User ${id}`;
  const rows = [];
  for (const id of selectedIds || []) {
    const { onHoliday, busyOn } = staffDayFlags({
      holidays, bookings, userId: id, iso, excludeJobId,
    });
    if (onHoliday) {
      rows.push({
        user_id: id,
        type: 'holiday',
        name: nameOf(id),
        detail: 'On approved holiday',
      });
    }
    for (const booking of busyOn) {
      rows.push({
        user_id: id,
        type: 'double_book',
        name: nameOf(id),
        job_id: booking.job_id,
        job_title: booking.job_title || null,
        detail: booking.job_title ? `Already on “${booking.job_title}”` : 'Already booked that day',
      });
    }
  }
  return rows;
}

/** Readable line for a holiday / double-book row (job modal + day view). */
export function crewConflictSummaryLine(row) {
  const name = row?.name || `User ${row?.user_id}`;
  if (row?.type === 'holiday') return `${name} is on holiday this day.`;
  if (row?.job_title) return `${name} is already booked on “${row.job_title}”.`;
  const fromDetail = String(row?.detail || '').match(/Already on [“"](.+)[”"]/);
  if (fromDetail) return `${name} is already booked on “${fromDetail[1]}”.`;
  return `${name} is already booked this day.`;
}

export function proposalCrewConflicts(assignments, staff = [], jobs = []) {
  const rows = [];
  for (const assignment of assignments || []) {
    const jobTitle = jobs.find((job) => Number(job.id) === Number(assignment.job_id))?.title;
    for (const uid of assignment.user_ids || []) {
      const person = staff.find((row) => Number(row.id) === Number(uid));
      if (!person) continue;
      if (person.on_holiday) {
        rows.push({
          user_id: person.id,
          type: 'holiday',
          name: person.name,
          detail: jobTitle ? `On holiday — ${jobTitle}` : 'On approved holiday',
        });
      }
      if ((person.busy_on || []).length) {
        rows.push({
          user_id: person.id,
          type: 'double_book',
          name: person.name,
          detail: jobTitle ? `Already booked — ${jobTitle}` : 'Already booked that day',
        });
      }
    }
  }
  return rows;
}
