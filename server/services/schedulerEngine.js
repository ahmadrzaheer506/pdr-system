// ============================================================
// Scheduling engine (PRD §11.1 support layer):
//  - buildContext(date): everything the AI (or rule engine) needs
//  - ruleSchedule(): deterministic fallback that works with NO
//    AI key — greedy assignment respecting drivers, skills,
//    holidays, and no double-booking
//  - validateProposal(): server-side hard-constraint validation
//    applied to EVERY proposal (LLM or rule-based) before Paul
//    sees it — the PRD's "no double-booking / no unqualified /
//    no on-holiday assignment" guarantee.
// ============================================================
const { db, pj } = require('../db');

function buildContext(forDate) {
  const staff = db
    .prepare("SELECT id, name, skills, is_driver, color FROM users WHERE role = 'STAFF' AND active = 1")
    .all()
    .map((s) => ({ ...s, skills: pj(s.skills, []), is_driver: !!s.is_driver }));

  const holidayRows = db
    .prepare(
      `SELECT user_id FROM holiday_requests
       WHERE status = 'approved' AND date(start_date) <= date(?) AND date(end_date) >= date(?)`
    )
    .all(forDate, forDate);
  const onHoliday = new Set(holidayRows.map((r) => r.user_id));

  const unscheduledJobs = db
    .prepare(
      `SELECT j.id, j.title, j.description, j.address, j.priority, j.required_skills, j.materials,
              j.start_date, j.end_date, j.start_time, j.end_time, j.status, c.name AS customer_name
       FROM jobs j JOIN customers c ON c.id = j.customer_id
       WHERE j.status = 'PENDING'
       ORDER BY CASE j.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, j.created_at`
    )
    .all()
    .map((jb) => ({ ...jb, required_skills: pj(jb.required_skills, []) }));

  const scheduledThatDay = db
    .prepare(
      `SELECT j.id, j.title, j.start_time, j.end_time, j.priority, j.address, c.name AS customer_name
       FROM jobs j JOIN customers c ON c.id = j.customer_id
       WHERE j.status IN ('SCHEDULED','IN_PROGRESS')
         AND date(j.start_date) <= date(?) AND date(COALESCE(j.end_date, j.start_date)) >= date(?)`
    )
    .all(forDate, forDate);

  const assignmentRows = db
    .prepare(
      `SELECT ja.job_id, ja.user_id FROM job_assignments ja
       JOIN jobs j ON j.id = ja.job_id
       WHERE j.status IN ('SCHEDULED','IN_PROGRESS')
         AND date(j.start_date) <= date(?) AND date(COALESCE(j.end_date, j.start_date)) >= date(?)`
    )
    .all(forDate, forDate);
  const busy = new Map(); // user_id -> [job_id]
  for (const r of assignmentRows) {
    if (!busy.has(r.user_id)) busy.set(r.user_id, []);
    busy.get(r.user_id).push(r.job_id);
  }
  for (const jb of scheduledThatDay) {
    jb.assigned = assignmentRows.filter((r) => r.job_id === jb.id).map((r) => r.user_id);
  }

  return {
    forDate,
    staff: staff.map((s) => ({
      ...s,
      on_holiday: onHoliday.has(s.id),
      busy_on: busy.get(s.id) || [],
      available: !onHoliday.has(s.id) && !(busy.get(s.id) || []).length,
    })),
    unscheduledJobs,
    scheduledThatDay,
  };
}

/** Very light transcript parsing for the no-AI fallback. */
function parseTranscriptHints(transcript, context) {
  const hints = { unavailable: new Set(), priorityJobIds: new Set() };
  if (!transcript) return hints;
  const t = transcript.toLowerCase();
  for (const s of context.staff) {
    const first = s.name.split(' ')[0].toLowerCase();
    const re = new RegExp(`${first}[^.]{0,30}(off|sick|away|not in|holiday|unavailable|can't make|cannot make)|(?:without|minus)\\s+${first}`);
    if (re.test(t)) hints.unavailable.add(s.id);
  }
  for (const jb of context.unscheduledJobs) {
    const words = jb.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const custFirst = (jb.customer_name || '').split(' ')[0].toLowerCase();
    const mentioned = words.some((w) => t.includes(w)) || (custFirst.length > 3 && t.includes(custFirst));
    if (mentioned && /(priority|first|urgent|must|important)/.test(t)) hints.priorityJobIds.add(jb.id);
  }
  return hints;
}

/**
 * Deterministic fallback scheduler. Same output shape as the LLM path:
 * { assignments: [{job_id, user_ids, start_time, end_time, note}], unassigned: [{job_id, reason}], summary }
 */
