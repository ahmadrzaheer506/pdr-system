// Jobs, assignments, schedule views (PRD §9.5), AI voice scheduling (PRD §11.1)
const express = require('express');
const { db, pj, j, todayStr } = require('../db');
const { requireAuth, requireOffice } = require('../auth');
const { setStage, logActivity } = require('../services/pipeline');
const { buildContext, validateProposal } = require('../services/schedulerEngine');
const ai = require('../integrations/ai');

const router = express.Router();
router.use(requireAuth, requireOffice);

function attachCrew(jobRows) {
  const ids = jobRows.map((j2) => j2.id);
  if (!ids.length) return jobRows;
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT ja.job_id, u.id, u.name, u.color, u.is_driver, u.skills FROM job_assignments ja
     JOIN users u ON u.id = ja.user_id WHERE ja.job_id IN (${placeholders})`
  ).all(...ids);
  const byJob = new Map();
  for (const r of rows) {
    if (!byJob.has(r.job_id)) byJob.set(r.job_id, []);
    byJob.get(r.job_id).push({ id: r.id, name: r.name, color: r.color, is_driver: !!r.is_driver, skills: pj(r.skills, []) });
  }
  return jobRows.map((jb) => ({ ...jb, crew: byJob.get(jb.id) || [] }));
}

router.get('/', (req, res) => {
  const { from, to, status } = req.query;
  let sql = `SELECT j.*, c.name AS customer_name, c.phone FROM jobs j JOIN customers c ON c.id = j.customer_id WHERE 1=1`;
  const params = [];
  if (from) { sql += ' AND date(j.start_date) >= date(?)'; params.push(from); }
  if (to) { sql += ' AND date(j.start_date) <= date(?)'; params.push(to); }
  if (status) { sql += ' AND j.status = ?'; params.push(status); }
  sql += ' ORDER BY j.start_date IS NULL, j.start_date, j.priority';
  let jobs = db.prepare(sql).all(...params).map((jb) => ({ ...jb, required_skills: pj(jb.required_skills, []) }));
  jobs = attachCrew(jobs);
  res.json({ jobs });
});

router.get('/unscheduled', (req, res) => {
  const jobs = db.prepare(
    `SELECT j.*, c.name AS customer_name, c.address AS customer_address FROM jobs j JOIN customers c ON c.id = j.customer_id
     WHERE j.status = 'PENDING' ORDER BY CASE j.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, j.created_at`
  ).all().map((jb) => ({ ...jb, required_skills: pj(jb.required_skills, []) }));
  res.json({ jobs });
});

router.post('/', (req, res) => {
  const { customer_id, title, description, address, priority, required_skills, materials, value, start_date, end_date, start_time, end_time } = req.body || {};
  if (!customer_id || !title) return res.status(400).json({ error: 'customer_id and title required' });
  const r = db.prepare(
    `INSERT INTO jobs (customer_id, title, description, address, priority, required_skills, materials, value, start_date, end_date, start_time, end_time, status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(customer_id, title, description || null, address || null, priority || 'normal', j(required_skills || []), materials || null, value || null,
    start_date || null, end_date || null, start_time || '08:00', end_time || '16:30', start_date ? 'SCHEDULED' : 'PENDING');
  logActivity(customer_id, req.user.id, 'job_created', `Job "${title}" created`, 'job', r.lastInsertRowid);
  res.json({ id: r.lastInsertRowid });
});

router.get('/:id', (req, res) => {
  const jb = db.prepare('SELECT j.*, c.name AS customer_name, c.phone, c.address AS customer_address FROM jobs j JOIN customers c ON c.id = j.customer_id WHERE j.id = ?').get(req.params.id);
  if (!jb) return res.status(404).json({ error: 'Job not found' });
  jb.required_skills = pj(jb.required_skills, []);
  const [withCrew] = attachCrew([jb]);
  const messages = db.prepare('SELECT jm.*, u.name AS user_name, u.color FROM job_messages jm JOIN users u ON u.id = jm.user_id WHERE jm.job_id = ? ORDER BY jm.created_at').all(jb.id);
  res.json({ job: withCrew, messages });
});

router.put('/:id', (req, res) => {
  const jb = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!jb) return res.status(404).json({ error: 'Job not found' });
  const fields = ['title', 'description', 'address', 'priority', 'materials', 'value', 'start_date', 'end_date', 'start_time', 'end_time', 'notes'];
  const updates = {};
  for (const f of fields) if (req.body[f] !== undefined) updates[f] = req.body[f];
  if (req.body.required_skills !== undefined) updates.required_skills = j(req.body.required_skills);
  if (Object.keys(updates).length) {
    const setSql = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
    db.prepare(`UPDATE jobs SET ${setSql}, updated_at = datetime('now') WHERE id = ?`).run(...Object.values(updates), jb.id);
  }
  if (req.body.start_date && jb.status === 'PENDING') {
    db.prepare("UPDATE jobs SET status = 'SCHEDULED' WHERE id = ?").run(jb.id);
    const cust = db.prepare('SELECT stage FROM customers WHERE id = ?').get(jb.customer_id);
    if (cust && ['WON'].includes(cust.stage)) setStage(jb.customer_id, 'SCHEDULED', req.user.id, 'Job dated and scheduled');
  }
  logActivity(jb.customer_id, req.user.id, 'job_updated', `Job "${jb.title}" updated`, 'job', jb.id);
  res.json({ ok: true });
});

