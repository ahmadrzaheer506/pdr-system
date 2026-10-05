// ============================================================
// Scheduling engine (PRD §11.1 support layer).
// ============================================================
const { Op } = require('sequelize');
const { User, HolidayRequest, Job, JobDayAssignment, Customer } = require('../models');
const { plain } = require('../db');

async function buildContext(forDate) {
  const staffRows = await User.findAll({
    where: { role: 'STAFF', active: true },
    attributes: ['id', 'name', 'skills', 'is_driver', 'color'],
  });
  const staff = staffRows.map((s) => {
    const o = plain(s);
    o.skills = Array.isArray(o.skills) ? o.skills : [];
    o.is_driver = !!o.is_driver;
    return o;
  });

  const holidayRows = await HolidayRequest.findAll({
    attributes: ['user_id'],
    where: {
      status: 'approved',
      start_date: { [Op.lte]: forDate },
      end_date: { [Op.gte]: forDate },
    },
  });
  const onHoliday = new Set(holidayRows.map((r) => r.user_id));

  const unscheduledRows = await Job.findAll({
    where: { status: 'PENDING' },
    include: [{ model: Customer, attributes: ['name'] }],
    order: [
      [literalPriority(), 'ASC'],
      ['created_at', 'ASC'],
    ],
  });
  const unscheduledJobs = unscheduledRows.map((jb) => {
    const o = plain(jb);
    o.customer_name = o.Customer?.name;
    o.required_skills = Array.isArray(o.required_skills) ? o.required_skills : [];
    delete o.Customer;
    return o;
  });

  const scheduledRows = await Job.findAll({
    where: {
      status: { [Op.in]: ['SCHEDULED', 'IN_PROGRESS'] },
      start_date: { [Op.lte]: forDate },
      [Op.or]: [
        { end_date: { [Op.gte]: forDate } },
        { end_date: null, start_date: { [Op.gte]: forDate } },
      ],
    },
    include: [{ model: Customer, attributes: ['name'] }],
  });

  const assignmentRows = await JobDayAssignment.findAll({
    where: { work_date: forDate },
    include: [{
      model: Job,
      attributes: ['id', 'status', 'start_date', 'end_date'],
      required: true,
      where: {
        status: { [Op.in]: ['SCHEDULED', 'IN_PROGRESS'] },
      },
    }],
  });

  const busy = new Map();
  for (const r of assignmentRows) {
    if (!busy.has(r.user_id)) busy.set(r.user_id, []);
    busy.get(r.user_id).push(r.job_id);
  }

  const scheduledThatDay = scheduledRows.map((jb) => {
    const o = plain(jb);
    o.customer_name = o.Customer?.name;
    o.assigned = assignmentRows.filter((r) => r.job_id === jb.id).map((r) => r.user_id);
    delete o.Customer;
    return o;
  });

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

function literalPriority() {
  const { literal } = require('sequelize');
  return literal(`CASE "Job"."priority" WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END`);
}

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
  const teamSize = Math.max(1, Math.min(3, Math.floor(pool.length / Math.max(1, jobs.length)) || 1));

  for (const jb of jobs) {
    const team = [];
    const notes = [];
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
    if (!team.some((m) => m.is_driver)) {
      const driver = free().find((s) => s.is_driver);
      if (driver) {
        team.push(driver);
        taken.add(driver.id);
      } else if (team.length) {
        notes.push('no driver available for this team');
      }
    }
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

function proposalConflicts(assignments, context) {
  const staffById = new Map((context.staff || []).map((s) => [s.id, s]));
  const rows = [];
  for (const a of assignments || []) {
    for (const uidRaw of a.user_ids || []) {
      const s = staffById.get(Number(uidRaw));
      if (!s) continue;
      if (s.on_holiday) {
        rows.push({
          user_id: s.id,
          type: 'holiday',
          name: s.name,
          message: `${s.name} is on approved holiday on ${context.forDate}`,
        });
      }
      if ((s.busy_on || []).length) {
        rows.push({
          user_id: s.id,
          type: 'double_book',
          name: s.name,
          message: `${s.name} is already scheduled on another job that day`,
        });
      }
    }
  }
  return rows;
}

function validateProposal(proposal, context, { allowConflicts = false } = {}) {
  const warnings = [];
  const errors = [];
  const staffById = new Map(context.staff.map((s) => [s.id, s]));
  const jobById = new Map(context.unscheduledJobs.map((jb) => [jb.id, jb]));
  const seenUser = new Map();

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
      if (!allowConflicts && s.on_holiday) {
        errors.push(`${s.name} is on approved holiday on ${context.forDate} — removed from "${jb.title}"`);
        continue;
      }
      if (!allowConflicts && s.busy_on.length) {
        errors.push(`${s.name} is already scheduled on another job that day — removed from "${jb.title}"`);
        continue;
      }
      if (!allowConflicts && seenUser.has(uid)) {
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
    const teamSkills = users.flatMap((u) => staffById.get(u).skills);
    for (const skill of jb.required_skills || []) {
      if (!teamSkills.includes(skill)) warnings.push(`"${jb.title}": nobody on the team has required skill "${skill}"`);
    }
    if (!users.some((u) => staffById.get(u).is_driver)) warnings.push(`"${jb.title}": no driver on the team`);
    cleaned.push({ ...a, job_id: jb.id, user_ids: users });
  }
  return { assignments: cleaned, warnings, errors };
}

module.exports = { buildContext, ruleSchedule, validateProposal, proposalConflicts };