function ruleSchedule(context, transcript = '') {
  const hints = parseTranscriptHints(transcript, context);
  const pool = context.staff.filter((s) => s.available && !hints.unavailable.has(s.id));
  const jobs = [...context.unscheduledJobs].sort((a, b) => {
    const pa = hints.priorityJobIds.has(a.id) ? -1 : ['urgent', 'high', 'normal', 'low'].indexOf(a.priority);
    const pb = hints.priorityJobIds.has(b.id) ? -1 : ['urgent', 'high', 'normal', 'low'].indexOf(b.priority);
    return pa - pb;
  });

  const taken = new Set();
  const assignments = [];
  const unassigned = [];
  const free = () => pool.filter((s) => !taken.has(s.id));

  // Aim to spread the workforce across jobs: base team size
  const teamSize = Math.max(1, Math.min(3, Math.floor(pool.length / Math.max(1, jobs.length)) || 1));

  for (const jb of jobs) {
    const team = [];
    const notes = [];
    // 1. cover each required skill
    for (const skill of jb.required_skills) {
      if (team.some((m) => m.skills.includes(skill))) continue;
      const match = free().find((s) => s.skills.includes(skill) && !team.includes(s));
      if (match) {
        team.push(match);
        taken.add(match.id);
      } else {
        notes.push(`no available staff with skill "${skill}"`);
      }
    }
    // 2. ensure a driver on the team
    if (!team.some((m) => m.is_driver)) {
      const driver = free().find((s) => s.is_driver);
      if (driver) {
        team.push(driver);
        taken.add(driver.id);
      } else if (team.length) {
        notes.push('no driver available for this team');
      }
    }
    // 3. top up to target size with anyone left
    while (team.length < teamSize && free().length) {
      const next = free()[0];
      team.push(next);
      taken.add(next.id);
    }
    if (!team.length) {
      unassigned.push({ job_id: jb.id, reason: 'No staff left available for this date' });
      continue;
    }
    assignments.push({
      job_id: jb.id,
      user_ids: team.map((m) => m.id),
      start_time: jb.start_time || '08:00',
      end_time: jb.end_time || '16:30',
      note: notes.join('; ') || null,
    });
  }

  const summary =
    `Rule-based proposal for ${context.forDate}: ${assignments.length} job(s) staffed from ${pool.length} available` +
    (hints.unavailable.size ? `, excluding ${hints.unavailable.size} marked unavailable in your instructions` : '') +
    `.${unassigned.length ? ` ${unassigned.length} job(s) could not be staffed.` : ''}` +
    ' (Built-in scheduler — add an AI key for smarter free-text handling.)';

  return { assignments, unassigned, summary };
}

/**
 * Hard-constraint validation of ANY proposal (PRD §11.1 acceptance criteria).
 * Returns { assignments (cleaned), warnings[], errors[] }.
 */
function validateProposal(proposal, context) {
  const warnings = [];
  const errors = [];
  const staffById = new Map(context.staff.map((s) => [s.id, s]));
  const jobById = new Map(context.unscheduledJobs.map((jb) => [jb.id, jb]));
  const seenUser = new Map(); // user -> job they're already proposed on

  const cleaned = [];
  for (const a of proposal.assignments || []) {
    const jb = jobById.get(Number(a.job_id));
    if (!jb) {
      errors.push(`Proposal referenced unknown/already-scheduled job #${a.job_id} — dropped`);
      continue;
    }
    const users = [];
    for (const uidRaw of a.user_ids || []) {
      const uid = Number(uidRaw);
      const s = staffById.get(uid);
      if (!s) {
        errors.push(`Unknown staff #${uidRaw} proposed on "${jb.title}" — removed`);
        continue;
      }
      if (s.on_holiday) {
        errors.push(`${s.name} is on approved holiday on ${context.forDate} — removed from "${jb.title}"`);
        continue;
      }
      if (s.busy_on.length) {
        errors.push(`${s.name} is already scheduled on another job that day — removed from "${jb.title}"`);
        continue;
      }
      if (seenUser.has(uid)) {
        errors.push(`${s.name} was double-booked in the proposal — kept on first job only`);
        continue;
      }
      seenUser.set(uid, jb.id);
      users.push(uid);
    }
    if (!users.length) {
      warnings.push(`"${jb.title}" ended up with no valid staff after checks`);
      continue;
    }
    // soft checks → warnings
    const teamSkills = users.flatMap((u) => staffById.get(u).skills);
    for (const skill of jb.required_skills || []) {
      if (!teamSkills.includes(skill)) warnings.push(`"${jb.title}": nobody on the team has required skill "${skill}"`);
    }
    if (!users.some((u) => staffById.get(u).is_driver)) warnings.push(`"${jb.title}": no driver on the team`);
    cleaned.push({ ...a, job_id: jb.id, user_ids: users });
  }
  return { assignments: cleaned, warnings, errors };
}

module.exports = { buildContext, ruleSchedule, validateProposal };