router.put('/:id/status', (req, res) => {
  const jb = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!jb) return res.status(404).json({ error: 'Job not found' });
  const { status } = req.body || {};
  const valid = ['PENDING', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'INVOICED', 'PAID'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  db.prepare(`UPDATE jobs SET status = ?, completed_at = CASE WHEN ? = 'COMPLETED' THEN datetime('now') ELSE completed_at END, updated_at = datetime('now') WHERE id = ?`)
    .run(status, status, jb.id);
  const cust = db.prepare('SELECT stage FROM customers WHERE id = ?').get(jb.customer_id);
  if (status === 'COMPLETED' && cust && !['COMPLETED', 'INVOICED', 'PAID'].includes(cust.stage)) {
    setStage(jb.customer_id, 'COMPLETED', req.user.id, `Job "${jb.title}" completed`);
  }
  logActivity(jb.customer_id, req.user.id, 'job_status', `Job "${jb.title}" → ${status}`, 'job', jb.id);
  res.json({ ok: true });
});

/** Assign/unassign crew directly (manual scheduling, PRD §9.5). */
router.put('/:id/assignments', (req, res) => {
  const jb = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!jb) return res.status(404).json({ error: 'Job not found' });
  const { user_ids = [] } = req.body || {};
  db.prepare('DELETE FROM job_assignments WHERE job_id = ?').run(jb.id);
  const stmt = db.prepare('INSERT OR IGNORE INTO job_assignments (job_id, user_id) VALUES (?,?)');
  for (const uid of user_ids) stmt.run(jb.id, uid);
  logActivity(jb.customer_id, req.user.id, 'job_assigned', `Crew updated for "${jb.title}" (${user_ids.length} assigned)`, 'job', jb.id);
  res.json({ ok: true });
});

router.post('/:id/messages', (req, res) => {
  const jb = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!jb) return res.status(404).json({ error: 'Job not found' });
  const { body } = req.body || {};
  if (!body) return res.status(400).json({ error: 'body required' });
  const r = db.prepare('INSERT INTO job_messages (job_id, user_id, body) VALUES (?,?,?)').run(jb.id, req.user.id, body);
  res.json({ id: r.lastInsertRowid });
});

// ---------------- AI voice scheduling (PRD §11.1) ----------------

/** Everything the assistant/rule engine needs for a given date. */
router.get('/ai/context/:date', (req, res) => {
  res.json(buildContext(req.params.date));
});

/** Propose a schedule from a transcript (or blank = just optimise). Always server-validated before returning. */
router.post('/ai/propose', async (req, res) => {
  const { date, transcript } = req.body || {};
  const forDate = date || todayStr();
  const context = buildContext(forDate);
  if (!context.unscheduledJobs.length) {
    return res.json({ provider: 'none', assignments: [], unassigned: [], warnings: [], errors: [], summary: 'No unscheduled jobs waiting — nothing to propose.' });
  }
  try {
    const { provider, proposal } = await ai.proposeSchedule(context, transcript || '');
    const validated = validateProposal(proposal, context);
    const r = db.prepare(
      'INSERT INTO ai_proposals (for_date, transcript, provider, proposal, warnings, created_by) VALUES (?,?,?,?,?,?)'
    ).run(forDate, transcript || null, provider, j({ ...proposal, assignments: validated.assignments }), j([...validated.warnings, ...validated.errors]), req.user.id);
    res.json({
      proposal_id: r.lastInsertRowid,
      provider,
      for_date: forDate,
      assignments: validated.assignments,
      unassigned: proposal.unassigned || [],
      warnings: validated.warnings,
      errors: validated.errors,
      summary: proposal.summary,
      context,
    });
  } catch (err) {
    res.status(500).json({ error: `Scheduling assistant failed: ${err.message}` });
  }
});

/** Paul approves (possibly edited) assignments → writes real Job/assignment records. */
router.post('/ai/approve', (req, res) => {
  const { proposal_id, assignments = [] } = req.body || {};
  const context = buildContext(req.body.date || todayStr());
  const { assignments: clean, errors } = validateProposal({ assignments }, context);
  if (errors.length) return res.status(400).json({ error: 'Some assignments failed validation', errors });

  const tx = db.transaction((rows) => {
    for (const a of rows) {
      db.prepare("UPDATE jobs SET status = 'SCHEDULED', start_date = COALESCE(start_date, ?), start_time = ?, end_time = ?, updated_at = datetime('now') WHERE id = ?")
        .run(context.forDate, a.start_time || '08:00', a.end_time || '16:30', a.job_id);
      db.prepare('DELETE FROM job_assignments WHERE job_id = ?').run(a.job_id);
      const stmt = db.prepare('INSERT OR IGNORE INTO job_assignments (job_id, user_id) VALUES (?,?)');
      for (const uid of a.user_ids) stmt.run(a.job_id, uid);
      const jb = db.prepare('SELECT customer_id, title FROM jobs WHERE id = ?').get(a.job_id);
      if (jb) {
        const cust = db.prepare('SELECT stage FROM customers WHERE id = ?').get(jb.customer_id);
        if (cust && cust.stage === 'WON') setStage(jb.customer_id, 'SCHEDULED', req.user.id, 'Scheduled via AI assistant');
        logActivity(jb.customer_id, req.user.id, 'job_scheduled', `"${jb.title}" scheduled via AI assistant for ${context.forDate}`, 'job', a.job_id);
      }
    }
  });
  tx(clean);

  if (proposal_id) {
    db.prepare("UPDATE ai_proposals SET status = 'approved', approved_at = datetime('now'), proposal = ? WHERE id = ?")
      .run(j({ assignments: clean }), proposal_id);
  }
  res.json({ ok: true, scheduled: clean.length });
});

router.get('/ai/proposals', (req, res) => {
  const rows = db.prepare('SELECT * FROM ai_proposals ORDER BY id DESC LIMIT 30').all()
    .map((r) => ({ ...r, proposal: pj(r.proposal, {}), warnings: pj(r.warnings, []) }));
  res.json({ proposals: rows });
});

module.exports = router;
